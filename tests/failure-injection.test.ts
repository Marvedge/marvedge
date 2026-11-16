// Failure injection tests for job creation pipeline
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { isSafeUrl } from "@/app/lib/safeUrl";
import { mayResolveObject } from "@/app/lib/storage/access";
import { getPresignedUrl } from "@/app/lib/storage/index";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/app/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, after: vi.fn() };
});
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    demo: { findUnique: vi.fn(), findFirst: vi.fn() },
    videoJob: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    exportedVideo: { count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/app/lib/gcpWorker", () => ({ invokeGcpWorker: vi.fn() }));
vi.mock("@/app/lib/storage/index", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getPresignedUrl: vi.fn() };
});
vi.mock("@/app/lib/storage/access", () => ({ mayResolveObject: vi.fn() }));
vi.mock("@/app/lib/audio/rateLimit", () => ({ isRateLimited: vi.fn() }));
vi.mock("@/app/lib/safeUrl", () => ({ isSafeUrl: vi.fn() }));
vi.mock("@/app/lib/subtitles", () => ({
  normalizeLanguage: vi.fn(() => "multi"),
  sanitizeSubtitleStyle: vi.fn(() => undefined),
}));
vi.mock("@/app/lib/wtm/flags", () => ({ isWtmEnabled: vi.fn(() => false) }));
vi.mock("@/app/lib/wtm/access", () => ({ isWtmAllowed: vi.fn(() => false) }));
vi.mock("@/app/lib/wtm/watermark", () => ({ resolveWatermarkForPlan: vi.fn(() => undefined) }));

import { invokeGcpWorker } from "@/app/lib/gcpWorker";
import { POST } from "../app/api/jobs/create/route";
import { after } from "next/server";

function makeRequest(body) {
  return new NextRequest("http://localhost/api/jobs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Failure injection tests for job creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
    } as any);
    vi.mocked(prisma.user.findFirst as any).mockResolvedValue({ id: "user-1", plan: "PRO" } as any);
    vi.mocked(isRateLimited as any).mockResolvedValue(false);
    vi.mocked(isSafeUrl as any).mockReturnValue(true);
    vi.mocked(mayResolveObject as any).mockResolvedValue(true);
    vi.mocked(getPresignedUrl as any).mockImplementation((url) => Promise.resolve(url));
    // Transaction mock – runs callback and returns job record
    vi.mocked(prisma.$transaction as any).mockImplementation(async (cb) => cb({
      $queryRaw: vi.fn(),
      videoJob: { create: vi.fn(() => ({ id: "job-1" })) },
    }));
    vi.mocked(prisma.videoJob.findFirst as any).mockResolvedValue({ status: "PENDING" } as any);
    vi.mocked(prisma.videoJob.updateMany as any).mockResolvedValue({ count: 1 });
    // Mock findUnique to return a pending job status (required by dispatchVideoJob)
    vi.mocked(prisma.videoJob.findUnique as any).mockResolvedValue({ status: "PENDING" } as any);

    // GCP worker mock – chunk then merge
    vi.mocked(invokeGcpWorker as any)
      .mockResolvedValueOnce({ result: { processedObject: "job-1_chunk_000.mp4" } })
      .mockResolvedValueOnce({ result: { exportedUrl: "https://example.com/final.mp4" } });
  });

  it("fails when rate limit exceeded", async () => {
    vi.mocked(isRateLimited as any).mockResolvedValue(true);
    const resp = await POST(makeRequest({ videoUrl: "https://example.com/video.mp4", duration: 10 }));
    expect(resp.status).toBe(429);
    const json = await resp.json();
    expect(json.error).toContain("Too many export jobs");
  });

  it("fails when video URL unsafe", async () => {
    vi.mocked(isSafeUrl as any).mockReturnValue(false);
    const resp = await POST(makeRequest({ videoUrl: "http://malicious.local/video.mp4", duration: 10 }));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Video URL is not allowed");
  });

  it("fails when storage access denied", async () => {
    vi.mocked(mayResolveObject as any).mockResolvedValue(false);
    const resp = await POST(makeRequest({ videoUrl: "s3://bucket/obj.mp4", duration: 10 }));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Video URL is not allowed");
  });

  it("marks job FAILED when dispatch worker never succeeds", async () => {
    vi.mocked(invokeGcpWorker as any).mockReset().mockRejectedValue(new Error("Unsupported video codec"));
    const resp = await POST(makeRequest({ videoUrl: "https://example.com/video.mp4", duration: 10 }));
    expect(resp.status).toBe(200);
    const dispatch = (after as any).mock.calls[0][0] as () => Promise<void>;
    await dispatch();
    expect(prisma.videoJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "FAILED", error: expect.any(String) },
    }));
  });

  it("marks job FAILED when merge worker fails", async () => {
    vi.mocked(invokeGcpWorker as any).mockReset();
    vi.mocked(invokeGcpWorker as any)
      .mockResolvedValueOnce({ result: { processedObject: "job-1_chunk_000.mp4" } })
      .mockRejectedValueOnce(new Error("Merge worker returned no usable export URL"));

    const resp = await POST(makeRequest({ videoUrl: "https://example.com/video.mp4", duration: 10 }));
    expect(resp.status).toBe(200);
    const dispatch = (after as any).mock.calls[0][0] as () => Promise<void>;
    await dispatch();
    expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: {
        status: "FAILED",
        error: "Merge worker returned no usable export URL",
      },
    });
  });
});

