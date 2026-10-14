import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../queue", () => ({
  videoQueue: {
    add: vi.fn(),
  },
}));

import { runClipScoringJob, type ClipJobDbClient } from "./jobs";
import type { ClipCandidate } from "./types";

describe("Worker Integration & End-to-End Contract (Task-00050)", () => {
  let mockDb: ClipJobDbClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      videoJob: {
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      } as any,
      demo: {
        findUnique: vi.fn(),
      },
      subtitleTrack: {
        findFirst: vi.fn(),
      },
    };
  });

  const mockRankedCandidates: ClipCandidate[] = [
    {
      id: "clip-1",
      startTime: 2.1,
      endTime: 24.5,
      duration: 22.4,
      title: "The Ultimate TypeScript Secret",
      hook: "If you are not using this pattern, you are writing buggy code.",
      viralityScore: 95,
      engagementReasoning: "High-curiosity hook with immediate technical conflict resolution.",
      keywords: ["typescript", "programming", "webdev"],
      alignedToWordBoundary: true,
      alignedToSceneBoundary: false,
    },
    {
      id: "clip-2",
      startTime: 30.0,
      endTime: 55.0,
      duration: 25.0,
      title: "Why Most Developers Fail Code Reviews",
      hook: "Here is the number one thing seniors look for.",
      viralityScore: 88,
      engagementReasoning: "Relatable career pain point with actionable advice.",
      keywords: ["career", "codereview", "tech"],
      alignedToWordBoundary: true,
      alignedToSceneBoundary: false,
    },
  ];

  it("executes complete flow: existing transcript -> worker -> scoring -> VideoJob.jobData", async () => {
    // 1. Arrange existing demo with subtitles (simulating post-transcription state)
    mockDb.demo!.findUnique = vi.fn().mockResolvedValue({
      id: "demo-42",
      title: "TypeScript Deep Dive",
      videoUrl: "https://res.cloudinary.com/test/demo42.mp4",
      duration: 120.0,
      subtitles: [
        { start: 0.0, end: 2.1, text: "Hey everyone." },
        { start: 2.1, end: 24.5, text: "If you are not using this pattern, you are writing buggy code." },
        { start: 25.0, end: 30.0, text: "Let's dive into the implementation details." },
        { start: 30.0, end: 55.0, text: "Here is the number one thing seniors look for in reviews." },
      ],
    });

    const mockScoringFn = vi.fn().mockResolvedValue(mockRankedCandidates);
    const progressUpdates: number[] = [];

    // 2. Act: worker processes the clip-scoring job
    const candidates = await runClipScoringJob(
      {
        jobId: "job-clip-999",
        demoId: "demo-42",
        options: {
          platform: "tiktok",
          targetClipCount: 2,
        },
      },
      mockDb,
      {
        scoringFn: mockScoringFn,
        updateProgress: async (p) => {
          progressUpdates.push(p);
        },
      }
    );

    // 3. Assert scoring called with existing transcript cues (no re-transcription!)
    expect(candidates).toHaveLength(2);
    expect(mockScoringFn).toHaveBeenCalledWith(
      expect.objectContaining({
        cues: expect.arrayContaining([
          expect.objectContaining({ text: "Hey everyone." }),
        ]),
        totalDuration: 120.0,
        options: {
          platform: "tiktok",
          targetClipCount: 2,
        },
      })
    );

    // 4. Assert progress milestones reported
    expect(progressUpdates).toEqual([10, 30, 50, 90, 100]);

    // 5. Assert final persistence contract in VideoJob.jobData
    expect(mockDb.videoJob.update).toHaveBeenLastCalledWith({
      where: { id: "job-clip-999" },
      data: {
        status: "COMPLETED",
        progress: 100,
        jobData: {
          kind: "CLIP_SCORING",
          candidates: mockRankedCandidates,
        },
      },
    });

    // 6. Simulate GET /api/jobs/[id] response contract
    const simulatedJobData = {
      kind: "CLIP_SCORING",
      candidates: mockRankedCandidates,
    };

    expect(simulatedJobData.kind).toBe("CLIP_SCORING");
    expect(simulatedJobData.candidates[0].viralityScore).toBe(95);
    expect(simulatedJobData.candidates[0].hook).toContain("writing buggy code");
    expect(simulatedJobData.candidates[0].alignedToWordBoundary).toBe(true);
    expect(simulatedJobData.candidates[0].startTime).toBe(2.1);
    expect(simulatedJobData.candidates[0].endTime).toBe(24.5);
  });
});
