import { describe, expect, it } from "vitest";
import {
  cuesFromWhisperSegments,
  cuesFromWhisperWords,
  normalizeWhisperResponse,
  normalizeWhisperWords,
} from "./whisper";
import type { WhisperSegment, WhisperWord } from "./types";

describe("Whisper word timestamp normalization & clustering (Task-00038)", () => {
  describe("normalizeWhisperWords", () => {
    it("filters out invalid or empty words and sorts by start time", () => {
      const raw = [
        { word: "world", start: 1.2, end: 1.6 },
        { word: "", start: 0.5, end: 0.8 },
        null,
        { word: "hello", start: 0.2, end: 0.7 },
        { word: "invalid", start: "not a number", end: 1.0 },
      ];

      const normalized = normalizeWhisperWords(raw);
      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({ word: "hello", start: 0.2, end: 0.7 });
      expect(normalized[1]).toEqual({ word: "world", start: 1.2, end: 1.6 });
    });

    it("clamps negative start times to zero", () => {
      const normalized = normalizeWhisperWords([{ word: "test", start: -0.5, end: 0.2 }]);
      expect(normalized[0].start).toBe(0);
      expect(normalized[0].end).toBe(0.2);
    });
  });

  describe("cuesFromWhisperWords", () => {
    it("clusters sequential words into a single phrase cue and preserves words array", () => {
      const words: WhisperWord[] = [
        { word: "Welcome", start: 0.0, end: 0.4 },
        { word: "to", start: 0.45, end: 0.6 },
        { word: "Marvedge", start: 0.65, end: 1.2 },
      ];

      const cues = cuesFromWhisperWords(words);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe("Welcome to Marvedge");
      expect(cues[0].start).toBe(0.0);
      expect(cues[0].end).toBe(1.2);
      expect(cues[0].words).toEqual(words);
    });

    it("breaks into a new cue when gap between words exceeds threshold (0.8s)", () => {
      const words: WhisperWord[] = [
        { word: "First", start: 0.0, end: 0.5 },
        { word: "phrase.", start: 0.55, end: 1.0 },
        // 1.2s pause (1.0 -> 2.2)
        { word: "Second", start: 2.2, end: 2.6 },
        { word: "phrase.", start: 2.65, end: 3.0 },
      ];

      const cues = cuesFromWhisperWords(words);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe("First phrase.");
      expect(cues[0].start).toBe(0.0);
      expect(cues[0].end).toBe(1.0);
      expect(cues[0].words).toHaveLength(2);

      expect(cues[1].text).toBe("Second phrase.");
      expect(cues[1].start).toBe(2.2);
      expect(cues[1].end).toBe(3.0);
      expect(cues[1].words).toHaveLength(2);
    });

    it("breaks into a new cue when duration exceeds max duration threshold (4.2s)", () => {
      // 6 words, each 1 second long without pause (total 6s, exceeding 4.2s max duration)
      const words: WhisperWord[] = [
        { word: "One", start: 0.0, end: 1.0 },
        { word: "two", start: 1.0, end: 2.0 },
        { word: "three", start: 2.0, end: 3.0 },
        { word: "four", start: 3.0, end: 4.0 },
        { word: "five", start: 4.0, end: 5.0 },
        { word: "six", start: 5.0, end: 6.0 },
      ];

      const cues = cuesFromWhisperWords(words);
      expect(cues.length).toBeGreaterThan(1);
      expect(cues[0].end - cues[0].start).toBeLessThanOrEqual(5.0);
      const totalWords = cues.reduce((sum, c) => sum + (c.words?.length || 0), 0);
      expect(totalWords).toBe(6);
    });

    it("breaks into a new cue when character length exceeds line limit (56 chars)", () => {
      const words: WhisperWord[] = [
        { word: "ThisIsAnExtremelyLongWordThatTakesUpALotOfHorizontalSpace", start: 0.0, end: 1.0 },
        { word: "AndHereIsAnotherLongWordThatWillExceedTheMaxCharactersLimit", start: 1.05, end: 2.0 },
      ];

      const cues = cuesFromWhisperWords(words);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe(words[0].word);
      expect(cues[1].text).toBe(words[1].word);
    });

    it("returns empty array for empty or whitespace-only words", () => {
      expect(cuesFromWhisperWords([])).toEqual([]);
      expect(cuesFromWhisperWords([{ word: "   ", start: 0, end: 1 }])).toEqual([]);
    });
  });

  describe("cuesFromWhisperSegments", () => {
    it("converts segments to SubtitleCue when word timestamps are absent", () => {
      const segments: WhisperSegment[] = [
        { id: 1, start: 0.0, end: 2.5, text: "Hello and welcome to the demo." },
        { id: 2, start: 2.8, end: 5.0, text: "Today we will see video reframing." },
      ];

      const cues = cuesFromWhisperSegments(segments);
      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({
        start: 0.0,
        end: 2.5,
        text: "Hello and welcome to the demo.",
      });
      expect(cues[1]).toEqual({
        start: 2.8,
        end: 5.0,
        text: "Today we will see video reframing.",
      });
    });
  });

  describe("normalizeWhisperResponse", () => {
    it("handles full verbose_json response with words and segments", () => {
      const response = {
        task: "transcribe",
        language: "english",
        duration: 4.5,
        text: "This is a real end-to-end transcription test.",
        words: [
          { word: "This", start: 0.1, end: 0.3 },
          { word: "is", start: 0.35, end: 0.5 },
          { word: "a", start: 0.52, end: 0.6 },
          { word: "real", start: 0.65, end: 0.9 },
          { word: "end-to-end", start: 0.95, end: 1.5 },
          { word: "transcription", start: 1.55, end: 2.2 },
          { word: "test.", start: 2.25, end: 2.8 },
        ],
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.1,
            end: 2.8,
            text: "This is a real end-to-end transcription test.",
          },
        ],
      };

      const { transcript, cues } = normalizeWhisperResponse(response);

      expect(transcript.text).toBe(response.text);
      expect(transcript.language).toBe("english");
      expect(transcript.duration).toBe(4.5);
      expect(transcript.words).toHaveLength(7);
      expect(transcript.segments).toHaveLength(1);

      expect(cues.length).toBeGreaterThanOrEqual(1);
      expect(cues[0].text).toBe("This is a real end-to-end transcription test.");
      expect(cues[0].words).toHaveLength(7);
    });

    it("falls back to segments if words array is empty", () => {
      const response = {
        text: "Segment only transcript.",
        segments: [{ id: 0, start: 0.5, end: 2.0, text: "Segment only transcript." }],
        words: [],
      };

      const { cues } = normalizeWhisperResponse(response);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe("Segment only transcript.");
      expect(cues[0].start).toBe(0.5);
      expect(cues[0].end).toBe(2.0);
    });

    it("falls back to plain text if words and segments are both empty", () => {
      const response = {
        text: "Fallback text cue.",
        duration: 3.0,
      };

      const { cues } = normalizeWhisperResponse(response);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe("Fallback text cue.");
      expect(cues[0].start).toBe(0);
      expect(cues[0].end).toBe(3.0);
    });

    it("throws an error for non-object inputs", () => {
      expect(() => normalizeWhisperResponse(null)).toThrow();
      expect(() => normalizeWhisperResponse("not an object")).toThrow();
    });
  });
});
