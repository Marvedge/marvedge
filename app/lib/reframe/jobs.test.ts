import { describe, expect, it, vi } from "vitest";
import type { CropTargetData } from "../../types/editor/crop-target";
import { runReframeJob, type ReframeDbClient } from "./jobs";
import type { ReframeJobPayload } from "./service";

function createFakeDb(initialJob: {
  id: string;
  status: string;
  progress?: number;
  jobData?: unknown;
  error?: string | null;
} | null) {
  let current = initialJob ? { ...initialJob } : null;

  const db: ReframeDbClient = {
    videoJob: {
      findUnique: vi.fn(async () => (current ? { jobData: null, ...current } : null)),
      update: vi.fn(async ({ data }) => {
        if (!current) throw new Error("Job not found");
        current = { ...current, ...data };
        return current;
      }),
    },
  };

  return { db, get: () => current };
}

const samplePayload: ReframeJobPayload = {
  jobId: "job-123",
  videoUrl: "https://example.com/video.mp4",
  targetAspectRatio: "9:16",
  userId: "user-1",
  demoId: "demo-1",
  source: {
    width: 1920,
    height: 1080,
    fps: 30,
    durationSec: 10,
  },
};

const validCropTargets: CropTargetData = {
  schema_version: 1,
  video_id: "job-123",
  source: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration_sec: 10,
  },
  output: {
    aspect_ratio: "9:16",
    width: 608,
    height: 1080,
  },
  timeline: {
    timebase: "seconds",
    sampling: "keyframes_interpolated",
  },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 656, y: 0, width: 608, height: 1080 },
    },
    {
      timestamp_sec: 5,
      crop: { x: 700, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("runReframeJob", () => {
  it("throws when VideoJob is not found", async () => {
    const { db } = createFakeDb(null);
    await expect(runReframeJob(samplePayload, db)).rejects.toThrow("VideoJob not found: job-123");
  });

  it("is idempotent when job is already COMPLETED", async () => {
    const { db, get } = createFakeDb({
      id: "job-123",
      status: "COMPLETED",
      jobData: {
        kind: "REFRAME",
        cropTargets: validCropTargets,
      },
    });

    const mlRunner = vi.fn();
    const result = await runReframeJob(samplePayload, db, { executeMlReframe: mlRunner });

    expect(result).toEqual(validCropTargets);
    expect(mlRunner).not.toHaveBeenCalled();
    expect(get()?.status).toBe("COMPLETED");
  });

  it("fails cleanly when no external ML backend is configured", async () => {
    const { db, get } = createFakeDb({
      id: "job-123",
      status: "PENDING",
      jobData: { kind: "REFRAME" },
    });

    await expect(runReframeJob(samplePayload, db)).rejects.toThrow(
      "AI/ML reframe service is not configured"
    );

    const updated = get();
    expect(updated?.status).toBe("FAILED");
    expect(updated?.error).toContain("AI/ML reframe service is not configured");
  });

  it("transitions to COMPLETED when external ML runner returns valid CropTargetData", async () => {
    const { db, get } = createFakeDb({
      id: "job-123",
      status: "PENDING",
      jobData: { kind: "REFRAME" },
    });

    const mlRunner = vi.fn(async (payload: ReframeJobPayload) => {
      expect(payload.jobId).toBe("job-123");
      expect(payload.targetAspectRatio).toBe("9:16");
      return validCropTargets;
    });

    const result = await runReframeJob(samplePayload, db, { executeMlReframe: mlRunner });

    expect(result).toEqual(validCropTargets);
    expect(mlRunner).toHaveBeenCalledTimes(1);

    const updated = get();
    expect(updated?.status).toBe("COMPLETED");
    expect(updated?.progress).toBe(100);
    expect(updated?.jobData).toEqual({
      kind: "REFRAME",
      targetAspectRatio: "9:16",
      cropTargets: validCropTargets,
    });
  });

  it("fails and marks VideoJob FAILED when ML runner output violates contract", async () => {
    const { db, get } = createFakeDb({
      id: "job-123",
      status: "PENDING",
      jobData: { kind: "REFRAME" },
    });

    const invalidCropTargets = {
      ...validCropTargets,
      crop_targets: [
        { timestamp_sec: 5, crop: { x: 0, y: 0, width: 608, height: 1080 } },
        { timestamp_sec: 2, crop: { x: 0, y: 0, width: 608, height: 1080 } }, // non-monotonic!
      ],
    } as unknown as CropTargetData;

    const mlRunner = vi.fn(async () => invalidCropTargets);

    await expect(
      runReframeJob(samplePayload, db, { executeMlReframe: mlRunner })
    ).rejects.toThrow("crop target timestamps must be strictly increasing");

    const updated = get();
    expect(updated?.status).toBe("FAILED");
    expect(updated?.error).toContain("crop target timestamps must be strictly increasing");
  });
});
