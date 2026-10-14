import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { prisma } from "@/app/lib/prisma";

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    demo: {
      update: vi.fn(),
    },
  },
}));

const TEST_SECRET = "test-callback-secret-123";

function createCallbackRequest(body: unknown, token = TEST_SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/jobs/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/jobs/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALLBACK_SECRET = TEST_SECRET;
  });

  describe("Authentication", () => {
    it("rejects request without authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "job-1", status: "COMPLETED" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("rejects request with wrong secret", async () => {
      const req = createCallbackRequest(
        { jobId: "job-1", status: "COMPLETED" },
        "wrong-secret"
      );

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Input validation", () => {
    it("rejects missing jobId", async () => {
      const req = createCallbackRequest({ status: "COMPLETED" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Missing jobId");
    });

    it("rejects invalid status", async () => {
      const req = createCallbackRequest({ jobId: "job-1", status: "UNKNOWN_STATE" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid status");
    });

    it("returns 404 if job does not exist", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

      const req = createCallbackRequest({ jobId: "non-existent", status: "COMPLETED" });
      const res = await POST(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Job not found");
    });
  });

  describe("AVS_DUB COMPLETED callback", () => {
    it("updates status, progress, alignedVideoUrl, and duration while preserving existing jobData", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-1",
        demoId: "demo-123",
        status: "PENDING",
        jobData: {
          kind: "AVS_DUB",
          initialField: "preserved",
          stepCount: 4,
        },
      } as any);

      vi.mocked(prisma.videoJob.update).mockResolvedValue({} as any);

      const req = createCallbackRequest({
        jobId: "job-dub-1",
        status: "COMPLETED",
        alignedVideoUrl: "https://storage.googleapis.com/test-bucket/aligned.mp4",
        duration: 42.5,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(prisma.videoJob.update).toHaveBeenCalledTimes(1);
      expect(prisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "job-dub-1" },
        data: {
          status: "COMPLETED",
          progress: 100,
          jobData: {
            kind: "AVS_DUB",
            initialField: "preserved",
            stepCount: 4,
            alignedVideoUrl: "https://storage.googleapis.com/test-bucket/aligned.mp4",
            duration: 42.5,
          },
        },
      });

      // Crucially, Demo.exportedUrl must NOT be modified for AVS_DUB
      expect(prisma.demo.update).not.toHaveBeenCalled();
    });

    it("rejects completed AVS_DUB callback with missing or empty alignedVideoUrl", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-1",
        demoId: null,
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-dub-1",
        status: "COMPLETED",
        duration: 30,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("alignedVideoUrl");
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });

    it("rejects completed AVS_DUB callback with non-http/https alignedVideoUrl", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-1",
        demoId: null,
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-dub-1",
        status: "COMPLETED",
        alignedVideoUrl: "javascript:alert(1)",
        duration: 30,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("alignedVideoUrl");
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });

    it("rejects completed AVS_DUB callback with negative duration", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-1",
        demoId: null,
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-dub-1",
        status: "COMPLETED",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned.mp4",
        duration: -5,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("duration");
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });

    it("rejects completed AVS_DUB callback with non-finite or non-number duration", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-1",
        demoId: null,
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-dub-1",
        status: "COMPLETED",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned.mp4",
        duration: "not-a-number",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("duration");
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });
  });

  describe("AVS_DUB FAILED callback", () => {
    it("updates status to FAILED with error message and preserves jobData", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-fail",
        demoId: null,
        status: "PENDING",
        jobData: {
          kind: "AVS_DUB",
          originalPacing: "preserved",
        },
      } as any);

      vi.mocked(prisma.videoJob.update).mockResolvedValue({} as any);

      const req = createCallbackRequest({
        jobId: "job-dub-fail",
        status: "FAILED",
        error: "Voiceover audio stretched beyond bounds",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      expect(prisma.videoJob.update).toHaveBeenCalledTimes(1);
      expect(prisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "job-dub-fail" },
        data: {
          status: "FAILED",
          error: "Voiceover audio stretched beyond bounds",
        },
      });
    });

    it("uses default error message if error is missing", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-dub-fail-2",
        demoId: null,
        status: "PENDING",
        jobData: { kind: "AVS_DUB" },
      } as any);

      vi.mocked(prisma.videoJob.update).mockResolvedValue({} as any);

      const req = createCallbackRequest({
        jobId: "job-dub-fail-2",
        status: "FAILED",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "job-dub-fail-2" },
        data: {
          status: "FAILED",
          error: "Dub-sync alignment failed",
        },
      });
    });
  });

  describe("Terminal-state safety and idempotency", () => {
    it("safely ignores duplicate COMPLETED callback without re-updating DB", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-already-completed",
        demoId: "demo-1",
        status: "COMPLETED",
        jobData: { kind: "AVS_DUB", alignedVideoUrl: "https://old.mp4", duration: 10 },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-already-completed",
        status: "COMPLETED",
        alignedVideoUrl: "https://new.mp4",
        duration: 12,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Must NOT update prisma when already COMPLETED
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
      expect(prisma.demo.update).not.toHaveBeenCalled();
    });

    it("does not allow late FAILED callback to regress a COMPLETED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-completed",
        demoId: "demo-1",
        status: "COMPLETED",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-completed",
        status: "FAILED",
        error: "Late failure",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });

    it("does not allow late callback to regress a CANCELLED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-cancelled",
        demoId: "demo-1",
        status: "CANCELLED",
        jobData: { kind: "AVS_DUB" },
      } as any);

      const req = createCallbackRequest({
        jobId: "job-cancelled",
        status: "COMPLETED",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned.mp4",
        duration: 20,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(prisma.videoJob.update).not.toHaveBeenCalled();
    });
  });

  describe("Regression: non-AVS_DUB (e.g. export/reframe) jobs", () => {
    it("handles standard export COMPLETED callback and updates demo.exportedUrl", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-reframe-1",
        demoId: "demo-reframe-1",
        status: "PENDING",
        jobData: { segments: [] }, // No kind or REFRAME
      } as any);

      vi.mocked(prisma.videoJob.update).mockResolvedValue({} as any);
      vi.mocked(prisma.demo.update).mockResolvedValue({} as any);

      const req = createCallbackRequest({
        jobId: "job-reframe-1",
        status: "COMPLETED",
        exportedUrl: "https://storage.googleapis.com/bucket/final-export.mp4",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "job-reframe-1" },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://storage.googleapis.com/bucket/final-export.mp4",
          error: undefined,
        },
      });

      expect(prisma.demo.update).toHaveBeenCalledWith({
        where: { id: "demo-reframe-1" },
        data: {
          exportedUrl: "https://storage.googleapis.com/bucket/final-export.mp4",
        },
      });
    });

    it("handles standard export FAILED callback", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-reframe-fail",
        demoId: "demo-reframe-2",
        status: "PENDING",
        jobData: { segments: [] },
      } as any);

      vi.mocked(prisma.videoJob.update).mockResolvedValue({} as any);

      const req = createCallbackRequest({
        jobId: "job-reframe-fail",
        status: "FAILED",
        error: "FFmpeg out of memory",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(prisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "job-reframe-fail" },
        data: {
          status: "FAILED",
          progress: undefined,
          exportedUrl: undefined,
          error: "FFmpeg out of memory",
        },
      });

      expect(prisma.demo.update).not.toHaveBeenCalled();
    });
  });
});
