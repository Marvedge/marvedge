// Localized subtitle resizing — Task-00061.
//
// When a subtitle cue is translated into a target language the translated text
// is almost always a different number of characters than the source. Two
// independent problems follow:
//
//   1. CHARACTER DENSITY.  The source cue was shown for exactly as long as the
//      speaker said it. If the translation is much longer, a viewer has to read
//      faster than is comfortable (or the subtitle disappears before they finish).
//      `retimeTranslatedCues` detects cues whose char/s exceeds a threshold and
//      extends their display window by borrowing from the silence gap before the
//      next cue. It never overlaps adjacent cues and never moves the last frame
//      of a cue backward — timings only grow, and only into existing gaps.
//
//   2. FONT OVERFLOW.  A translated cue that is twice as wide as the source
//      either wraps to an extra line (changing the layout the user approved) or
//      clips against the frame edge. `scaleFontForTranslation` computes a
//      per-cue font-size percentage that keeps the rendered text inside the same
//      bounding box by reducing the size in proportion to the expansion.
//
// Both functions are pure and isomorphic: no DOM, no fs, no env, no network.
// They are called by `applyTranslations` (translate.ts) and consumed by the
// preview (style.ts) and the ASS burn-in (cloudrun-worker/server.js).
//
// DESIGN DECISIONS
// ----------------
// Character count as the expansion proxy
//   Pixel width varies by font, rendering engine and kerning. All three differ
//   between the browser preview and libass, and between languages that share the
//   same Unicode block. Character count is a coarser proxy but the same number
//   everywhere, which is the property that makes the preview and the export
//   agree. A 20% error in the proxy is fine — the output is "slightly smaller
//   than ideal" rather than "clipped on screen".
//
// Borrow only from the GAP, never from adjacent cues
//   The next cue's start time is fixed by the speaker who said it. Pushing it
//   back would shift the subtitle to audio it is not captioning. Borrowing from
//   the silence in between is always safe: silence has no subtitles, so
//   extending one cue into it cannot cause overlap.
//
// Font scale only shrinks, never enlarges
//   A short translation (e.g. Japanese → English) would technically deserve a
//   larger font so it fills the same visual space. But the style panel already
//   gives the user explicit control over the font size, and silently enlarging
//   a cue they did not ask to resize would surprise them. Shrinking is safe
//   because the text always fits; enlarging is not.

import type { SubtitleCue } from "./types";
import { SUBTITLE_FONT_PCT_MAX, SUBTITLE_FONT_PCT_MIN } from "./style";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Characters-per-second above which a translated cue is considered too dense
 * to read comfortably and is eligible for time-borrowing.
 *
 * 20 chars/s is a well-established broadcast standard for subtitle readability
 * (EBU R37 / TED Talks subtitle guidelines both cite 17–21 chars/s as the
 * comfortable reading speed for adult native speakers). We use 20 as the
 * ceiling: a cue comfortably under that threshold is left unchanged.
 */
export const MAX_CHARS_PER_SECOND = 20;

/**
 * The most of a silence gap that can be borrowed for a single cue, as a
 * fraction of the gap's total length.
 *
 * 0.75 leaves at least 25% of the gap as breathing room before the next cue
 * appears, which prevents translated subtitles from feeling like they are
 * running directly into each other even after retiming.
 */
export const MAX_GAP_BORROW_RATIO = 0.75;

/**
 * Expansion ratio below which font scaling is skipped.
 *
 * A translation that is ≤ 110% of the source character count does not need a
 * font adjustment — the difference is invisible on screen. This prevents
 * unnecessary per-cue font overrides that would make ASS files larger without
 * any perceptible benefit.
 */
export const EXPANSION_SCALE_THRESHOLD = 1.1;

/* -------------------------------------------------------------------------- */
/* Core measurements                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Character-length expansion ratio of a translated cue relative to its source.
 *
 * Returns `translatedLength / sourceLength`. A ratio of 1.0 means the texts
 * are the same length; 2.0 means the translation is twice as long.
 *
 * Edge cases:
 *   - An empty source string returns 1.0 (no expansion — avoids division by
 *     zero and treats "nothing → nothing" as unchanged).
 *   - Whitespace-only strings are treated as empty after trimming.
 */
export function measureExpansionRatio(sourceText: string, translatedText: string): number {
  const sourceLen = sourceText.trim().length;
  const translatedLen = translatedText.trim().length;
  if (sourceLen === 0) return 1;
  return translatedLen / sourceLen;
}

/**
 * Characters per second for a cue.
 *
 * Returns 0 for zero-duration cues (rather than infinity), since a degenerate
 * cue has no readability problem — it simply never appears.
 */
export function charsPerSecond(cue: SubtitleCue): number {
  const duration = cue.end - cue.start;
  if (duration <= 0) return 0;
  return cue.text.trim().length / duration;
}

/* -------------------------------------------------------------------------- */
/* Font scaling                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Per-cue font size (as a percentage of frame height) for a translated cue.
 *
 * When the translated text is significantly longer than the source, the font
 * is reduced proportionally so the text occupies the same approximate visual
 * width. The result is clamped to `[SUBTITLE_FONT_PCT_MIN, SUBTITLE_FONT_PCT_MAX]`
 * so the output is always a valid style value.
 *
 * Returns `undefined` when no scaling is needed (ratio ≤ `EXPANSION_SCALE_THRESHOLD`),
 * which signals the consumer to use the track-level style value unchanged.
 *
 * @param baseFontSizePct  The track-level font size percentage (from the style).
 * @param expansionRatio   From `measureExpansionRatio`.
 */
export function scaleFontForTranslation(
  baseFontSizePct: number,
  expansionRatio: number
): number | undefined {
  if (expansionRatio <= EXPANSION_SCALE_THRESHOLD) {
    return undefined; // No override needed.
  }
  const scaled = baseFontSizePct / expansionRatio;
  const clamped = Math.max(SUBTITLE_FONT_PCT_MIN, Math.min(SUBTITLE_FONT_PCT_MAX, scaled));
  // Round to 4 decimal places to keep the ASS and CSS values clean.
  return Math.round(clamped * 10_000) / 10_000;
}

/* -------------------------------------------------------------------------- */
/* Timestamp retiming                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Extend translated cues that are too character-dense to read comfortably,
 * by borrowing display time from the silence gap before the next cue.
 *
 * Rules (all invariants must hold after the function returns):
 *   1. Cue ORDER is unchanged.
 *   2. A cue's `start` is NEVER moved — only `end` grows.
 *   3. A cue's new `end` NEVER exceeds the next cue's `start`.
 *   4. No more than `MAX_GAP_BORROW_RATIO` of a gap is consumed.
 *   5. The last cue's `end` is capped at `videoDurationSeconds` when provided.
 *   6. Cues already within the comfort threshold are left byte-identical.
 *
 * @param cues                 Translated cues, positionally aligned with source.
 * @param videoDurationSeconds Optional video duration ceiling for the last cue.
 */
export function retimeTranslatedCues(
  cues: readonly SubtitleCue[],
  videoDurationSeconds?: number
): SubtitleCue[] {
  if (cues.length === 0) return [];

  const out: SubtitleCue[] = cues.map((c) => ({ ...c }));

  for (let i = 0; i < out.length; i++) {
    const cue = out[i];
    const density = charsPerSecond(cue);

    // Cue is already within readable range — skip.
    if (density <= MAX_CHARS_PER_SECOND) continue;

    // Compute the display time the text actually needs for comfortable reading.
    const neededDuration = cue.text.trim().length / MAX_CHARS_PER_SECOND;
    const currentDuration = cue.end - cue.start;
    const deficit = neededDuration - currentDuration;

    if (deficit <= 0) continue; // Already long enough (shouldn't happen given the density check).

    // Determine the ceiling for this cue's `end`.
    let ceiling: number;
    if (i + 1 < out.length) {
      const nextStart = out[i + 1].start;
      const gap = nextStart - cue.end;
      if (gap <= 0) continue; // No gap to borrow — leave unchanged.
      ceiling = cue.end + gap * MAX_GAP_BORROW_RATIO;
    } else {
      // Last cue: borrow up to the video end if we know it.
      ceiling =
        typeof videoDurationSeconds === "number" && videoDurationSeconds > cue.end
          ? videoDurationSeconds
          : cue.end + deficit; // Unknown duration: extend freely.
    }

    // Apply the smaller of what we need and what is available.
    const newEnd = Math.min(cue.end + deficit, ceiling);
    if (newEnd > cue.end) {
      out[i] = { ...cue, end: Math.round(newEnd * 1000) / 1000 };
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Batch helper — used by applyTranslations                                    */
/* -------------------------------------------------------------------------- */

export interface LocalizedCue extends SubtitleCue {
  /**
   * Per-cue font-size override (percentage of frame height).
   *
   * Present only when the translated text is long enough to need a smaller
   * font. The preview and the ASS burn-in read this instead of the track-level
   * `fontSizePct` when it is set.
   */
  fontSizePct?: number;
}

/**
 * Apply both localization transforms to a batch of translated cues in one pass.
 *
 * This is the single entry point for the translation pipeline — calling it
 * separately for retiming and for font scaling would require two traversals of
 * the same array and two opportunities to introduce ordering mistakes.
 *
 * @param sourceCues          Original (source-language) cues, for expansion measurement.
 * @param translatedCues      Already translated cues from `applyTranslations`.
 * @param baseFontSizePct     Track-level font size, from the active subtitle style.
 * @param videoDurationSeconds Video ceiling for last-cue retiming (optional).
 */
export function localizeTranslatedCues(
  sourceCues: readonly SubtitleCue[],
  translatedCues: readonly SubtitleCue[],
  baseFontSizePct: number,
  videoDurationSeconds?: number
): LocalizedCue[] {
  if (sourceCues.length !== translatedCues.length) {
    // Alignment mismatch — return translated cues unchanged. The alignment
    // invariant is enforced upstream in applyTranslations; if it arrives broken
    // here, something went very wrong and we should not compound the error.
    return translatedCues.map((c) => ({ ...c }));
  }

  // Step 1: retiming (adjusts `end` timestamps in-place on a copy).
  const retimed = retimeTranslatedCues(translatedCues, videoDurationSeconds);

  // Step 2: per-cue font scaling.
  return retimed.map((cue, i) => {
    const ratio = measureExpansionRatio(sourceCues[i].text, cue.text);
    const fontOverride = scaleFontForTranslation(baseFontSizePct, ratio);
    if (fontOverride === undefined) return cue;
    return { ...cue, fontSizePct: fontOverride };
  });
}
