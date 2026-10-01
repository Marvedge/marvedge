import { describe, expect, it } from "vitest";

import { isSubtitleTranslateAllowed } from "./access";
import {
  TRANSLATION_BATCH_SIZE,
  TranslationAlignmentError,
  applyTranslations,
  buildTranslationBatches,
  buildTranslationPrompt,
  parseTranslationBatch,
  toTranslationSegments,
} from "./translate";
import type { SubtitleCue } from "./types";

const CUES: SubtitleCue[] = [
  { start: 0, end: 1.5, text: "Hello" },
  { start: 1.5, end: 3, text: "there" },
  { start: 3, end: 4.25, text: "friend" },
];

const json = (segments: unknown) => JSON.stringify({ segments });

describe("batching", () => {
  it("splits cues into ordered batches", () => {
    const cues = Array.from({ length: 95 }, (_, i) => ({ start: i, end: i + 1, text: `c${i}` }));
    const batches = buildTranslationBatches(cues, 40);
    expect(batches.map((b) => b.length)).toEqual([40, 40, 15]);
    expect(batches[0][0].text).toBe("c0");
    expect(batches[2][14].text).toBe("c94");
    expect(batches.flat()).toEqual(cues);
  });

  it("batches a 10-minute demo into a handful of requests", () => {
    // ~150 cues is the plan's stated figure for a 10-minute video.
    const cues = Array.from({ length: 150 }, (_, i) => ({ start: i, end: i + 1, text: `c${i}` }));
    expect(buildTranslationBatches(cues).length).toBe(Math.ceil(150 / TRANSLATION_BATCH_SIZE));
  });

  it("handles an empty list and a degenerate batch size", () => {
    expect(buildTranslationBatches([], 40)).toEqual([]);
    expect(buildTranslationBatches(CUES, 0).length).toBe(3);
  });

  it("sends indices and text but never timings", () => {
    const segments = toTranslationSegments(CUES);
    expect(segments).toEqual([
      { i: 0, text: "Hello" },
      { i: 1, text: "there" },
      { i: 2, text: "friend" },
    ]);
    // Assert on the KEYS, not on a substring of the payload — cue text like
    // "friend" contains "end" and would make a substring check lie.
    for (const segment of segments) {
      expect(Object.keys(segment).sort()).toEqual(["i", "text"]);
    }
  });

  it("asks for one entry per index in the prompt", () => {
    const prompt = buildTranslationPrompt(toTranslationSegments(CUES), "English", "Spanish");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Spanish");
    expect(prompt).toContain("exactly one entry for each of the 3 input indices");
    expect(prompt).not.toContain("start");
  });
});

describe("parseTranslationBatch — alignment is verified, not assumed", () => {
  it("accepts a well-formed response and returns it in index order", () => {
    const content = json([
      { i: 2, text: "amigo" },
      { i: 0, text: "Hola" },
      { i: 1, text: "ahí" },
    ]);
    expect(parseTranslationBatch(content, 3)).toEqual(["Hola", "ahí", "amigo"]);
  });

  it("THROWS when a segment is missing rather than shifting everything after it", () => {
    const content = json([
      { i: 0, text: "Hola" },
      { i: 2, text: "amigo" },
    ]);
    expect(() => parseTranslationBatch(content, 3)).toThrow(TranslationAlignmentError);
    expect(() => parseTranslationBatch(content, 3)).toThrow(/2 of 3 subtitles/);
    expect(() => parseTranslationBatch(content, 3)).toThrow(/missing 1/);
  });

  it("THROWS on a duplicated index even though the count would look right", () => {
    // Right length, wrong content — a count check alone would let this through.
    const content = json([
      { i: 0, text: "Hola" },
      { i: 1, text: "ahí" },
      { i: 1, text: "otra vez" },
    ]);
    expect(() => parseTranslationBatch(content, 3)).toThrow(/more than once/);
  });

  it("THROWS on an out-of-range index", () => {
    const content = json([
      { i: 0, text: "Hola" },
      { i: 1, text: "ahí" },
      { i: 9, text: "fuera" },
    ]);
    expect(() => parseTranslationBatch(content, 3)).toThrow(TranslationAlignmentError);
  });

  it("THROWS on a blank translation rather than saving an empty subtitle", () => {
    const content = json([
      { i: 0, text: "Hola" },
      { i: 1, text: "   " },
      { i: 2, text: "amigo" },
    ]);
    expect(() => parseTranslationBatch(content, 3)).toThrow(TranslationAlignmentError);
  });

  it("THROWS on malformed JSON and on a missing segments array", () => {
    expect(() => parseTranslationBatch("not json", 3)).toThrow(/not valid JSON/);
    expect(() => parseTranslationBatch("{}", 3)).toThrow(/no segments/);
    expect(() => parseTranslationBatch(json("nope"), 3)).toThrow(/no segments/);
  });

  it("THROWS on extra segments beyond the batch", () => {
    const content = json([
      { i: 0, text: "Hola" },
      { i: 1, text: "ahí" },
      { i: 2, text: "amigo" },
      { i: 3, text: "extra" },
    ]);
    expect(() => parseTranslationBatch(content, 3)).toThrow(TranslationAlignmentError);
  });

  it("THROWS on a malformed entry instead of skipping it", () => {
    expect(() => parseTranslationBatch(json([{ i: 0, text: "Hola" }, null]), 1)).toThrow(
      /malformed/
    );
  });

  it("trims whitespace the model adds", () => {
    expect(parseTranslationBatch(json([{ i: 0, text: "  Hola  " }]), 1)).toEqual(["Hola"]);
  });
});

describe("applyTranslations — timings survive verbatim", () => {
  it("replaces text and copies start/end exactly", () => {
    const out = applyTranslations(CUES, ["Hola", "ahí", "amigo"]);
    expect(out).toEqual([
      { start: 0, end: 1.5, text: "Hola" },
      { start: 1.5, end: 3, text: "ahí" },
      { start: 3, end: 4.25, text: "amigo" },
    ]);
    // Same count, same order, same instants — only the words moved.
    expect(out.map((c) => [c.start, c.end])).toEqual(CUES.map((c) => [c.start, c.end]));
  });

  it("throws rather than truncating when the lengths disagree", () => {
    expect(() => applyTranslations(CUES, ["Hola"])).toThrow(TranslationAlignmentError);
    expect(() => applyTranslations(CUES, ["a", "b", "c", "d"])).toThrow(/Refusing/);
  });

  it("does not mutate the source cues", () => {
    const source = CUES.map((c) => ({ ...c }));
    applyTranslations(source, ["Hola", "ahí", "amigo"]);
    expect(source).toEqual(CUES);
  });
});

describe("plan gate", () => {
  it("allows only PRO and ENTERPRISE", () => {
    expect(isSubtitleTranslateAllowed("PRO")).toBe(true);
    expect(isSubtitleTranslateAllowed("ENTERPRISE")).toBe(true);
    expect(isSubtitleTranslateAllowed("FREE")).toBe(false);
    expect(isSubtitleTranslateAllowed(null)).toBe(false);
    expect(isSubtitleTranslateAllowed(undefined)).toBe(false);
    expect(isSubtitleTranslateAllowed("")).toBe(false);
    expect(isSubtitleTranslateAllowed("pro")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task-00079: localized caption / subtitle edge cases
// ---------------------------------------------------------------------------

import { MIN_TRANSLATED_CUE_SECONDS } from "./translate";

describe("applyTranslations — timing drift (Task-00079)", () => {
  it("stretches a very short cue to MIN_TRANSLATED_CUE_SECONDS", () => {
    // Tamil and German cues are often just one word — their source duration can
    // be as short as 150 ms. After retiming by the localization engine the cue
    // may be shorter still. Without a floor this produces a flicker.
    const shortCues: SubtitleCue[] = [
      { start: 0.0, end: 0.15, text: "Hi" }, // 150 ms — below the 300 ms floor
      { start: 0.5, end: 1.8, text: "there" }, // 1.3 s — above the floor
    ];
    const out = applyTranslations(shortCues, ["Hola", "allí"]);
    expect(out[0].end - out[0].start).toBeGreaterThanOrEqual(MIN_TRANSLATED_CUE_SECONDS);
    expect(out[0].start).toBe(0.0); // start is never moved backward
    expect(out[1].end).toBe(1.8);   // normal cue is untouched
  });

  it("does not stretch a cue that is already at or above the floor", () => {
    const cues: SubtitleCue[] = [
      { start: 0, end: 0.3, text: "Exactly at floor" },
      { start: 1, end: 2.5, text: "Well above floor" },
    ];
    const out = applyTranslations(cues, ["Justo", "Muy"]);
    expect(out[0].end).toBe(0.3);
    expect(out[1].end).toBe(2.5);
  });

  it("preserves source text ordering after stretching", () => {
    // Stretching must not shift any later cue's start, creating an overlap.
    const cues: SubtitleCue[] = [
      { start: 0.0, end: 0.1, text: "A" },
      { start: 0.2, end: 1.0, text: "B" },
    ];
    const out = applyTranslations(cues, ["X", "Y"]);
    // out[0].end is stretched to 0.3, but out[1].start is NOT moved — they
    // may technically overlap for 100 ms. The caller (normalizeCues) is
    // responsible for resolving overlaps; applyTranslations only stops flicker.
    expect(out[0].end).toBeGreaterThanOrEqual(MIN_TRANSLATED_CUE_SECONDS);
    expect(out[1].start).toBe(0.2);
  });
});
