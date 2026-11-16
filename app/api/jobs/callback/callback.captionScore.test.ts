import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    demo: {
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: any) => Promise<any>) =>
      fn({
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
        demo: {
          update: vi.fn().mockResolvedValue({}),
        },
      })
    ),
  },
}));

import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

const VALID_SECRET = "test-callback-secret";

function makeCallbackRequest(body: unknown, secret: string = VALID_SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/jobs/callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

const validCropTargets = {
  schema_version: 1,
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
  output: { aspect_ratio: "9:16" },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 420, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("POST /api/jobs/callback Caption and Score Persistence (Task 112)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALLBACK_SECRET = VALID_SECRET;
  });

  it("persists captionUrl and scoreJson on COMPLETED reframe callback", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "reframe-1",
      demoId: null,
      status: "PROCESSING",
      jobData: { kind: "REFRAME" },
    } as never);

    vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const payload = {
      jobId: "reframe-1",
      status: "COMPLETED",
      cropTargets: validCropTargets,
      exportedUrl: "https://res.cloudinary.com/test/reframed.mp4",
      captionUrl: "http://localhost:3000/api/subtitles/file/sub-1",
      score: {
        durationScore: 85,
        bitrateScore: 92,
        overlapScore: 15,
      },
    };

    const res = await POST(makeCallbackRequest(payload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(prisma.videoJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "reframe-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: expect.objectContaining({
          status: "COMPLETED",
          exportedUrl: "https://res.cloudinary.com/test/reframed.mp4",
          captionUrl: "http://localhost:3000/api/subtitles/file/sub-1",
          scoreJson: {
            durationScore: 85,
            bitrateScore: 92,
            overlapScore: 15,
          },
        }),
      })
    );
  });

  it("persists captionUrl and scoreJson on COMPLETED generic export callback", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "export-1",
      demoId: null,
      status: "PROCESSING",
      jobData: { kind: "EXPORT" },
    } as never);

    vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const payload = {
      jobId: "export-1",
      status: "COMPLETED",
      exportedUrl: "https://res.cloudinary.com/test/exported.mp4",
      captionUrl: "http://localhost:3000/api/subtitles/file/sub-2",
      score: {
        durationScore: 70,
        bitrateScore: 80,
      },
    };

    const res = await POST(makeCallbackRequest(payload));
    expect(res.status).toBe(200);

    expect(prisma.videoJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "export-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: expect.objectContaining({
          status: "COMPLETED",
          exportedUrl: "https://res.cloudinary.com/test/exported.mp4",
          captionUrl: "http://localhost:3000/api/subtitles/file/sub-2",
          scoreJson: {
            durationScore: 70,
            bitrateScore: 80,
          },
        }),
      })
    );
  });

  it("rejects callback with invalid captionUrl type or length exceeding 2048 chars", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      status: "PROCESSING",
      jobData: { kind: "REFRAME" },
    } as never);

    const res1 = await POST(
      makeCallbackRequest({
        jobId: "job-1",
        status: "COMPLETED",
        captionUrl: 12345, // invalid type
      })
    );
    expect(res1.status).toBe(400);
    expect(await res1.json()).toEqual({ error: "Invalid captionUrl" });

    const res2 = await POST(
      makeCallbackRequest({
        jobId: "job-1",
        status: "COMPLETED",
        captionUrl: "h".repeat(2049), // too long
      })
    );
    expect(res2.status).toBe(400);
    expect(await res2.json()).toEqual({ error: "Invalid captionUrl" });
  });

  it("rejects callback with out-of-range or non-numeric scores", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-1",
      status: "PROCESSING",
      jobData: { kind: "REFRAME" },
    } as never);

    // Negative durationScore
    const res1 = await POST(
      makeCallbackRequest({
        jobId: "job-1",
        status: "COMPLETED",
        score: { durationScore: -5, bitrateScore: 50 },
      })
    );
    expect(res1.status).toBe(400);
    expect((await res1.json()).error).toContain("Invalid score");

    // Over 100 bitrateScore
    const res2 = await POST(
      makeCallbackRequest({
        jobId: "job-1",
        status: "COMPLETED",
        score: { durationScore: 50, bitrateScore: 101 },
      })
    );
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toContain("Invalid score");

    // Invalid overlapScore
    const res3 = await POST(
      makeCallbackRequest({
        jobId: "job-1",
        status: "COMPLETED",
        score: { durationScore: 50, bitrateScore: 50, overlapScore: "not-a-number" },
      })
    );
    expect(res3.status).toBe(400);
    expect((await res3.json()).error).toContain("Invalid score");
  });

  it("preserves terminal state protection when callback contains captions and scores", async () => {
    vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
      id: "job-already-done",
      status: "COMPLETED",
      jobData: { kind: "REFRAME" },
    } as never);

    const payload = {
      jobId: "job-already-done",
      status: "COMPLETED",
      cropTargets: validCropTargets,
      exportedUrl: "https://example.com/late.mp4",
      captionUrl: "https://example.com/late.ass",
      score: { durationScore: 90, bitrateScore: 90 },
    };

    const res = await POST(makeCallbackRequest(payload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(true);
    expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
  });
});

