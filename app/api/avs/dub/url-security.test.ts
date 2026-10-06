import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/avs/flags", () => ({
  isAvsEnabled: vi.fn(() => true),
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpDubSync: vi.fn(),
}));

vi.mock("@/app/lib/queue", () => ({
  dubbingQueue: {
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
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { dubbingQueue } from "@/app/lib/queue";
import { POST } from "./route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/avs/dub", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/avs/dub URL security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "qa@example.test",
      },
    } as never);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "FREE",
    } as never);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-1",
    } as never);

    vi.mocked(dubbingQueue.add).mockResolvedValue(undefined as never);
  });

  it.each([
    "http://localhost:3000/private-video.mp4",
    "http://127.0.0.1:3000/private-video.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/private-video.mp4",
    "http://172.16.0.8/private-video.mp4",
    "http://192.168.1.8/private-video.mp4",
    "http://metadata/internal-video.mp4",
  ])("rejects unsafe videoUrl %s before creating a job", async (videoUrl) => {
    const response = await POST(
      makeRequest({
        videoUrl,
        duration: 20,
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unsafe videoUrl",
    });

    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000/private-audio.mp3",
    "http://127.0.0.1:3000/private-audio.mp3",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/private-audio.mp3",
    "http://metadata/internal-audio.mp3",
  ])("rejects unsafe dubUrl %s before creating a job", async (dubUrl) => {
    const response = await POST(
      makeRequest({
        videoUrl: "https://media.example.test/video.mp4",
        dubUrl,
        duration: 20,
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unsafe dubUrl",
    });

    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it("creates and queues a job for safe public URLs", async () => {
    const response = await POST(
      makeRequest({
        videoUrl: "https://media.example.test/video.mp4",
        dubUrl: "https://media.example.test/dubbed-audio.mp3",
        duration: 20,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      jobId: "job-1",
    });

    expect(prisma.videoJob.create).toHaveBeenCalledTimes(1);
    expect(dubbingQueue.add).toHaveBeenCalledTimes(1);
  });

  it("normalizes a safe GCS video URL before queueing", async () => {
    const response = await POST(
      makeRequest({
        videoUrl: "gs://qa-media-bucket/video.mp4",
        duration: 20,
      })
    );

    expect(response.status).toBe(200);

    expect(prisma.videoJob.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        demoId: null,
        videoUrl: "https://storage.googleapis.com/qa-media-bucket/video.mp4",
        status: "PENDING",
        jobData: {
          kind: "AVS_DUB",
        },
      },
    });

    expect(dubbingQueue.add).toHaveBeenCalledWith(
      "avs-dub",
      expect.objectContaining({
        videoUrl: "https://storage.googleapis.com/qa-media-bucket/video.mp4",
      }),
      {
        jobId: "job-1",
      }
    );
  });
});
