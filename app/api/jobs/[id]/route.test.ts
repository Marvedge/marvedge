import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/awsJobProgress", () => ({
  getAwsJobProgress: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { getAwsJobProgress } from "@/app/lib/awsJobProgress";
import { GET } from "./route";

function makeGetRequest(jobId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`);
  const context = { params: Promise.resolve({ id: jobId }) };
  return [req, context];
}

describe("GET /api/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const [req, ctx] = makeGetRequest("job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when job is not found", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

    const [req, ctx] = makeGetRequest("job-missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 403 when job belongs to a different user", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      userId: "u-other",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: null,
      error: null,
      jobData: null,
    } as never);

    const [req, ctx] = makeGetRequest("job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("exposes cropTargets when job kind is REFRAME", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    const sampleCropTargets = {
      schema_version: 1,
      source: { width: 1920, height: 1080 },
      output: { aspect_ratio: "9:16" },
      crop_targets: [{ timestamp_sec: 0, crop: { x: 656, y: 0, width: 608, height: 1080 } }],
    };

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-reframe-1",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: null,
      error: null,
      jobData: {
        kind: "REFRAME",
        targetAspectRatio: "9:16",
        cropTargets: sampleCropTargets,
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-reframe-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      id: "job-reframe-1",
      state: "completed",
      status: "completed",
      progress: 100,
      exportedUrl: null,
      error: null,
      subtitles: null,
      cropTargets: sampleCropTargets,
      jobData: {
        kind: "REFRAME",
        targetAspectRatio: "9:16",
        cropTargets: sampleCropTargets,
      },
    });
  });

  it("preserves subtitles for SUBTITLES jobs without returning cropTargets", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-sub-1",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: null,
      error: null,
      jobData: {
        kind: "SUBTITLES",
        subtitles: [{ text: "Hello" }],
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-sub-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subtitles).toEqual([{ text: "Hello" }]);
    expect(json.cropTargets).toBeUndefined();
    // Task-82: status and jobData must always be present.
    expect(json.status).toBe("completed");
    expect(json.jobData).toMatchObject({ kind: "SUBTITLES" });
  });

  it("surfaces fallback metadata when present on jobData", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-reframe-fallback",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: "https://example.com/reframed.mp4",
      error: null,
      jobData: {
        kind: "REFRAME",
        targetAspectRatio: "9:16",
        cropTargets: {
          schema_version: 1,
          source: { width: 1920, height: 1080 },
          output: { aspect_ratio: "9:16" },
          crop_targets: [{ timestamp_sec: 0, crop: { x: 656, y: 0, width: 608, height: 1080 } }],
        },
        fallback: true,
        fallbackStage: "REFRAME",
        fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
        attemptsMade: 1,
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-reframe-fallback");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    // Task-82: status and jobData must be present in every successful response.
    expect(json.id).toBe("job-reframe-fallback");
    expect(json.state).toBe("completed");
    expect(json.status).toBe("completed");
    expect(json.jobData).toMatchObject({
      kind: "REFRAME",
      fallback: true,
      fallbackStage: "REFRAME",
      fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
      attemptsMade: 1,
    });
    // Individual unpacked fields are preserved for backward compatibility.
    expect(json.fallback).toBe(true);
    expect(json.fallbackStage).toBe("REFRAME");
    expect(json.fallbackReason).toBe("AUTOFLIP_EMPTY_CROP_TARGETS");
    expect(json.attemptsMade).toBe(1);
  });

  it("surfaces alignedVideoUrl and duration for successful AVS_DUB jobs", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-dub-success",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned.mp4",
      error: null,
      jobData: {
        kind: "AVS_DUB",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned.mp4",
        duration: 12.5,
        fallback: false,
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-dub-success");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("completed");
    expect(json.status).toBe("completed");
    expect(json.aligned).toEqual({
      alignedVideoUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned.mp4",
      duration: 12.5,
    });
    expect(json.exportedUrl).toBe("https://storage.googleapis.com/bucket/avs-dub/aligned.mp4");
    expect(json.fallback).toBe(false);
  });

  it("surfaces graceful degradation fallback metadata for degraded AVS_DUB jobs", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-dub-degraded",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: "https://storage.googleapis.com/bucket/reframed_captioned.mp4",
      error: null,
      jobData: {
        kind: "AVS_DUB",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/reframed_captioned.mp4",
        duration: 10,
        fallback: true,
        fallbackStage: "DUBBING",
        fallbackReason: "GCP worker failed after multiple retries",
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-dub-degraded");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("completed");
    expect(json.status).toBe("completed");
    expect(json.aligned).toEqual({
      alignedVideoUrl: "https://storage.googleapis.com/bucket/reframed_captioned.mp4",
      duration: 10,
    });
    expect(json.exportedUrl).toBe("https://storage.googleapis.com/bucket/reframed_captioned.mp4");
    expect(json.fallback).toBe(true);
    expect(json.fallbackStage).toBe("DUBBING");
    expect(json.fallbackReason).toBe("GCP worker failed after multiple retries");
  });

  it("returns 400 for an empty id without hitting the database", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });

    const [req] = makeGetRequest("job-1");
    const emptyCtx = { params: Promise.resolve({ id: "" }) };
    const res = await GET(req, emptyCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid job id");
    expect(prisma.videoJob.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id without hitting the database", async () => {
    const [req] = makeGetRequest("job-1");
    for (const badId of ["../evil", "a".repeat(5000), "job id", "job.id"]) {
      vi.clearAllMocks();
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      const res = await GET(req, { params: Promise.resolve({ id: badId }) });
      expect(res.status).toBe(400);
      expect(prisma.videoJob.findUnique).not.toHaveBeenCalled();
    }
  });

  it("maps CANCELLED to cancelled", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-cancelled-1",
      userId: "u-1",
      status: "CANCELLED",
      progress: 40,
      exportedUrl: null,
      error: null,
      jobData: null,
    } as never);

    const [req, ctx] = makeGetRequest("job-cancelled-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("cancelled");
    expect(json.status).toBe("cancelled");
  });

  it("returns unknown instead of leaking an unmapped status", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-future-1",
      userId: "u-1",
      status: "SOME_FUTURE_STATUS",
      progress: 10,
      exportedUrl: null,
      error: null,
      jobData: null,
    } as never);

    const [req, ctx] = makeGetRequest("job-future-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBe("unknown");
    expect(json.status).toBe("unknown");
  });

  it("surfaces alignedVideoUrl and duration for AVS_SYNC jobs", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-sync-1",
      userId: "u-1",
      status: "COMPLETED",
      progress: 100,
      exportedUrl: "https://example.com/aligned.mp4",
      error: null,
      jobData: {
        kind: "AVS_SYNC",
        alignedVideoUrl: "https://example.com/aligned.mp4",
        duration: 8.25,
      },
    } as never);

    const [req, ctx] = makeGetRequest("job-sync-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.aligned).toEqual({
      alignedVideoUrl: "https://example.com/aligned.mp4",
      duration: 8.25,
    });
  });

  it("prefers AWS splitter progress when enabled", async () => {
    const prevAws = process.env.USE_AWS_SPLITTER;
    const prevGcp = process.env.USE_GCP_WORKER;
    process.env.USE_AWS_SPLITTER = "true";
    delete process.env.USE_GCP_WORKER;
    try {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-aws-1",
        userId: "u-1",
        status: "PROCESSING",
        progress: 5,
        exportedUrl: null,
        error: null,
        jobData: null,
      } as never);
      vi.mocked(getAwsJobProgress).mockResolvedValue({
        state: "active",
        progress: 62,
        exportedUrl: null,
        error: null,
        totalChunks: 10,
        chunksFinished: 6,
      });

      const [req, ctx] = makeGetRequest("job-aws-1");
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(getAwsJobProgress).toHaveBeenCalledWith("job-aws-1");
      expect(json.state).toBe("active");
      expect(json.progress).toBe(62);
    } finally {
      if (prevAws === undefined) {
        delete process.env.USE_AWS_SPLITTER;
      } else {
        process.env.USE_AWS_SPLITTER = prevAws;
      }
      if (prevGcp === undefined) {
        delete process.env.USE_GCP_WORKER;
      } else {
        process.env.USE_GCP_WORKER = prevGcp;
      }
    }
  });

  it("returns 500 when the database throws", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
    vi.mocked(prisma.videoJob.findUnique).mockRejectedValue(new Error("db down"));

    const [req, ctx] = makeGetRequest("job-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal Server Error");
  });
});
