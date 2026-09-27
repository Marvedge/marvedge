import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/queue", () => ({
  reframeQueue: {
    add: vi.fn(),
  },
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
    },
    videoJob: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/safeUrl", () => ({
  isSafeUrl: vi.fn((url: string) => !url.includes("unsafe")),
}));

vi.mock("@/app/lib/reframe/service", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/reframe/service")>(
    "@/app/lib/reframe/service"
  );
  return {
    ...actual,
    reframeJobQueue: {
      add: vi.fn(),
    },
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { reframeJobQueue } from "@/app/lib/reframe/service";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/reframe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reframe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(makeRequest({ videoUrl: "https://example.com/v.mp4", targetAspectRatio: "9:16" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 when user not found", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1", email: "test@example.com" },
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ videoUrl: "https://example.com/v.mp4", targetAspectRatio: "9:16" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("User not found");
  });

  it("returns 400 when body validation fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1" },
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1" } as never);

    const res = await POST(makeRequest({ targetAspectRatio: "9:16" })); // missing videoUrl
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("videoUrl is required");
  });

  it("returns 400 when videoUrl is unsafe", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1" },
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1" } as never);

    const res = await POST(
      makeRequest({ videoUrl: "http://unsafe.internal/v.mp4", targetAspectRatio: "9:16" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid video URL");
  });

  it("returns 404 when demoId does not belong to caller", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1" },
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1" } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-other",
      userId: "u-someone-else",
    } as never);

    const res = await POST(
      makeRequest({
        videoUrl: "https://example.com/v.mp4",
        targetAspectRatio: "9:16",
        demoId: "demo-other",
      })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Demo not found");
  });

  it("creates VideoJob(PENDING), enqueues to BullMQ, and returns jobId", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1" },
    });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1" } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-1",
      userId: "u-1",
    } as never);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-new-456",
      userId: "u-1",
      demoId: "demo-1",
      videoUrl: "https://example.com/v.mp4",
      status: "PENDING",
      progress: 0,
    } as never);

    const res = await POST(
      makeRequest({
        videoUrl: "https://example.com/v.mp4",
        targetAspectRatio: "9:16",
        demoId: "demo-1",
        source: { width: 1920, height: 1080, fps: 30, durationSec: 12 },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      jobId: "job-new-456",
      status: "pending",
    });

    expect(prisma.videoJob.create).toHaveBeenCalledWith({
      data: {
        userId: "u-1",
        demoId: "demo-1",
        videoUrl: "https://example.com/v.mp4",
        status: "PENDING",
        progress: 0,
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
          source: { width: 1920, height: 1080, fps: 30, durationSec: 12 },
        },
      },
    });

    expect(reframeJobQueue.add).toHaveBeenCalledWith(
      "reframe",
      {
        jobId: "job-new-456",
        userId: "u-1",
        demoId: "demo-1",
        videoUrl: "https://example.com/v.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: 1080, fps: 30, durationSec: 12 },
      },
      { jobId: "job-new-456" }
    );
  });
});
