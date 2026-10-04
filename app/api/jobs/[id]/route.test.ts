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

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
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
      crop_targets: [
        { timestamp_sec: 0, crop: { x: 656, y: 0, width: 608, height: 1080 } },
      ],
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
});
