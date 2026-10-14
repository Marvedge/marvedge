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
    user: {
      findFirst: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
    },
    videoJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/avs/flags", () => ({
  isAvsEnabled: vi.fn(() => true),
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpSync: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isAvsEnabled } from "@/app/lib/avs/flags";
import { invokeGcpSync } from "@/app/lib/gcpWorker";
import { after } from "next/server";
import { POST } from "./route";

function makeSyncRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/avs/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/avs/sync URL security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAvsEnabled).mockReturnValue(true);
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "qa@example.test" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "PRO",
    } as never);
    vi.mocked(prisma.videoJob.create).mockResolvedValue({ id: "job-1" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(
      makeSyncRequest({ videoUrl: "https://example.com/v.mp4" })
    );
    expect(res.status).toBe(401);
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000/private-video.mp4",
    "http://127.0.0.1:3000/private-video.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/private-video.mp4",
    "http://192.168.1.8/private-video.mp4",
    "http://metadata/internal-video.mp4",
  ])("rejects unsafe videoUrl %s before creating a job", async (videoUrl) => {
    const res = await POST(makeSyncRequest({ videoUrl, duration: 20 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unsafe videoUrl" });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(invokeGcpSync).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000/private-audio.mp3",
    "http://127.0.0.1:3000/private-audio.mp3",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/private-audio.mp3",
    "http://metadata/internal-audio.mp3",
  ])("rejects unsafe audioUrl %s before creating a job", async (audioUrl) => {
    const res = await POST(
      makeSyncRequest({
        videoUrl: "https://media.example.test/video.mp4",
        audioUrl,
        duration: 20,
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unsafe audioUrl" });
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(invokeGcpSync).not.toHaveBeenCalled();
  });

  it("creates a job for safe public URLs", async () => {
    const res = await POST(
      makeSyncRequest({
        videoUrl: "https://media.example.test/video.mp4",
        audioUrl: "https://media.example.test/audio.mp3",
        duration: 20,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, jobId: "job-1" });
    expect(prisma.videoJob.create).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(invokeGcpSync).not.toHaveBeenCalled();
  });
});
