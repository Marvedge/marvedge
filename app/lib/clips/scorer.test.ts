import { describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import type { SubtitleCue } from "../subtitles/types";
import {
  ClipScoringError,
  buildSystemPrompt,
  buildTranscriptPromptText,
  buildUserPrompt,
  deduplicateCandidates,
  scoreTranscriptClips,
} from "./scorer";
import type { ClipCandidate, SceneBoundary } from "./types";

vi.mock("openai");

describe("LLM Clip Scorer Service", () => {
  const SAMPLE_CUES: SubtitleCue[] = [
    {
      start: 0.0,
      end: 5.0,
      text: "Stop scrolling if you want to double your video views.",
      words: [
        { word: "Stop", start: 0.0, end: 0.4 },
        { word: "scrolling", start: 0.45, end: 0.9 },
        { word: "if", start: 0.95, end: 1.1 },
        { word: "you", start: 1.15, end: 1.3 },
        { word: "want", start: 1.35, end: 1.6 },
        { word: "to", start: 1.65, end: 1.8 },
        { word: "double", start: 1.85, end: 2.3 },
        { word: "your", start: 2.35, end: 2.5 },
        { word: "video", start: 2.55, end: 2.9 },
        { word: "views.", start: 2.95, end: 3.5 },
      ],
    },
    {
      start: 5.5,
      end: 12.0,
      text: "The trick isn't better equipment, it is pacing your cuts.",
      words: [
        { word: "The", start: 5.5, end: 5.7 },
        { word: "trick", start: 5.75, end: 6.1 },
        { word: "isn't", start: 6.15, end: 6.5 },
        { word: "better", start: 6.55, end: 6.9 },
        { word: "equipment,", start: 6.95, end: 7.7 },
        { word: "it", start: 8.0, end: 8.2 },
        { word: "is", start: 8.25, end: 8.4 },
        { word: "pacing", start: 8.45, end: 8.9 },
        { word: "your", start: 8.95, end: 9.2 },
        { word: "cuts.", start: 9.25, end: 9.8 },
      ],
    },
    {
      start: 12.5,
      end: 20.0,
      text: "Every three seconds, change the visual angle or add an overlay.",
      words: [
        { word: "Every", start: 12.5, end: 12.8 },
        { word: "three", start: 12.85, end: 13.2 },
        { word: "seconds,", start: 13.25, end: 13.8 },
        { word: "change", start: 14.1, end: 14.5 },
        { word: "the", start: 14.55, end: 14.7 },
        { word: "visual", start: 14.75, end: 15.2 },
        { word: "angle", start: 15.25, end: 15.7 },
        { word: "or", start: 15.75, end: 15.9 },
        { word: "add", start: 15.95, end: 16.3 },
        { word: "an", start: 16.35, end: 16.5 },
        { word: "overlay.", start: 16.55, end: 17.2 },
      ],
    },
  ];

  const SAMPLE_SCENES: SceneBoundary[] = [
    { startTime: 0, endTime: 5.2 },
    { startTime: 5.2, endTime: 12.2 },
    { startTime: 12.2, endTime: 25.0 },
  ];

  describe("Prompt Building Helpers", () => {
    it("formats transcript cues into timestamped lines", () => {
      const text = buildTranscriptPromptText(SAMPLE_CUES);
      expect(text).toContain("[00:00.00 - 00:05.00] Stop scrolling");
      expect(text).toContain("[00:05.50 - 00:12.00] The trick isn't");
    });

    it("includes scene cuts and video title in user prompt", () => {
      const prompt = buildUserPrompt(SAMPLE_CUES, 25.0, SAMPLE_SCENES, "Pacing Masterclass");
      expect(prompt).toContain('Video Title: "Pacing Masterclass"');
      expect(prompt).toContain("Total Duration: 25.0 seconds");
      expect(prompt).toContain("Visual Scene Transitions Detected at: 5.2s, 12.2s");
    });

    it("builds system prompt with custom duration constraints", () => {
      const prompt = buildSystemPrompt(20, 45, "tiktok");
      expect(prompt).toContain("Target Duration: Each clip MUST be between 20 and 45 seconds long.");
      expect(prompt).toContain("Optimize specifically for: TIKTOK.");
    });
  });

  describe("deduplicateCandidates", () => {
    it("deduplicates overlapping candidates, keeping the one with the higher viralityScore", () => {
      const candidates: ClipCandidate[] = [
        {
          id: "clip-a",
          startTime: 0,
          endTime: 20,
          duration: 20,
          title: "Clip A",
          hook: "Hook A",
          viralityScore: 75,
          engagementReasoning: "Good",
          keywords: ["a"],
          alignedToWordBoundary: true,
          alignedToSceneBoundary: false,
        },
        {
          id: "clip-b",
          startTime: 2,
          endTime: 19,
          duration: 17,
          title: "Clip B (Overlap)",
          hook: "Hook B",
          viralityScore: 92, // Higher score!
          engagementReasoning: "Better hook",
          keywords: ["b"],
          alignedToWordBoundary: true,
          alignedToSceneBoundary: false,
        },
        {
          id: "clip-c",
          startTime: 40,
          endTime: 60,
          duration: 20,
          title: "Clip C (Distinct)",
          hook: "Hook C",
          viralityScore: 80,
          engagementReasoning: "Unique",
          keywords: ["c"],
          alignedToWordBoundary: true,
          alignedToSceneBoundary: true,
        },
      ];

      const deduplicated = deduplicateCandidates(candidates);
      expect(deduplicated).toHaveLength(2);
      // Clip B was kept over Clip A because 92 > 75
      expect(deduplicated[0].id).toBe("clip-b");
      expect(deduplicated[1].id).toBe("clip-c");
    });
  });

  describe("scoreTranscriptClips execution", () => {
    it("returns empty array when cues are empty without calling API", async () => {
      const result = await scoreTranscriptClips({
        cues: [],
        totalDuration: 30,
      });
      expect(result).toEqual([]);
    });

    it("throws ClipScoringError when OPENAI_API_KEY is missing", async () => {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        await expect(
          scoreTranscriptClips({
            cues: SAMPLE_CUES,
            totalDuration: 25,
            options: { apiKey: "" },
          })
        ).rejects.toThrow(ClipScoringError);
      } finally {
        if (origKey) process.env.OPENAI_API_KEY = origKey;
      }
    });

    it("successfully calls OpenAI, parses JSON, aligns boundaries, and ranks candidates", async () => {
      const mockLlmResponse = {
        clips: [
          {
            startTime: 0.1,
            endTime: 17.0,
            title: "Double Your Views With This Edit Hack",
            hook: "Stop scrolling if you want to double your video views.",
            viralityScore: 94,
            engagementReasoning: "Strong immediate pattern interrupt followed by tactical advice.",
            keywords: ["views", "editing", "growth"],
          },
          {
            startTime: 5.6,
            endTime: 19.8,
            title: "Why Your Video Pacing Is Costing You Retention",
            hook: "The trick isn't better equipment, it is pacing your cuts.",
            viralityScore: 88,
            engagementReasoning: "Contrarian angle that challenges common creator assumptions.",
            keywords: ["pacing", "retention"],
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockLlmResponse),
            },
          },
        ],
      });

      // @ts-expect-error Mocking constructor
      OpenAI.mockImplementation(function (this: any) {
        this.chat = {
          completions: {
            create: mockCreate,
          },
        };
        return this;
      } as any);

      const clips = await scoreTranscriptClips({
        cues: SAMPLE_CUES,
        totalDuration: 25.0,
        scenes: SAMPLE_SCENES,
        videoTitle: "Viral Editing Guide",
        options: {
          apiKey: "test-fake-key",
          minDurationSeconds: 10,
          maxDurationSeconds: 25,
          targetClipCount: 2,
        },
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(clips.length).toBeGreaterThan(0);
      expect(clips[0].id).toBe("clip-1");
      expect(clips[0].viralityScore).toBe(94);
      expect(clips[0].title).toBe("Double Your Views With This Edit Hack");
      expect(clips[0].hook).toBe("Stop scrolling if you want to double your video views.");
      // Boundaries should be snapped to word ends (3.5 / 17.2)
      expect(clips[0].duration).toBeGreaterThanOrEqual(10);
      expect(clips[0].alignedToWordBoundary).toBe(true);
    });

    it("throws ClipScoringError when LLM returns malformed non-JSON", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "I am sorry, but I cannot assist with this request.",
            },
          },
        ],
      });

      // @ts-expect-error Mocking constructor
      OpenAI.mockImplementation(function (this: any) {
        this.chat = {
          completions: {
            create: mockCreate,
          },
        };
        return this;
      } as any);

      await expect(
        scoreTranscriptClips({
          cues: SAMPLE_CUES,
          totalDuration: 25.0,
          options: { apiKey: "test-fake-key" },
        })
      ).rejects.toThrow(/Failed to parse LLM JSON response/);
    });

    it("throws ClipScoringError when LLM returns JSON missing the clips array", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ wrongKey: [] }),
            },
          },
        ],
      });

      // @ts-expect-error Mocking constructor
      OpenAI.mockImplementation(function (this: any) {
        this.chat = {
          completions: {
            create: mockCreate,
          },
        };
        return this;
      } as any);

      await expect(
        scoreTranscriptClips({
          cues: SAMPLE_CUES,
          totalDuration: 25.0,
          options: { apiKey: "test-fake-key" },
        })
      ).rejects.toThrow(/LLM response failed schema validation/);
    });
  });
});
