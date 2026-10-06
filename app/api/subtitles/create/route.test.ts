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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpSubtitles: vi.fn(),
}));

vi.mock("groq-sdk", () => ({
  default: class MockGroq {},
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
import { invokeGcpSubtitles } from "@/app/lib/gcpWorker";
import { after } from "next/server";
import { POST } from "./route";

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/subtitles/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/subtitles/create URL security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u-1", email: "test@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1" } as never);
    vi.mocked(prisma.videoJob.create).mockResolvedValue({ id: "job-1" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(makePostRequest({ videoUrl: "https://example.com/v.mp4" }));
    expect(res.status).toBe(401);
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost/v.mp4",
    "http://127.0.0.1/v.mp4",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/v.mp4",
    "http://192.168.1.1/v.mp4",
    "http://metadata/v.mp4",
  ])("rejects unsafe videoUrl %s before creating a job", async (videoUrl) => {
    const res = await POST(makePostRequest({ videoUrl }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unsafe videoUrl");
    expect(prisma.videoJob.create).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(invokeGcpSubtitles).not.toHaveBeenCalled();
  });

  it("creates a job for a safe public URL", async () => {
    const res = await POST(makePostRequest({ videoUrl: "https://example.com/v.mp4" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, jobId: "job-1" });
    expect(prisma.videoJob.create).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(invokeGcpSubtitles).not.toHaveBeenCalled();
  });
});
