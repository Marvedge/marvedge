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
      create: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/queue", () => ({
  dubbingQueue: {
    add: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { dubbingQueue } from "@/app/lib/queue";
import { POST } from "./route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/dubbing/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/dubbing/create URL security", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "qa@example.test",
      },
    } as never);

    vi.mocked(prisma.videoJob.create).mockResolvedValue({
      id: "job-1",
    } as never);

    vi.mocked(dubbingQueue.add).mockResolvedValue(undefined as never);
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        sourceUrl: "https://media.example.test/video.mp4",
        targetLanguage: "ta",
      })
    );

    expect(response.status).toBe(401);
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it("returns 400 when sourceUrl is missing", async () => {
    const response = await POST(
      makeRequest({
        targetLanguage: "ta",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Missing sourceUrl",
    });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-HTTP source URL", async () => {
    const response = await POST(
      makeRequest({
        sourceUrl: "file:///etc/passwd",
        targetLanguage: "ta",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "sourceUrl must be an HTTP or HTTPS URL",
    });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000/internal",
    "http://127.0.0.1:3000/internal",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/private-video.mp4",
    "http://172.16.0.8/private-video.mp4",
    "http://192.168.1.8/private-video.mp4",
    "http://metadata/internal-video.mp4",
  ])("rejects unsafe source URL %s before creating a job", async (sourceUrl) => {
    const response = await POST(
      makeRequest({
        sourceUrl,
        targetLanguage: "ta",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Unsafe sourceUrl",
    });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid target language", async () => {
    const response = await POST(
      makeRequest({
        sourceUrl: "https://media.example.test/video.mp4",
        targetLanguage: "../../internal",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid targetLanguage",
    });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(dubbingQueue.add).not.toHaveBeenCalled();
  });

  it("creates and queues a job for a safe public URL", async () => {
    const response = await POST(
      makeRequest({
        sourceUrl: "https://media.example.test/video.mp4",
        targetLanguage: "fr",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      jobId: "job-1",
      targetLanguage: "fr",
    });

    expect(prisma.videoJob.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        videoUrl: "https://media.example.test/video.mp4",
        status: "PENDING",
        progress: 0,
        jobData: {
          kind: "DUBBING",
          targetLanguage: "fr",
        },
      },
    });

    expect(dubbingQueue.add).toHaveBeenCalledWith(
      "dubbing",
      {
        jobId: "job-1",
        sourceUrl: "https://media.example.test/video.mp4",
        targetLanguage: "fr",
      },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
  });
});
