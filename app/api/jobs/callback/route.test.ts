import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.CALLBACK_SECRET = "test-callback-secret";

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    demo: {
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

function makePostRequest(body: unknown, token = "test-callback-secret"): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }

  return new NextRequest("http://localhost:3000/api/jobs/callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validCropTargets = {
  schema_version: 1,
  video_id: "reframe-job-1",
  source: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration_sec: 10,
  },
  output: {
    aspect_ratio: "9:16",
    width: 608,
    height: 1080,
  },
  timeline: {
    timebase: "seconds",
    sampling: "keyframes_interpolated",
  },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 656, y: 0, width: 608, height: 1080 },
    },
    {
      timestamp_sec: 2.5,
      crop: { x: 700, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("POST /api/jobs/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });
  });

  describe("Authentication", () => {
    it("returns 401 when authorization header is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "job-1" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 when authorization token is invalid", async () => {
      const req = makePostRequest({ jobId: "job-1" }, "wrong-secret");
      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("Job validation", () => {
    it("returns 400 when jobId is missing", async () => {
      const req = makePostRequest({ status: "COMPLETED" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing jobId");
    });

    it("returns 404 when job does not exist", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

      const req = makePostRequest({ jobId: "missing-job", status: "COMPLETED" });
      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Job not found");
    });

    it("returns 400 when cropTargets are sent for a non-reframe job (wrong job kind)", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job-1",
        demoId: "demo-1",
        jobData: { kind: "EXPORT" },
      } as never);

      const req = makePostRequest({
        jobId: "export-job-1",
        status: "COMPLETED",
        cropTargets: validCropTargets,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Job is not a REFRAME job");
    });
  });

  describe("Reframe callbacks", () => {
    it("successfully handles valid authenticated reframe callback", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        demoId: null,
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
        },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
        cropTargets: validCropTargets,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: undefined,
          jobData: {
            kind: "REFRAME",
            targetAspectRatio: "9:16",
            cropTargets: validCropTargets,
          },
          error: null,
        },
      });
    });

    it("persists exportedUrl and updates Demo on completed reframe callback", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        demoId: "demo-reframe-1",
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
        },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.demo.update).mockResolvedValue({} as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
        cropTargets: validCropTargets,
        exportedUrl: "https://res.cloudinary.com/demo/video/upload/reframed.mp4",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://res.cloudinary.com/demo/video/upload/reframed.mp4",
          jobData: {
            kind: "REFRAME",
            targetAspectRatio: "9:16",
            cropTargets: validCropTargets,
          },
          error: null,
        },
      });

      expect(prisma.demo.update).toHaveBeenCalledWith({
        where: { id: "demo-reframe-1" },
        data: {
          exportedUrl: "https://res.cloudinary.com/demo/video/upload/reframed.mp4",
        },
      });
    });

    it("rejects reframe completion callback missing cropTargets with 400", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        demoId: null,
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
        },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Missing cropTargets for completed reframe job");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("rejects invalid CropTargetData with 400 and validation error message", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        demoId: null,
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
        },
      } as never);

      const invalidCropTargets = {
        ...validCropTargets,
        crop_targets: [
          { timestamp_sec: 5, crop: { x: 0, y: 0, width: 608, height: 1080 } },
          { timestamp_sec: 2, crop: { x: 0, y: 0, width: 608, height: 1080 } }, // non-monotonic!
        ],
      };

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
        cropTargets: invalidCropTargets,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("crop target timestamps must be strictly increasing");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("successfully handles failed reframe callback", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        demoId: null,
        jobData: {
          kind: "REFRAME",
          targetAspectRatio: "9:16",
        },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "FAILED",
        error: "AutoFlip inference timed out",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "FAILED",
          error: "AutoFlip inference timed out",
        },
      });
    });
  });

  describe("Existing AVS/WTM/Export callbacks", () => {
    it("preserves completed export job behavior and updates Demo", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job-1",
        demoId: "demo-42",
        jobData: { kind: "EXPORT" },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.demo.update).mockResolvedValue({} as never);

      const req = makePostRequest({
        jobId: "export-job-1",
        status: "COMPLETED",
        exportedUrl: "https://cloudinary.com/video/export-42.mp4",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "export-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://cloudinary.com/video/export-42.mp4",
          error: undefined,
        },
      });

      expect(prisma.demo.update).toHaveBeenCalledWith({
        where: { id: "demo-42" },
        data: {
          exportedUrl: "https://cloudinary.com/video/export-42.mp4",
        },
      });
    });

    it("preserves failed export job behavior", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job-1",
        demoId: "demo-42",
        jobData: { kind: "EXPORT" },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "export-job-1",
        status: "FAILED",
        error: "FFmpeg rendering failed with exit code 1",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "export-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "FAILED",
          progress: undefined,
          exportedUrl: undefined,
          error: "FFmpeg rendering failed with exit code 1",
        },
      });

      expect(prisma.demo.update).not.toHaveBeenCalled();
    });
  });

  describe("Terminal-state protection (Task-00026)", () => {
    it("ignores late FAILED callback against already COMPLETED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "COMPLETED",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "FAILED",
        error: "Delayed worker timeout",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);
      expect(json.message).toContain("already in terminal state: COMPLETED");

      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("ignores late PROCESSING callback against already COMPLETED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "COMPLETED",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 50,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);

      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("ignores late COMPLETED callback against already COMPLETED job (idempotent)", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "COMPLETED",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
        cropTargets: validCropTargets,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);

      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("ignores PROCESSING callback against CANCELLED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "CANCELLED",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 25,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);
      expect(json.message).toContain("already in terminal state: CANCELLED");

      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("ignores FAILED callback against CANCELLED job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job-1",
        status: "CANCELLED",
        demoId: null,
        jobData: { kind: "EXPORT" },
      } as never);

      const req = makePostRequest({
        jobId: "export-job-1",
        status: "FAILED",
        error: "FFmpeg killed",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);

      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("PROCESSING callbacks with progress (Task-00026)", () => {
    it("successfully updates progress for valid PROCESSING callback", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME", targetAspectRatio: "9:16" },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 45,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "PROCESSING",
          progress: 45,
        },
      });
    });

    it("accepts progress = 0", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 0,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "PROCESSING", progress: 0 },
      });
    });

    it("accepts progress = 100", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 1 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 100,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(prisma.videoJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: "reframe-job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: { status: "PROCESSING", progress: 100 },
      });
    });

    it("rejects progress < 0 with 400", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: -5,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid progress: must be a number between 0 and 100");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("rejects progress > 100 with 400", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 105,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid progress: must be a number between 0 and 100");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("rejects missing progress with 400", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid progress: must be a number between 0 and 100");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });

    it("rejects non-numeric progress (string) with 400", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PENDING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: "50",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid progress: must be a number between 0 and 100");
      expect(prisma.videoJob.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("Atomic conditional updateMany concurrency safety", () => {
    it("handles concurrent race when COMPLETED updateMany matches 0 rows", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PROCESSING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);
      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 0 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "COMPLETED",
        cropTargets: validCropTargets,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);
      expect(json.message).toContain("already in a terminal state");
    });

    it("handles concurrent race when FAILED updateMany matches 0 rows", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PROCESSING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);
      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 0 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "FAILED",
        error: "Late failure",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);
    });

    it("handles concurrent race when PROCESSING updateMany matches 0 rows", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "reframe-job-1",
        status: "PROCESSING",
        demoId: null,
        jobData: { kind: "REFRAME" },
      } as never);
      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 0 });

      const req = makePostRequest({
        jobId: "reframe-job-1",
        status: "PROCESSING",
        progress: 80,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);
    });

    it("handles concurrent race when export updateMany matches 0 rows and skips demo update", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job-1",
        status: "PROCESSING",
        demoId: "demo-42",
        jobData: { kind: "EXPORT" },
      } as never);
      vi.mocked(prisma.videoJob.updateMany).mockResolvedValue({ count: 0 });

      const req = makePostRequest({
        jobId: "export-job-1",
        status: "COMPLETED",
        exportedUrl: "https://cloudinary.com/video/export-42.mp4",
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.ignored).toBe(true);

      expect(prisma.demo.update).not.toHaveBeenCalled();
    });
  });
});
