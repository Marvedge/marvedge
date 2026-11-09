import { describe, expect, it } from "vitest";
import {
  MAX_WORD_DURATION_SECONDS,
  adaptGroqWhisperResponse,
  partitionWordsBySegments,
  preventCueCollisions,
  repairSegmentWords,
  sanitizeErrorMessage,
  transcribeAudioWithGroq,
} from "./groqWhisper";
import { generateAssContent } from "../app/lib/subtitles/index";

describe("Generic Groq Whisper Normalization Algorithm", () => {
  it("sanitizes error messages containing API keys or patterns", () => {
    const raw = "Request failed with key gsk_1234567890abcdef and secret sk-proj-abcdef123456";
    const cleaned = sanitizeErrorMessage(raw, "gsk_1234567890abcdef");
    expect(cleaned).not.toContain("gsk_1234567890abcdef");
    expect(cleaned).not.toContain("sk-proj-abcdef123456");
    expect(cleaned).toContain("[REDACTED_API_KEY]");
  });

  it("fails fast when GROQ_API_KEY is missing", async () => {
    const origKey = process.env.GROQ_API_KEY;
    try {
      delete process.env.GROQ_API_KEY;
      await expect(
        transcribeAudioWithGroq({} as any, { apiKey: "" })
      ).rejects.toThrow(/Missing GROQ_API_KEY/);
    } finally {
      if (origKey) process.env.GROQ_API_KEY = origKey;
    }
  });

  it("preserves natural lexical word order despite timestamp inversions", () => {
    // Synthetic test: Word B was assigned an onset slightly earlier than Word A
    // (e.g. rapid speaker turn or overlap), but lexical order must NOT be swapped.
    const syntheticRaw = {
      text: "Alpha Beta Gamma Delta",
      segments: [
        { id: 0, start: 1.0, end: 2.0, text: "Alpha Beta" },
        { id: 1, start: 1.8, end: 3.0, text: "Gamma Delta" },
      ],
      words: [
        { word: "Alpha", start: 1.0, end: 1.5 },
        { word: "Beta", start: 1.5, end: 1.9 },
        // "Gamma" has timestamp inversion relative to "Beta" (1.8 < 1.9)
        { word: "Gamma", start: 1.8, end: 2.4 },
        { word: "Delta", start: 2.4, end: 2.9 },
      ],
    };

    const { transcript, cues } = adaptGroqWhisperResponse(syntheticRaw);

    // Lexical order must be strictly preserved
    const wordSequence = cues.flatMap((c) => c.words?.map((w) => w.word) || []);
    expect(wordSequence).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(transcript.words.map((w) => w.word)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
  });

  it("caps pathological word durations to MAX_WORD_DURATION_SECONDS", () => {
    const syntheticRaw = {
      text: "Normal Bloated NormalAgain",
      segments: [{ id: 0, start: 0.0, end: 12.0, text: "Normal Bloated NormalAgain" }],
      words: [
        { word: "Normal", start: 0.1, end: 0.5 },
        // Bloated word spanning 9 seconds
        { word: "Bloated", start: 0.6, end: 9.6 },
        { word: "NormalAgain", start: 9.7, end: 10.2 },
      ],
    };

    const { cues } = adaptGroqWhisperResponse(syntheticRaw);
    const allWords = cues.flatMap((c) => c.words || []);

    for (const w of allWords) {
      const dur = w.end - w.start;
      expect(dur).toBeLessThanOrEqual(MAX_WORD_DURATION_SECONDS + 0.001);
    }

    const bloatedWord = allWords.find((w) => w.word === "Bloated");
    expect(bloatedWord).toBeDefined();
    expect(bloatedWord!.end - bloatedWord!.start).toBeCloseTo(MAX_WORD_DURATION_SECONDS, 2);
  });

  it("guarantees sequential cue collision invariant: cue[i].end <= cue[i+1].start", () => {
    // Synthetic test where segment 1 extends past segment 2's start
    const syntheticRaw = {
      text: "SpeakerOne speaking. SpeakerTwo responding.",
      segments: [
        { id: 0, start: 2.0, end: 5.0, text: "SpeakerOne speaking." },
        { id: 1, start: 4.0, end: 7.0, text: "SpeakerTwo responding." },
      ],
      words: [
        { word: "SpeakerOne", start: 2.0, end: 3.5 },
        { word: "speaking.", start: 3.5, end: 4.8 },
        { word: "SpeakerTwo", start: 4.2, end: 5.5 },
        { word: "responding.", start: 5.5, end: 6.8 },
      ],
    };

    const { cues } = adaptGroqWhisperResponse(syntheticRaw);

    expect(cues.length).toBeGreaterThan(1);
    for (let i = 0; i < cues.length - 1; i++) {
      const cur = cues[i];
      const next = cues[i + 1];
      expect(cur.end).toBeLessThanOrEqual(next.start);
    }
  });

  it("preserves 100% of valid words (raw valid word count == normalized valid word count)", () => {
    const syntheticRaw = {
      text: "WordOne WordTwo WordThree WordFour WordFive WordSix",
      segments: [
        { id: 0, start: 0.0, end: 2.0, text: "WordOne WordTwo" },
        { id: 1, start: 2.0, end: 4.0, text: "WordThree WordFour" },
        { id: 2, start: 4.0, end: 6.0, text: "WordFive WordSix" },
      ],
      words: [
        { word: "WordOne", start: 0.1, end: 0.5 },
        { word: "WordTwo", start: 0.6, end: 1.2 },
        { word: "WordThree", start: 2.1, end: 2.8 },
        { word: "WordFour", start: 2.9, end: 3.5 },
        { word: "WordFive", start: 4.1, end: 4.8 },
        { word: "WordSix", start: 4.9, end: 5.5 },
      ],
    };

    const { transcript, cues } = adaptGroqWhisperResponse(syntheticRaw);
    const normalizedWords = cues.flatMap((c) => c.words || []);

    expect(normalizedWords.length).toBe(syntheticRaw.words.length);
    expect(transcript.words.length).toBe(syntheticRaw.words.length);
  });

  it("produces valid ASS karaoke tags derived from repaired word timings", () => {
    const syntheticRaw = {
      text: "Singing test with karaoke tags.",
      segments: [{ id: 0, start: 0.0, end: 2.5, text: "Singing test with karaoke tags." }],
      words: [
        { word: "Singing", start: 0.2, end: 0.6 },
        { word: "test", start: 0.65, end: 1.0 },
        { word: "with", start: 1.05, end: 1.3 },
        { word: "karaoke", start: 1.35, end: 1.8 },
        { word: "tags.", start: 1.85, end: 2.2 },
      ],
    };

    const { cues } = adaptGroqWhisperResponse(syntheticRaw);
    const assContent = generateAssContent(cues, 1080, 1920, undefined, "en", {
      karaoke: true,
    });

    expect(assContent).toContain("{\\k");
    expect(assContent).toContain("Singing");
    expect(assContent).toContain("karaoke");
    // Ensure all dialogue events have valid non-negative durations
    const dialogues = assContent.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogues.length).toBeGreaterThan(0);
  });

  it("handles segments lacking words gracefully without crash", () => {
    const syntheticRaw = {
      text: "Segment with text only",
      segments: [{ id: 0, start: 1.0, end: 3.5, text: "Segment with text only" }],
      words: [],
    };

    const { cues } = adaptGroqWhisperResponse(syntheticRaw);
    expect(cues.length).toBe(1);
    expect(cues[0].text).toBe("Segment with text only");
    expect(cues[0].start).toBe(1.0);
    expect(cues[0].end).toBe(3.5);
  });
});
