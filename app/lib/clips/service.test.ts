import { describe, expect, it, vi } from "vitest";

vi.mock("../queue", () => ({
  videoQueue: {
    add: vi.fn(async () => ({ id: "mock-job-id" })),
  },
}));

import { videoQueue } from "../queue";
import {
  ApiError,
  clipJobQueue,
  resolveTranscriptCues,
  validateClipScoringInput,
} from "./service";

describe("Clip Scoring Service (Task-00050)", () => {
  describe("validateClipScoringInput", () => {
    it("validates input with demoId", () => {
      const res = validateClipScoringInput({ demoId: "demo-123" });
      expect(res.demoId).toBe("demo-123");
    });

    it("validates input with videoUrl and options", () => {
      const res = validateClipScoringInput({
        videoUrl: "https://example.com/video.mp4",
        options: {
          minDurationSeconds: 20,
          maxDurationSeconds: 45,
          platform: "tiktok",
          targetClipCount: 5,
        },
      });
      expect(res.videoUrl).toBe("https://example.com/video.mp4");
      expect(res.options?.platform).toBe("tiktok");
      expect(res.options?.minDurationSeconds).toBe(20);
      expect(res.options?.maxDurationSeconds).toBe(45);
      expect(res.options?.targetClipCount).toBe(5);
    });

    it("validates input with explicit cues", () => {
      const res = validateClipScoringInput({
        cues: [
          { start: 0, end: 2.5, text: "First sentence" },
          { start: 2.5, end: 5.0, text: "Second sentence" },
        ],
        duration: 5.0,
      });
      expect(res.cues?.length).toBe(2);
      expect(res.duration).toBe(5.0);
    });

    it("throws 400 when body is not an object", () => {
      expect(() => validateClipScoringInput("invalid")).toThrow(ApiError);
      expect(() => validateClipScoringInput(null)).toThrow("Request body must be an object");
    });

    it("throws 400 when no demoId, videoUrl, or cues are provided", () => {
      expect(() => validateClipScoringInput({})).toThrow(
        "At least one of demoId, videoUrl, or cues must be provided"
      );
    });

    it("throws 400 when minDuration exceeds maxDuration", () => {
      expect(() =>
        validateClipScoringInput({
          demoId: "demo-1",
          options: { minDurationSeconds: 60, maxDurationSeconds: 30 },
        })
      ).toThrow("options.minDurationSeconds cannot exceed options.maxDurationSeconds");
    });

    it("throws 400 when invalid platform is provided", () => {
      expect(() =>
        validateClipScoringInput({
          demoId: "demo-1",
          options: { platform: "myspace" as any },
        })
      ).toThrow("options.platform must be one of: tiktok, reels, shorts, general");
    });
  });

  describe("resolveTranscriptCues", () => {
    it("returns supplied cues immediately without touching DB", async () => {
      const supplied = [{ start: 0, end: 4, text: "Direct cues" }];
      const res = await resolveTranscriptCues({}, { suppliedCues: supplied });
      expect(res.cues).toEqual(supplied);
      expect(res.duration).toBe(4);
    });

    it("resolves cues and duration from demo.subtitles", async () => {
      const mockDb = {
        demo: {
          findUnique: vi.fn().mockResolvedValue({
            id: "demo-1",
            subtitles: [{ start: 0, end: 10, text: "From demo subtitles" }],
            duration: 10,
            videoUrl: "https://example.com/demo.mp4",
          }),
        },
      };

      const res = await resolveTranscriptCues(mockDb, { demoId: "demo-1" });
      expect(res.cues.length).toBe(1);
      expect(res.cues[0].text).toBe("From demo subtitles");
      expect(res.duration).toBe(10);
      expect(res.resolvedVideoUrl).toBe("https://example.com/demo.mp4");
    });

    it("resolves cues from subtitleTrack if demo.subtitles is empty", async () => {
      const mockDb = {
        demo: {
          findUnique: vi.fn().mockResolvedValue({
            id: "demo-2",
            subtitles: null,
            duration: 15,
            videoUrl: "https://example.com/track.mp4",
          }),
        },
        subtitleTrack: {
          findFirst: vi.fn().mockResolvedValue({
            cues: [{ start: 0, end: 15, text: "From subtitle track" }],
          }),
        },
      };

      const res = await resolveTranscriptCues(mockDb, { demoId: "demo-2" });
      expect(res.cues.length).toBe(1);
      expect(res.cues[0].text).toBe("From subtitle track");
      expect(res.duration).toBe(15);
    });

    it("resolves cues from completed VideoJob if demo has no subtitles", async () => {
      const mockDb = {
        demo: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        videoJob: {
          findFirst: vi.fn().mockResolvedValue({
            jobData: {
              kind: "SUBTITLES",
              subtitles: [{ start: 0, end: 8, text: "From video job" }],
            },
          }),
        },
      };

      const res = await resolveTranscriptCues(mockDb, { videoUrl: "https://example.com/vid.mp4" });
      expect(res.cues.length).toBe(1);
      expect(res.cues[0].text).toBe("From video job");
      expect(res.duration).toBe(8);
    });

    it("throws 400 ApiError if no cues can be found anywhere", async () => {
      const mockDb = {
        demo: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        videoJob: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      await expect(resolveTranscriptCues(mockDb, { demoId: "empty-demo" })).rejects.toThrow(
        "No transcript cues found for clip scoring"
      );
    });
  });

  describe("clipJobQueue dispatch", () => {
    it("enqueues clip-scoring job to videoQueue with correct options", async () => {
      const addSpy = vi.spyOn(videoQueue, "add").mockResolvedValue({ id: "job-clip-1" } as any);

      await clipJobQueue.add(
        "clip-scoring",
        {
          jobId: "job-clip-1",
          userId: "user-1",
          demoId: "demo-1",
          duration: 30,
          cues: [{ start: 0, end: 30, text: "Sample" }],
        },
        { jobId: "job-clip-1" }
      );

      expect(addSpy).toHaveBeenCalledWith(
        "clip-scoring",
        expect.objectContaining({
          jobId: "job-clip-1",
          userId: "user-1",
          demoId: "demo-1",
          duration: 30,
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          jobId: "job-clip-1",
        })
      );

      addSpy.mockRestore();
    });
  });
});
