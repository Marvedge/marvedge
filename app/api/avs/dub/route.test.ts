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
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/avs/flags", () => ({
  isAvsEnabled: vi.fn(() => true),
}));

vi.mock("@/app/lib/avs/access", () => ({
  isAvsAllowed: vi.fn((plan: string) => plan === "PRO" || plan === "ENTERPRISE"),
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpDubSync: vi.fn(),
}));

// Mock Next.js after() to be controllable with vi.fn() while synchronously invoking by default
const mockAfter = vi.fn((fn: () => unknown) => {
  fn();
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => unknown) => mockAfter(fn),
  };
});

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isAvsEnabled } from "@/app/lib/avs/flags";
import { isAvsAllowed } from "@/app/lib/avs/access";
import { invokeGcpDubSync } from "@/app/lib/gcpWorker";
import { POST, runDubAlignment } from "./route";

function makeDubRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/avs/dub", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/avs/dub & runDubAlignment (Task-00083)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAvsEnabled).mockReturnValue(true);
    vi.mocked(isAvsAllowed).mockImplementation((p) => p === "PRO" || p === "ENTERPRISE");
    vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });
  });

  describe("Synchronous Route Validation (Deterministic Rejection)", () => {
    it("returns 404 when AVS feature flag is disabled", async () => {
      vi.mocked(isAvsEnabled).mockReturnValue(false);
      const req = makeDubRequest({ videoUrl: "https://example.com/video.mp4" });
      const res = await POST(req);
      expect(res.status).toBe(404);
      expect(prisma.videoJob.create).not.toHaveBeenCalled();
    });

    it("returns 401 when session is missing", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      const req = makeDubRequest({ videoUrl: "https://example.com/video.mp4" });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(prisma.videoJob.create).not.toHaveBeenCalled();
    });

    it("returns 404 when user is not found", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      const req = makeDubRequest({ videoUrl: "https://example.com/video.mp4" });
      const res = await POST(req);
      expect(res.status).toBe(404);
      expect(prisma.videoJob.create).not.toHaveBeenCalled();
    });

    // master (origin/master) removed the PRO/ENTERPRISE gate from /api/avs/dub.
    // The route comment reads: "Open to every signed-in plan for now."
    // FREE users are therefore accepted: they reach videoJob.create() and get 200.
    it("accepts FREE-plan user and returns 200 with jobId (plan gate removed in master)", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", plan: "FREE" } as never);
      vi.mocked(prisma.videoJob.create).mockResolvedValue({ id: "job-free-1" } as never);
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);
      const req = makeDubRequest({ videoUrl: "https://example.com/video.mp4" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true, jobId: "job-free-1" });
      expect(prisma.videoJob.create).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when videoUrl is missing", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", plan: "PRO" } as never);
      const req = makeDubRequest({});
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing videoUrl");
      expect(prisma.videoJob.create).not.toHaveBeenCalled();
    });

    it("returns 404 when demoId belongs to a different user", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", plan: "PRO" } as never);
      vi.mocked(prisma.demo.findUnique).mockResolvedValue({ id: "demo-1", userId: "u-other" } as never);

      const req = makeDubRequest({
        videoUrl: "https://example.com/video.mp4",
        demoId: "demo-1",
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
      expect(prisma.videoJob.create).not.toHaveBeenCalled();
    });

    it("creates a VideoJob with kind AVS_DUB and returns jobId on valid request", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", plan: "PRO" } as never);
      vi.mocked(prisma.videoJob.create).mockResolvedValue({ id: "job-dub-123" } as never);
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);

      const req = makeDubRequest({
        videoUrl: "gs://bucket/reframed_captioned.mp4",
        dubUrl: "https://example.com/dub.mp3",
        steps: [{ id: "step-1", startTime: 0, endTime: 5 }],
        dubTimings: [{ stepId: "step-1", start: 0, end: 5.2 }],
        duration: 10,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true, jobId: "job-dub-123" });

      expect(prisma.videoJob.create).toHaveBeenCalledWith({
        data: {
          userId: "u-1",
          demoId: null,
          videoUrl: "https://storage.googleapis.com/bucket/reframed_captioned.mp4",
          status: "PENDING",
          jobData: { kind: "AVS_DUB" },
        },
      });
    });
  });

  describe("Background Execution & Graceful Degradation (runDubAlignment)", () => {
    const defaultInput = {
      videoUrl: "https://storage.googleapis.com/bucket/reframed_captioned.mp4",
      dubUrl: "https://example.com/dub.mp3",
      steps: [{ id: "step-1", index: 0, startTime: 0, endTime: 5 }],
      dubTimings: [{ stepId: "step-1", start: 0, end: 5.2 }],
      sourceDuration: 10,
    };

    it("Scenario 1: Successful dubbing produces aligned output with fallback=false", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);
      vi.mocked(invokeGcpDubSync).mockResolvedValue({
        alignedVideoUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned-output.mp4",
        duration: 10.2,
      });

      await runDubAlignment("job-dub-1", defaultInput);

      expect(invokeGcpDubSync).toHaveBeenCalledWith({
        videoUrl: defaultInput.videoUrl,
        dubUrl: defaultInput.dubUrl,
        steps: defaultInput.steps,
        dubTimings: defaultInput.dubTimings,
      });

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-dub-1", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned-output.mp4",
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: "https://storage.googleapis.com/bucket/avs-dub/aligned-output.mp4",
            duration: 10.2,
            fallback: false,
          },
          error: null,
        },
      });
    });

    it("Scenario 2: Missing dub input gracefully completes with input video and fallback=true", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);

      await runDubAlignment("job-dub-2", {
        ...defaultInput,
        dubUrl: "", // missing dubUrl
      });

      expect(invokeGcpDubSync).not.toHaveBeenCalled();

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-dub-2", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: defaultInput.videoUrl,
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: defaultInput.videoUrl,
            duration: 10,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: "MISSING_DUB_INPUT",
          },
          error: null,
        },
      });
    });

    it("Scenario 3: Cloud Run worker failure gracefully degrades to COMPLETED with fallback metadata", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);
      vi.mocked(invokeGcpDubSync).mockRejectedValue(
        new Error("FFmpeg process failed with exit code 1: Invalid audio stream")
      );

      await runDubAlignment("job-dub-3", defaultInput);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-dub-3", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: defaultInput.videoUrl,
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: defaultInput.videoUrl,
            duration: 10,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: "FFmpeg process failed with exit code 1: Invalid audio stream",
          },
          error: null,
        },
      });
    });

    it("Scenario 4: Transient retry exhaustion gracefully degrades to COMPLETED with fallback metadata", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);
      vi.mocked(invokeGcpDubSync).mockRejectedValue(
        new Error("GCP worker failed after multiple retries")
      );

      await runDubAlignment("job-dub-4", defaultInput);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-dub-4", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: defaultInput.videoUrl,
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: defaultInput.videoUrl,
            duration: 10,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: "GCP worker failed after multiple retries",
          },
          error: null,
        },
      });
    });

    it("Scenario 5: gs:// URL input is normalized to HTTPS URL in fallback metadata and exportedUrl", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);
      vi.mocked(invokeGcpDubSync).mockRejectedValue(new Error("Worker timeout"));

      await runDubAlignment("job-dub-5", {
        ...defaultInput,
        videoUrl: "gs://my-bucket/reframed_clip.mp4",
      });

      const expectedHttpUrl = "https://storage.googleapis.com/my-bucket/reframed_clip.mp4";

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: { id: "job-dub-5", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: expectedHttpUrl,
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: expectedHttpUrl,
            duration: 10,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: "Worker timeout",
          },
          error: null,
        },
      });
    });

    it("Scenario 6: Terminal-state protection ignores execution if job is already COMPLETED or CANCELLED", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "COMPLETED" } as never);

      await runDubAlignment("job-dub-6", defaultInput);

      expect(invokeGcpDubSync).not.toHaveBeenCalled();
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("BUG-002 Regression: POST dispatches runDubAlignment via after(), worker fails with fetch failed, job reaches COMPLETED fallback", async () => {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u-1" } });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "u-1", plan: "PRO" } as never);
      vi.mocked(prisma.videoJob.create).mockResolvedValue({ id: "job-dub-regression" } as never);
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({ status: "PENDING" } as never);

      // 1. Prisma updateMany succeeds for both calls (PROCESSING update then COMPLETED fallback)
      vi.mocked(prisma.videoJob.updateMany)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      // 2. Mock GCP worker failure exactly as Task-85 observed it (network/fetch failure)
      vi.mocked(invokeGcpDubSync).mockRejectedValue(new Error("fetch failed"));

      // 3. Intercept after() callback so it is NOT executed synchronously during POST
      let capturedCallback: (() => Promise<unknown>) | null = null;
      mockAfter.mockImplementationOnce((fn: () => unknown) => {
        capturedCallback = fn as () => Promise<unknown>;
      });

      const req = makeDubRequest({
        videoUrl: "https://storage.googleapis.com/bucket/source.mp4",
        dubUrl: "https://example.com/dub.mp3",
        steps: [{ id: "step-1", startTime: 0, endTime: 5 }],
        dubTimings: [{ stepId: "step-1", start: 0, end: 5.2 }],
        duration: 10,
      });

      const res = await POST(req);

      // Assert 1: POST response is 200
      expect(res.status).toBe(200);

      // Assert 2: jobId is correct
      const json = await res.json();
      expect(json).toEqual({ success: true, jobId: "job-dub-regression" });

      // Assert 3: after() registered exactly one callback
      expect(mockAfter).toHaveBeenCalledTimes(1);
      expect(capturedCallback).not.toBeNull();

      // Assert 4: callback was NOT executed synchronously as part of POST
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
      expect(invokeGcpDubSync).not.toHaveBeenCalled();

      // Assert 5: manually awaiting the callback completes successfully
      await expect(capturedCallback!()).resolves.toBeUndefined();

      // Assert 6 & 7 & 8: verify updateMany calls
      const updateCalls = vi.mocked(prisma.videoJob.updateMany).mock.calls;
      expect(updateCalls).toHaveLength(2);

      // Assert 6: first updateMany sets status: PROCESSING, progress: 20
      expect(updateCalls[0][0]).toEqual({
        where: { id: "job-dub-regression", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: { status: "PROCESSING", progress: 20 },
      });

      // Assert 7 & 8: second updateMany sets status: COMPLETED, progress: 100 with fallback metadata
      expect(updateCalls[1][0]).toEqual({
        where: { id: "job-dub-regression", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://storage.googleapis.com/bucket/source.mp4",
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: "https://storage.googleapis.com/bucket/source.mp4",
            duration: 10,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: "fetch failed",
          },
          error: null,
        },
      });
    });
  });
});
