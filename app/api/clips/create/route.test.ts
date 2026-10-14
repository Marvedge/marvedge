import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/queue", () => ({
  videoQueue: {
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
    subtitleTrack: {
      findFirst: vi.fn(),
    },
    videoJob: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/clips/service", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/clips/service")>(
    "@/app/lib/clips/service"
  );
  return {
    ...actual,
    clipJobQueue: {
      add: vi.fn(),
    },
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { clipJobQueue } from "@/app/lib/clips/service";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/clips/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/clips/create (Task-00050)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(makeRequest({ demoId: "demo-1" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when user cannot be found in database", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-unknown" } });
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ demoId: "demo-1" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("User not found");
  });

  it("returns 404 when demo does not exist or user is not the owner", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as any);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({ id: "demo-1", userId: "other-user" } as any);

    const res = await POST(makeRequest({ demoId: "demo-1" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Demo not found");
  });

  it("returns 400 when demo has no transcript available", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as any);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
      subtitles: null,
      duration: 10,
      videoUrl: "https://example.com/demo.mp4",
    } as any);
    vi.mocked(prisma.subtitleTrack.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest({ demoId: "demo-1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No transcript cues found for clip scoring");
  });

  it("creates VideoJob and enqueues clip-scoring job on valid request with demo subtitles", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as any);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
      subtitles: [
        { start: 0, end: 5.2, text: "Welcome to Marvedge." },
        { start: 5.2, end: 12.0, text: "Here is how to create viral clips." },
      ],
      duration: 15.0,
      videoUrl: "https://res.cloudinary.com/test/demo.mp4",
    } as any);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-clip-123",
      userId: "user-1",
      demoId: "demo-1",
      status: "PENDING",
      progress: 0,
    } as any);

    const res = await POST(
      makeRequest({
        demoId: "demo-1",
        options: {
          platform: "tiktok",
          targetClipCount: 3,
        },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.jobId).toBe("job-clip-123");
    expect(data.status).toBe("pending");

    expect(prisma.videoJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        demoId: "demo-1",
        status: "PENDING",
        progress: 0,
        jobData: expect.objectContaining({
          kind: "CLIP_SCORING",
          cuesCount: 2,
        }),
      }),
    });

    expect(clipJobQueue.add).toHaveBeenCalledWith(
      "clip-scoring",
      expect.objectContaining({
        jobId: "job-clip-123",
        userId: "user-1",
        demoId: "demo-1",
        duration: 15.0,
        options: {
          platform: "tiktok",
          targetClipCount: 3,
        },
      }),
      { jobId: "job-clip-123" }
    );
  });

  it("accepts explicitly supplied cues without requiring existing demo transcript", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } });
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-1" } as any);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-direct-456",
      userId: "user-1",
      status: "PENDING",
      progress: 0,
    } as any);

    const res = await POST(
      makeRequest({
        videoUrl: "https://example.com/custom.mp4",
        cues: [{ start: 0, end: 10, text: "Direct custom cues" }],
        duration: 10,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBe("job-direct-456");
    expect(clipJobQueue.add).toHaveBeenCalledWith(
      "clip-scoring",
      expect.objectContaining({
        jobId: "job-direct-456",
        videoUrl: "https://example.com/custom.mp4",
        duration: 10,
      }),
      { jobId: "job-direct-456" }
    );
  });
});
