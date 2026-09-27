import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { dubbingQueue } from "@/app/lib/queue";

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

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/queue", () => ({
  dubbingQueue: {
    add: vi.fn().mockResolvedValue({ id: "bullmq-job-1" }),
  },
}));

function createDubRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/avs/dub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/avs/dub", () => {
  const mockUserId = "user-pro-1";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AVS_ENABLED = "true";

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: mockUserId, email: "pro@example.com" },
    } as any);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: mockUserId,
      plan: "PRO",
    } as any);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-new-123",
      userId: mockUserId,
      demoId: "demo-456",
      videoUrl: "https://storage.googleapis.com/bucket/video.mp4",
      status: "PENDING",
      jobData: { kind: "AVS_DUB" },
    } as any);
  });

  it("returns 404 when AVS feature flag is disabled", async () => {
    process.env.AVS_ENABLED = "false";
    const req = createDubRequest({ videoUrl: "https://example.com/v.mp4" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = createDubRequest({ videoUrl: "https://example.com/v.mp4" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user plan is FREE", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: mockUserId,
      plan: "FREE",
    } as any);

    const req = createDubRequest({ videoUrl: "https://example.com/v.mp4" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("PRO and ENTERPRISE");
  });

  it("returns 400 when videoUrl is missing", async () => {
    const req = createDubRequest({ steps: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing videoUrl");
  });

  it("returns 404 when referenced demo belongs to another user", async () => {
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-other",
      userId: "someone-else",
    } as any);

    const req = createDubRequest({
      videoUrl: "https://example.com/v.mp4",
      demoId: "demo-other",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Demo not found");
  });

  it("E. creates PENDING VideoJob and enqueues into dubbing-processing queue", async () => {
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-456",
      userId: mockUserId,
    } as any);

    const requestPayload = {
      videoUrl: "gs://raw-bucket/source.mp4",
      dubUrl: "https://storage.googleapis.com/dub-bucket/audio.mp3",
      steps: [
        { id: "s1", startTime: 0, endTime: 4.5 },
        { id: "s2", startTime: 4.5, endTime: 9.0 },
      ],
      dubTimings: [
        { stepId: "s1", start: 0, end: 5.0 },
        { stepId: "s2", start: 5.0, end: 10.2 },
      ],
      duration: 9.0,
      demoId: "demo-456",
    };

    const req = createDubRequest(requestPayload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, jobId: "job-new-123" });

    // VideoJob created in DB with PENDING status
    expect(prisma.videoJob.create).toHaveBeenCalledWith({
      data: {
        userId: mockUserId,
        demoId: "demo-456",
        videoUrl: "https://storage.googleapis.com/raw-bucket/source.mp4", // normalized gs:// -> https://
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      },
    });

    // Enqueued into BullMQ dubbing-processing
    expect(dubbingQueue.add).toHaveBeenCalledTimes(1);
    expect(dubbingQueue.add).toHaveBeenCalledWith(
      "avs-dub",
      {
        jobId: "job-new-123",
        videoUrl: "https://storage.googleapis.com/raw-bucket/source.mp4",
        dubUrl: "https://storage.googleapis.com/dub-bucket/audio.mp3",
        steps: [
          { id: "s1", index: 0, startTime: 0, endTime: 4.5 },
          { id: "s2", index: 1, startTime: 4.5, endTime: 9.0 },
        ],
        dubTimings: [
          { stepId: "s1", start: 0, end: 5.0 },
          { stepId: "s2", start: 5.0, end: 10.2 },
        ],
        sourceDuration: 9.0,
        userId: mockUserId,
        demoId: "demo-456",
      },
      {
        jobId: "job-new-123",
      }
    );
  });
});
