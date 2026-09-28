// Subtitle translation: the pure half (PRD §6.7 / US-4).
//
// Everything here is provider-agnostic and side-effect free — no OpenAI import,
// no env, no network. The route (app/api/subtitles/translate/route.ts) owns the
// API call and the key; this module owns the two things that decide whether a
// translated track is correct rather than merely present:
//
//   1. TIMINGS ARE NEVER TRANSLATED. `applyTranslations` copies `start` and
//      `end` across verbatim and replaces `text` only. The model is never shown
//      a timestamp, never asked to re-time anything, and its output is never
//      consulted about ordering.
//   2. ALIGNMENT IS VERIFIED, NOT ASSUMED. `parseTranslationBatch` requires the
//      response to carry exactly the indices it was given — no more, no fewer,
//      no duplicates — and THROWS otherwise.
//
// Rule 2 is a deliberate departure from app/api/avs/script/route.ts, which
// silently falls back to the original text when the model drops a segment. That
// is right for a tone rewrite: the worst case is an un-rewritten line. It is
// wrong here. If cue 40 goes missing and everything after it shifts up by one,
// every remaining subtitle is shown against the wrong audio for the rest of the
// video — a demo that is worse than having no translation at all, and worse
// still because it looks fine until someone watches to the end. Failing loudly
// turns a silent, invisible corruption into a visible, retryable error.

import type { SubtitleCue } from "./types";
import { localizeTranslatedCues } from "./resizing";

/**
 * Cues per OpenAI request.
 *
 * Small enough that one refusal or truncation costs a retry of ~40 cues rather
 * than the whole video, and that the response stays well inside the model's
 * output limit (a batch is bounded by roughly 40 × 56 characters of source text
 * — the worker's own cue-length cap — plus the translation's expansion).
 * Large enough that a 10-minute demo (~150 cues) is four requests, not fifty.
 */
export const TRANSLATION_BATCH_SIZE = 40;

/** One cue handed to the model: its index in the batch and the text to translate. */
export interface TranslationSegment {
  i: number;
  text: string;
}

/** Split cues into batches of `size`, preserving order. */
export function buildTranslationBatches(
  cues: readonly SubtitleCue[],
  size: number = TRANSLATION_BATCH_SIZE
): SubtitleCue[][] {
  const batchSize = Math.max(1, Math.floor(size));
  const batches: SubtitleCue[][] = [];
  for (let i = 0; i < cues.length; i += batchSize) {
    batches.push(cues.slice(i, i + batchSize));
  }
  return batches;
}

/** The request payload for one batch: index + text, never timings. */
export function toTranslationSegments(cues: readonly SubtitleCue[]): TranslationSegment[] {
  return cues.map((cue, i) => ({ i, text: cue.text }));
}

/** Raised when a model response cannot be trusted to line up with its input. */
export class TranslationAlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationAlignmentError";
  }
}

/**
 * Read one batch's response into `[index, text]` pairs, verifying alignment.
 *
 * Throws `TranslationAlignmentError` unless the response contains exactly one
 * usable entry for every index `0..expectedCount-1`. Checked explicitly:
 *
 *   - the payload parses and carries a `segments` array;
 *   - every entry has an integer `i` within range and a non-empty `text`;
 *   - no index appears twice;
 *   - no index is missing.
 *
 * A count check alone would not be enough — a response that drops index 7 and
 * repeats index 8 has the right length and the wrong content.
 */
export function parseTranslationBatch(content: string, expectedCount: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TranslationAlignmentError(
      "The translation service returned a response that was not valid JSON."
    );
  }

  const segments =
    parsed && typeof parsed === "object" ? (parsed as { segments?: unknown }).segments : undefined;
  if (!Array.isArray(segments)) {
    throw new TranslationAlignmentError(
      "The translation service returned no segments for a batch of subtitles."
    );
  }

  const byIndex = new Map<number, string>();
  for (const entry of segments) {
    if (!entry || typeof entry !== "object") {
      throw new TranslationAlignmentError(
        "The translation service returned a malformed subtitle entry."
      );
    }
    const rec = entry as Record<string, unknown>;
    const i = Number(rec.i);
    // Nothing is skipped. An entry we cannot place is a signal the model
    // invented or reshaped content, which is exactly the case where the
    // segments we CAN place no longer deserve the benefit of the doubt.
    if (!Number.isInteger(i) || i < 0 || i >= expectedCount) {
      throw new TranslationAlignmentError(
        `The translation service returned subtitle index ${String(rec.i)}, which is not one of ` +
          `the ${expectedCount} it was given. Refusing to save a track built from a response ` +
          "that does not match the request."
      );
    }
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    if (!text) {
      throw new TranslationAlignmentError(
        `The translation service returned an empty translation for subtitle ${i}. ` +
          "Refusing to save a track with a blank line where the audio has speech."
      );
    }
    if (byIndex.has(i)) {
      throw new TranslationAlignmentError(
        `The translation service returned subtitle ${i} more than once. ` +
          "Refusing to save a track whose lines may not match the audio."
      );
    }
    byIndex.set(i, text);
  }

  if (byIndex.size !== expectedCount) {
    const missing: number[] = [];
    for (let i = 0; i < expectedCount; i++) {
      if (!byIndex.has(i)) {
        missing.push(i);
      }
    }
    throw new TranslationAlignmentError(
      `The translation service returned ${byIndex.size} of ${expectedCount} subtitles ` +
        `(missing ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}). ` +
        "Refusing to save a track whose lines would be shifted against the audio."
    );
  }

  const out: string[] = [];
  for (let i = 0; i < expectedCount; i++) {
    out.push(byIndex.get(i) as string);
  }
  return out;
}

/**
 * Options for `applyTranslations` — both are opt-in to preserve
 * backward compatibility: existing callers that pass no options get
 * the original behaviour (timings copied, text replaced, nothing else).
 */
export interface LocalizeOptions {
  /**
   * Run `localizeTranslatedCues` to auto-scale fonts and retime dense cues.
   * Pass the track-level `fontSizePct` as `baseFontSizePct` when enabling.
   */
  localize?: boolean;
  /** Font-size percentage used as the base for per-cue scaling. */
  baseFontSizePct?: number;
  /** Video length ceiling for last-cue retiming. */
  videoDurationSeconds?: number;
}

/**
 * Rebuild a cue list with translated text and the ORIGINAL timings.
 *
 * `translations` must be positionally aligned with `cues` — which is what
 * `parseTranslationBatch` guarantees per batch. The length check is a last
 * backstop against a caller concatenating batches wrongly.
 *
 * When `options.localize` is true, the result is additionally processed by
 * `localizeTranslatedCues`, which:
 *   - retimes cues whose character density exceeds the readability threshold
 *     (borrows from silence gaps, never overlaps adjacent cues), and
 *   - attaches a per-cue `fontSizePct` override when the translated text is
 *     significantly longer than the source.
 */
export function applyTranslations(
  cues: readonly SubtitleCue[],
  translations: readonly string[],
  options: LocalizeOptions = {}
): SubtitleCue[] {
  if (cues.length !== translations.length) {
    throw new TranslationAlignmentError(
      `Translated ${translations.length} lines for ${cues.length} subtitles. ` +
        "Refusing to save a misaligned track."
    );
  }
  const raw = cues.map((cue, i) => ({
    // Timings are copied, never derived and never round-tripped through the
    // model. A translated track is the source track with different words.
    start: cue.start,
    end: cue.end,
    text: translations[i],
  }));

  if (options.localize) {
    return localizeTranslatedCues(
      cues,
      raw,
      options.baseFontSizePct ?? 5, // DEFAULT_SUBTITLE_STYLE.fontSizePct
      options.videoDurationSeconds
    );
  }

  return raw;
}

/** System prompt. Kept here so the rules and the validation live side by side. */
export const TRANSLATION_SYSTEM_PROMPT =
  "You are a professional subtitle translator. You translate subtitle lines from one " +
  "language to another. Rules: translate the meaning naturally rather than word for word; " +
  "keep each line short enough to read on screen; preserve the exact number of segments and " +
  "their indices; never merge, split, reorder, drop or add segments; never output timestamps; " +
  "never add commentary, labels, headings, or markdown. If a segment cannot be translated, " +
  "repeat it unchanged rather than omitting it. Respond with strict JSON only.";

/** User prompt for one batch. */
export function buildTranslationPrompt(
  segments: readonly TranslationSegment[],
  sourceLabel: string,
  targetLabel: string
): string {
  return (
    `Translate every segment below from ${sourceLabel} into ${targetLabel}.\n` +
    'Return JSON of the exact form {"segments":[{"i":<same index>,"text":<translated text>}]}, ' +
    `with exactly one entry for each of the ${segments.length} input indices and nothing else.\n\n` +
    JSON.stringify({ segments })
  );
}
