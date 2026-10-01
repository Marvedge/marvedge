import { describe, expect, it } from "vitest";
import type { SubtitleCue } from "../subtitles/types";
import {
  alignClipBoundaries,
  extractAllWords,
  sliceCuesForClip,
  snapToSceneCut,
  snapToWordBoundary,
} from "./boundaries";
import type { SceneBoundary } from "./types";

describe("Clip Boundary Snapping & Alignment", () => {
  const SAMPLE_CUES: SubtitleCue[] = [
    {
      start: 2.0,
      end: 6.5,
      text: "The secret to growing on short form video",
      words: [
        { word: "The", start: 2.0, end: 2.2 },
        { word: "secret", start: 2.25, end: 2.7 },
        { word: "to", start: 2.75, end: 2.9 },
        { word: "growing", start: 2.95, end: 3.5 },
        { word: "on", start: 3.55, end: 3.7 },
        { word: "short", start: 3.75, end: 4.1 },
        { word: "form", start: 4.15, end: 4.5 },
        { word: "video", start: 4.55, end: 5.1 },
      ],
    },
    {
      start: 7.0,
      end: 12.0,
      text: "is mastering the first three seconds hook.",
      words: [
        { word: "is", start: 7.0, end: 7.2 },
        { word: "mastering", start: 7.25, end: 7.8 },
        { word: "the", start: 7.85, end: 8.0 },
        { word: "first", start: 8.05, end: 8.4 },
        { word: "three", start: 8.45, end: 8.8 },
        { word: "seconds", start: 8.85, end: 9.3 },
        { word: "hook.", start: 9.35, end: 9.9 },
      ],
    },
    {
      start: 13.0,
      end: 22.0,
      text: "If you hook them early, watch time increases dramatically.",
      words: [
        { word: "If", start: 13.0, end: 13.2 },
        { word: "you", start: 13.25, end: 13.5 },
        { word: "hook", start: 13.55, end: 13.9 },
        { word: "them", start: 13.95, end: 14.2 },
        { word: "early,", start: 14.25, end: 14.7 },
        { word: "watch", start: 15.2, end: 15.6 },
        { word: "time", start: 15.65, end: 16.0 },
        { word: "increases", start: 16.1, end: 16.8 },
        { word: "dramatically.", start: 16.85, end: 17.6 },
      ],
    },
  ];

  describe("extractAllWords", () => {
    it("extracts words directly when cue.words is populated", () => {
      const words = extractAllWords(SAMPLE_CUES);
      expect(words).toHaveLength(24);
      expect(words[0].word).toBe("The");
      expect(words[words.length - 1].word).toBe("dramatically.");
    });

    it("synthesizes words evenly when cue.words is absent", () => {
      const legacyCues: SubtitleCue[] = [
        { start: 1.0, end: 3.0, text: "Hello beautiful world" },
      ];
      const words = extractAllWords(legacyCues);
      expect(words).toHaveLength(3);
      expect(words.map((w) => w.word)).toEqual(["Hello", "beautiful", "world"]);
      expect(words[0].start).toBe(1.0);
      expect(words[2].end).toBe(3.0);
    });
  });

  describe("snapToWordBoundary", () => {
    const words = extractAllWords(SAMPLE_CUES);

    it("prevents cutting mid-word on start by snapping to word.start", () => {
      // "growing" is at [2.95, 3.5]. Raw start is 3.2 (right in the middle!)
      const result = snapToWordBoundary(3.2, words, "start");
      expect(result.time).toBe(2.95);
      expect(result.didSnap).toBe(true);
    });

    it("prevents cutting mid-word on end by snapping to word.end", () => {
      // "growing" is at [2.95, 3.5]. Raw end is 3.2 (right in the middle!)
      const result = snapToWordBoundary(3.2, words, "end");
      expect(result.time).toBe(3.5);
      expect(result.didSnap).toBe(true);
    });

    it("snaps to nearby word boundary within tolerance", () => {
      // At 1.8s, the nearest word is "The" at 2.0s (diff 0.2s <= 1.0s tolerance)
      const result = snapToWordBoundary(1.8, words, "start", 1.0);
      expect(result.time).toBe(2.0);
      expect(result.didSnap).toBe(true);
    });
  });

  describe("snapToSceneCut", () => {
    const words = extractAllWords(SAMPLE_CUES);
    const sceneCuts = [6.8, 12.5]; // in speech pauses between cues

    it("snaps cleanly to a scene cut when within tolerance and not cutting words", () => {
      // At 6.6s, nearest cut is 6.8s (speech pause between 5.1s and 7.0s)
      const result = snapToSceneCut(6.6, sceneCuts, words, 0.8);
      expect(result.time).toBe(6.8);
      expect(result.didSnap).toBe(true);
    });

    it("refuses to snap to a scene cut if that cut slices through a spoken word", () => {
      // Hypothetical bad scene cut right at 3.2s (inside "growing" [2.95, 3.5])
      const badCut = [3.2];
      const result = snapToSceneCut(3.1, badCut, words, 0.8);
      // Did not snap to 3.2 because 3.2 cuts through "growing"
      expect(result.time).toBe(3.1);
      expect(result.didSnap).toBe(false);
    });
  });

  describe("alignClipBoundaries", () => {
    const scenes: SceneBoundary[] = [
      { startTime: 0, endTime: 6.8 },
      { startTime: 6.8, endTime: 12.5 },
      { startTime: 12.5, endTime: 30.0 },
    ];

    it("aligns raw candidate start and end times to valid word & scene boundaries", () => {
      const raw = { startTime: 2.1, endTime: 17.2 };
      const aligned = alignClipBoundaries(raw, SAMPLE_CUES, scenes, {
        minDurationSeconds: 10,
        maxDurationSeconds: 30,
        totalDuration: 30.0,
      });

      expect(aligned).not.toBeNull();
      // Start snaps from 2.1 to 2.0 ("The")
      expect(aligned!.startTime).toBe(2.0);
      // End snaps from 17.2 to 17.6 ("dramatically.")
      expect(aligned!.endTime).toBe(17.6);
      expect(aligned!.duration).toBe(15.6);
      expect(aligned!.cues.length).toBeGreaterThan(0);
    });

    it("enforces minimum duration by extending span when candidate is too short", () => {
      // Raw span is 5.0s, but min is 15s
      const raw = { startTime: 2.0, endTime: 7.0 };
      const aligned = alignClipBoundaries(raw, SAMPLE_CUES, scenes, {
        minDurationSeconds: 15,
        maxDurationSeconds: 30,
        totalDuration: 30.0,
      });

      expect(aligned).not.toBeNull();
      expect(aligned!.duration).toBeGreaterThanOrEqual(14.0);
    });

    it("enforces maximum duration by contracting span when candidate exceeds max", () => {
      // Raw span is 25s, but max is 16s
      const raw = { startTime: 2.0, endTime: 27.0 };
      const aligned = alignClipBoundaries(raw, SAMPLE_CUES, scenes, {
        minDurationSeconds: 10,
        maxDurationSeconds: 16,
        totalDuration: 30.0,
      });

      expect(aligned).not.toBeNull();
      expect(aligned!.duration).toBeLessThanOrEqual(19.2); // maxDuration * 1.2 tolerance
    });

    it("rejects candidate if duration cannot satisfy constraints", () => {
      const raw = { startTime: 1.0, endTime: 3.0 }; // 2s clip in 10s video with 15s min duration
      const aligned = alignClipBoundaries(raw, SAMPLE_CUES, scenes, {
        minDurationSeconds: 15,
        maxDurationSeconds: 30,
        totalDuration: 10.0,
      });

      expect(aligned).toBeNull();
    });
  });

  describe("sliceCuesForClip", () => {
    it("slices and re-times cues strictly within the clip boundary", () => {
      const sliced = sliceCuesForClip(SAMPLE_CUES, 2.0, 10.0);
      expect(sliced).toHaveLength(2);
      expect(sliced[0].text).toContain("The secret to growing");
      expect(sliced[1].text).toContain("is mastering the first");
    });
  });
});
