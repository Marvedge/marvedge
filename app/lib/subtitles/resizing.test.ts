import { describe, expect, it } from "vitest";

import {
  EXPANSION_SCALE_THRESHOLD,
  MAX_CHARS_PER_SECOND,
  MAX_GAP_BORROW_RATIO,
  charsPerSecond,
  localizeTranslatedCues,
  measureExpansionRatio,
  retimeTranslatedCues,
  scaleFontForTranslation,
} from "./resizing";
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_FONT_PCT_MAX, SUBTITLE_FONT_PCT_MIN } from "./style";
import type { SubtitleCue } from "./types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function cue(start: number, end: number, text: string): SubtitleCue {
  return { start, end, text };
}

const BASE_FONT = DEFAULT_SUBTITLE_STYLE.fontSizePct; // 5 (5% of frame height)

/* -------------------------------------------------------------------------- */
/* measureExpansionRatio                                                        */
/* -------------------------------------------------------------------------- */

describe("measureExpansionRatio", () => {
  it("returns 1.0 for identical texts", () => {
    expect(measureExpansionRatio("Hello", "Hello")).toBe(1);
  });

  it("returns 1.0 for an empty source (avoids division by zero)", () => {
    expect(measureExpansionRatio("", "anything")).toBe(1);
    expect(measureExpansionRatio("  ", "anything")).toBe(1);
  });

  it("returns 1.0 for an empty translation of an empty source", () => {
    expect(measureExpansionRatio("", "")).toBe(1);
  });

  it("measures a 2× expansion correctly", () => {
    // 4 chars → 8 chars
    expect(measureExpansionRatio("abcd", "abcdefgh")).toBeCloseTo(2, 5);
  });

  it("measures a contraction (< 1.0)", () => {
    // 10 chars → 5 chars
    expect(measureExpansionRatio("Hello dear", "Hallo")).toBeCloseTo(0.5, 5);
  });

  it("trims leading and trailing whitespace before measuring", () => {
    // "  Hi  " → 2 effective chars; "  Hello  " → 5
    expect(measureExpansionRatio("  Hi  ", "  Hello  ")).toBeCloseTo(2.5, 5);
  });

  it("handles CJK characters (each counted as one character)", () => {
    // 5 ASCII → 2 CJK
    expect(measureExpansionRatio("Hello", "こんにちは")).toBeCloseTo(1, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* charsPerSecond                                                              */
/* -------------------------------------------------------------------------- */

describe("charsPerSecond", () => {
  it("returns chars divided by duration", () => {
    // "Hello World" = 11 chars, 2s duration → 5.5 chars/s
    expect(charsPerSecond(cue(0, 2, "Hello World"))).toBeCloseTo(5.5, 5);
  });

  it("returns 0 for a zero-duration cue", () => {
    expect(charsPerSecond(cue(1, 1, "text"))).toBe(0);
  });

  it("returns 0 for a negative-duration cue", () => {
    expect(charsPerSecond(cue(2, 1, "text"))).toBe(0);
  });

  it("trims text before counting chars", () => {
    // "  Hi  " → 2 chars; 1s → 2 chars/s
    expect(charsPerSecond(cue(0, 1, "  Hi  "))).toBeCloseTo(2, 5);
  });

  it("handles a 10-char cue over 0.5s (above readability threshold)", () => {
    expect(charsPerSecond(cue(5, 5.5, "0123456789"))).toBeCloseTo(20, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* scaleFontForTranslation                                                     */
/* -------------------------------------------------------------------------- */

describe("scaleFontForTranslation", () => {
  it("returns undefined when expansion is at or below the threshold", () => {
    expect(scaleFontForTranslation(BASE_FONT, 1.0)).toBeUndefined();
    expect(scaleFontForTranslation(BASE_FONT, EXPANSION_SCALE_THRESHOLD)).toBeUndefined();
    expect(scaleFontForTranslation(BASE_FONT, 1.05)).toBeUndefined();
  });

  it("returns a scaled value for a 1.5× expansion", () => {
    // BASE_FONT / 1.5 — should be within bounds.
    const scaled = scaleFontForTranslation(BASE_FONT, 1.5);
    expect(scaled).toBeDefined();
    expect(scaled as number).toBeCloseTo(BASE_FONT / 1.5, 3);
  });

  it("returns a scaled value for a 2× expansion", () => {
    const scaled = scaleFontForTranslation(BASE_FONT, 2);
    expect(scaled).toBeDefined();
    expect(scaled as number).toBeCloseTo(BASE_FONT / 2, 3);
  });

  it("clamps at SUBTITLE_FONT_PCT_MIN for extreme expansions", () => {
    // A 100× expansion would scale the font to near zero — it must clamp.
    const scaled = scaleFontForTranslation(BASE_FONT, 100);
    expect(scaled).toBeCloseTo(SUBTITLE_FONT_PCT_MIN, 3);
  });

  it("never exceeds SUBTITLE_FONT_PCT_MAX (contraction path stays disabled)", () => {
    // Contraction ratio (< 1) doesn't scale up, but just in case a caller
    // passes one the clamp must still hold.
    const scaled = scaleFontForTranslation(BASE_FONT, 0.01);
    // ratio < threshold → undefined
    expect(scaled).toBeUndefined();
  });

  it("a very large base font clamped down to max", () => {
    const scaled = scaleFontForTranslation(SUBTITLE_FONT_PCT_MAX, 1.2);
    expect(scaled).toBeDefined();
    const val = scaled as number;
    expect(val).toBeLessThanOrEqual(SUBTITLE_FONT_PCT_MAX);
    expect(val).toBeGreaterThanOrEqual(SUBTITLE_FONT_PCT_MIN);
  });

  it("returns a number rounded to at most 4 decimal places", () => {
    const scaled = scaleFontForTranslation(BASE_FONT, 3) as number;
    const decimals = scaled.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});

/* -------------------------------------------------------------------------- */
/* retimeTranslatedCues                                                        */
/* -------------------------------------------------------------------------- */

describe("retimeTranslatedCues", () => {
  it("returns an empty array unchanged", () => {
    expect(retimeTranslatedCues([])).toEqual([]);
  });

  it("leaves a comfortable cue unchanged", () => {
    // 5 chars over 2s = 2.5 chars/s — well below threshold.
    const input = [cue(0, 2, "Hello")];
    expect(retimeTranslatedCues(input)).toEqual(input);
  });

  it("extends an over-dense cue into the following gap", () => {
    // "Esta es una frase demasiado larga" = 33 chars over 1s = 33 chars/s > 20.
    // Next cue starts at 5.0. Gap = 4s. borrow up to 75% = 3s.
    // Needed duration = 33/20 = 1.65s. deficit = 0.65s.
    // ceiling = 1 + 3 = 4.0s. New end = min(1 + 0.65, 4.0) = 1.65s.
    const input = [
      cue(0, 1, "Esta es una frase demasiado larga"),
      cue(5, 7, "Next cue"),
    ];
    const out = retimeTranslatedCues(input);
    expect(out[0].end).toBeGreaterThan(1);
    expect(out[0].end).toBeLessThanOrEqual(5); // never past next cue's start
    expect(out[1].start).toBe(5); // next cue is untouched
  });

  it("never extends a cue past the next cue's start", () => {
    // Dense cue immediately followed by another — no gap.
    const longText = "A".repeat(100); // 100 chars over 1s = 100 chars/s
    const input = [cue(0, 1, longText), cue(1, 3, "next")];
    const out = retimeTranslatedCues(input);
    expect(out[0].end).toBeLessThanOrEqual(out[1].start);
  });

  it("leaves a cue unchanged when there is no gap to borrow", () => {
    const longText = "A".repeat(100);
    const input = [cue(0, 1, longText), cue(1, 3, "next")]; // gap = 0
    const out = retimeTranslatedCues(input);
    expect(out[0].end).toBe(1); // unchanged
  });

  it("respects MAX_GAP_BORROW_RATIO", () => {
    // 100-char cue over 1s. Next cue starts at 11s. Gap = 10s.
    // Max borrow = 10 * 0.75 = 7.5s. Ceiling = 1 + 7.5 = 8.5s.
    // Needed = 100/20 = 5s. deficit = 4s.
    // New end = min(1 + 4, 8.5) = 5.0.
    const input = [cue(0, 1, "A".repeat(100)), cue(11, 13, "far away")];
    const out = retimeTranslatedCues(input);
    const maxBorrowed = 1 + (11 - 1) * MAX_GAP_BORROW_RATIO;
    expect(out[0].end).toBeLessThanOrEqual(maxBorrowed);
    expect(out[1].start).toBe(11);
  });

  it("never moves a cue's start backward", () => {
    const input = [cue(3, 4, "A".repeat(60)), cue(10, 12, "next")];
    const out = retimeTranslatedCues(input);
    expect(out[0].start).toBe(3);
  });

  it("caps the last cue at videoDurationSeconds", () => {
    // Last cue: dense text, no successor, video ends at 5s.
    const input = [cue(3, 4, "A".repeat(80))];
    const out = retimeTranslatedCues(input, 5);
    expect(out[0].end).toBeLessThanOrEqual(5);
  });

  it("extends the last cue freely when videoDurationSeconds is not provided", () => {
    const input = [cue(3, 4, "A".repeat(80))];
    const out = retimeTranslatedCues(input);
    // Should be extended to needed duration without a hard cap.
    expect(out[0].end).toBeGreaterThan(4);
  });

  it("leaves start of all non-first cues unchanged", () => {
    const input = [
      cue(0, 0.5, "A".repeat(50)),
      cue(2, 3, "B".repeat(40)),
      cue(5, 6, "C".repeat(20)),
    ];
    const out = retimeTranslatedCues(input);
    expect(out[1].start).toBe(2);
    expect(out[2].start).toBe(5);
  });

  it("handles a single comfortable cue with no video duration", () => {
    const input = [cue(0, 5, "Hi there")];
    expect(retimeTranslatedCues(input)).toEqual(input);
  });

  it("rounds extended end times to 3 decimal places", () => {
    // Ensures clean ASS Dialogue timestamps rather than floating-point noise.
    const input = [cue(0, 1, "A".repeat(40)), cue(10, 11, "next")];
    const out = retimeTranslatedCues(input);
    const decimals = out[0].end.toString().split(".")[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(3);
  });

  it("does not mutate the input array", () => {
    const input = [cue(0, 1, "A".repeat(80)), cue(5, 6, "next")];
    const original = JSON.stringify(input);
    retimeTranslatedCues(input);
    expect(JSON.stringify(input)).toBe(original);
  });
});

/* -------------------------------------------------------------------------- */
/* localizeTranslatedCues                                                      */
/* -------------------------------------------------------------------------- */

describe("localizeTranslatedCues", () => {
  it("returns cues unchanged when source and translation are the same length", () => {
    const source = [cue(0, 5, "Hello world ok"), cue(6, 9, "Good bye")];
    const translated = [cue(0, 5, "Hola mundo ok!"), cue(6, 9, "Adiós!")];
    const out = localizeTranslatedCues(source, translated, BASE_FONT);
    // Expansion ≈ 1.0 → no font override. Density ok → no retiming.
    expect(out[0].fontSizePct).toBeUndefined();
    expect(out[1].fontSizePct).toBeUndefined();
    expect(out[0].end).toBe(translated[0].end);
    expect(out[1].end).toBe(translated[1].end);
  });

  it("adds a fontSizePct when expansion exceeds threshold", () => {
    const shortSource = [cue(0, 5, "Hi")]; // 2 chars
    const longTranslated = [cue(0, 5, "A".repeat(20))]; // 10× expansion
    const out = localizeTranslatedCues(shortSource, longTranslated, BASE_FONT);
    expect(out[0].fontSizePct).toBeDefined();
    expect(out[0].fontSizePct as number).toBeLessThan(BASE_FONT);
  });

  it("extends dense translated cues into the gap", () => {
    const source = [cue(0, 5, "Short text here"), cue(10, 12, "end")];
    // 60 chars over 5s = 12 chars/s is fine for source.
    // But translated is 100 chars over 5s = 20 chars/s — right at threshold.
    const translated = [cue(0, 5, "A".repeat(100)), cue(10, 12, "end")];
    const out = localizeTranslatedCues(source, translated, BASE_FONT, 15);
    // Should borrow into the 5s gap (5→10).
    expect(out[0].end).toBeGreaterThanOrEqual(5);
    expect(out[0].end).toBeLessThanOrEqual(10);
  });

  it("gracefully handles misaligned arrays (returns translated unchanged)", () => {
    const source = [cue(0, 1, "one"), cue(2, 3, "two")];
    const translated = [cue(0, 1, "uno")]; // mismatched length
    const out = localizeTranslatedCues(source, translated, BASE_FONT);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("uno");
  });

  it("does not mutate the source or translated input arrays", () => {
    const source = [cue(0, 1, "Hi"), cue(5, 6, "ok")];
    const translated = [cue(0, 1, "A".repeat(30)), cue(5, 6, "B".repeat(30))];
    const srcStr = JSON.stringify(source);
    const trnStr = JSON.stringify(translated);
    localizeTranslatedCues(source, translated, BASE_FONT);
    expect(JSON.stringify(source)).toBe(srcStr);
    expect(JSON.stringify(translated)).toBe(trnStr);
  });

  it("applies both retiming AND font scaling to the same cue", () => {
    // 80-char translation over 1s = 80 chars/s (way above threshold).
    // Source is 4 chars — 20× expansion (well above 1.1 threshold).
    const source = [cue(0, 1, "Hi!!"), cue(10, 11, "end")];
    const translated = [cue(0, 1, "A".repeat(80)), cue(10, 11, "end")];
    const out = localizeTranslatedCues(source, translated, BASE_FONT, 15);
    // Font should be scaled down.
    expect(out[0].fontSizePct).toBeDefined();
    expect(out[0].fontSizePct as number).toBeLessThan(BASE_FONT);
    // End should be extended.
    expect(out[0].end).toBeGreaterThan(1);
  });

  it("caps the localized font at SUBTITLE_FONT_PCT_MIN for extreme expansion", () => {
    const source = [cue(0, 5, "Hi")]; // 2 chars
    const translated = [cue(0, 5, "A".repeat(2000))]; // 1000× expansion
    const out = localizeTranslatedCues(source, translated, BASE_FONT);
    expect(out[0].fontSizePct).toBeCloseTo(SUBTITLE_FONT_PCT_MIN, 3);
  });

  it("respects videoDurationSeconds for the last cue's retiming", () => {
    const source = [cue(0, 1, "Hi")];
    const translated = [cue(0, 1, "A".repeat(80))]; // dense last cue
    const out = localizeTranslatedCues(source, translated, BASE_FONT, 3);
    expect(out[0].end).toBeLessThanOrEqual(3);
  });
});

/* -------------------------------------------------------------------------- */
/* Constants are self-consistent                                               */
/* -------------------------------------------------------------------------- */

describe("module constants", () => {
  it("MAX_CHARS_PER_SECOND is a positive number", () => {
    expect(MAX_CHARS_PER_SECOND).toBeGreaterThan(0);
  });

  it("MAX_GAP_BORROW_RATIO is between 0 and 1 exclusive", () => {
    expect(MAX_GAP_BORROW_RATIO).toBeGreaterThan(0);
    expect(MAX_GAP_BORROW_RATIO).toBeLessThan(1);
  });

  it("EXPANSION_SCALE_THRESHOLD is above 1.0", () => {
    expect(EXPANSION_SCALE_THRESHOLD).toBeGreaterThan(1);
  });

  it("SUBTITLE_FONT_PCT_MIN < BASE_FONT < SUBTITLE_FONT_PCT_MAX", () => {
    expect(SUBTITLE_FONT_PCT_MIN).toBeLessThan(BASE_FONT);
    expect(BASE_FONT).toBeLessThan(SUBTITLE_FONT_PCT_MAX);
  });
});
