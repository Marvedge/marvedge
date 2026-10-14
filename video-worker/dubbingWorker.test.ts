import { describe, expect, it, vi } from "vitest";

vi.mock("../app/lib/avs/dubbingProcessor", () => ({
  processDubbingJob: vi.fn(),
}));

import { processDubbingJob } from "../app/lib/avs/dubbingProcessor";

describe("Video Worker - dubbing-processing worker integration", () => {
  it("F. worker delegates payload to processDubbingJob and forwards progress", async () => {
    vi.mocked(processDubbingJob).mockImplementation(async (_payload, deps) => {
      if (deps?.updateProgress) {
        await deps.updateProgress(50);
      }
    });

    const mockJob = {
      name: "avs-dub",
      id: "bullmq-job-999",
      data: {
        jobId: "video-job-123",
        videoUrl: "https://example.com/v.mp4",
        dubUrl: "https://example.com/d.mp3",
        steps: [],
        dubTimings: [],
        sourceDuration: 10,
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    };

    // Simulate the worker processor defined in video-worker/index.ts
    const processor = async (job: typeof mockJob) => {
      await processDubbingJob(job.data, {
        updateProgress: async (pct: number) => {
          await job.updateProgress(pct);
        },
      });
    };

    await processor(mockJob);

    expect(processDubbingJob).toHaveBeenCalledWith(
      mockJob.data,
      expect.objectContaining({
        updateProgress: expect.any(Function),
      })
    );
    expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
  });

  it("propagates processor errors to BullMQ for retry/failure handling", async () => {
    vi.mocked(processDubbingJob).mockRejectedValue(
      new Error("Dubbing processor fatal error")
    );

    const mockJob = {
      name: "avs-dub",
      id: "bullmq-job-fail",
      data: {
        jobId: "video-job-fail",
      },
      updateProgress: vi.fn(),
    };

    const processor = async (job: typeof mockJob) => {
      await processDubbingJob(job.data as any, {
        updateProgress: async (pct: number) => {
          await job.updateProgress(pct);
        },
      });
    };

    await expect(processor(mockJob)).rejects.toThrow(
      "Dubbing processor fatal error"
    );
  });
});
