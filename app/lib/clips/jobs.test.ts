import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../queue", () => ({
  videoQueue: {
    add: vi.fn(),
  },
}));

import { runClipScoringJob, type ClipJobDbClient } from "./jobs";
import type { ClipCandidate } from "./types";

describe("runClipScoringJob (Task-00050)", () => {
  let mockDb: ClipJobDbClient;

  beforeEach(() => {
    mockDb = {
      videoJob: {
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      } as any,
      demo: {
        findUnique: vi.fn(),
      },
    };
  });

  const sampleCandidate: ClipCandidate = {
    id: "clip-1",
    startTime: 5.0,
    endTime: 25.0,
    duration: 20.0,
    title: "Awesome Moment",
    hook: "You won't believe this...",
    viralityScore: 92,
    engagementReasoning: "Strong emotional hook.",
    keywords: ["viral", "moment"],
    alignedToWordBoundary: true,
    alignedToSceneBoundary: false,
  };

  it("successfully processes job with supplied cues, updates progress, and saves candidates", async () => {
    const scoringMock = vi.fn().mockResolvedValue([sampleCandidate]);
    const progressMock = vi.fn().mockResolvedValue(undefined);

    const candidates = await runClipScoringJob(
      {
        jobId: "job-123",
        duration: 30,
        cues: [
          { start: 0, end: 10, text: "Intro speech" },
          { start: 10, end: 30, text: "Main content" },
        ],
        options: { platform: "tiktok" },
      },
      mockDb,
      {
        scoringFn: scoringMock,
        updateProgress: progressMock,
      }
    );

    expect(candidates).toEqual([sampleCandidate]);
    expect(scoringMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalDuration: 30,
        options: { platform: "tiktok" },
      })
    );

    // Verify status updates
    expect(mockDb.videoJob.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: { status: "PROCESSING", progress: 10 },
    });

    expect(mockDb.videoJob.update).toHaveBeenCalledWith({
      where: { id: "job-123" },
      data: {
        status: "COMPLETED",
        progress: 100,
        jobData: {
          kind: "CLIP_SCORING",
          candidates: [sampleCandidate],
        },
      },
    });

    expect(progressMock).toHaveBeenCalledWith(100);
  });

  it("marks VideoJob as FAILED and rethrows error when scoringFn fails", async () => {
    const scoringError = new Error("OpenAI rate limit exceeded");
    const scoringMock = vi.fn().mockRejectedValue(scoringError);

    await expect(
      runClipScoringJob(
        {
          jobId: "job-fail-1",
          duration: 30,
          cues: [{ start: 0, end: 10, text: "Sample" }],
        },
        mockDb,
        {
          scoringFn: scoringMock,
        }
      )
    ).rejects.toThrow("OpenAI rate limit exceeded");

    expect(mockDb.videoJob.update).toHaveBeenCalledWith({
      where: { id: "job-fail-1" },
      data: {
        status: "FAILED",
        error: "OpenAI rate limit exceeded",
      },
    });
  });

  it("marks VideoJob as FAILED when no transcript cues are found", async () => {
    mockDb.demo!.findUnique = vi.fn().mockResolvedValue({
      id: "demo-no-cues",
      subtitles: null,
      duration: 10,
      videoUrl: "https://example.com/demo.mp4",
    });

    await expect(
      runClipScoringJob(
        {
          jobId: "job-no-cues",
          demoId: "demo-no-cues",
        },
        mockDb
      )
    ).rejects.toThrow("No transcript cues found for clip scoring");

    expect(mockDb.videoJob.update).toHaveBeenCalledWith({
      where: { id: "job-no-cues" },
      data: expect.objectContaining({
        status: "FAILED",
      }),
    });
  });
});
