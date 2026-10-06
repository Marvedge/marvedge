import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/awsJobProgress", () => ({
  getAwsJobProgress: vi.fn().mockResolvedValue(null),
}));

function createPollingRequest(jobId: string): {
  req: NextRequest;
  context: { params: Promise<{ id: string }> };
} {
  const req = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
    method: "GET",
  });

  return {
    req,
    context: { params: Promise.resolve({ id: jobId }) },
  };
}

describe("GET /api/jobs/[id]", () => {
  const mockUserId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        id: mockUserId,
        email: "user@example.com",
      },
    } as never);
  });

  describe("Authentication and ownership", () => {
    it("returns 401 if unauthenticated", async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);

      const { req, context } = createPollingRequest("job-1");
      const res = await GET(req, context);

      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 404 if job not found", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue(null);

      const { req, context } = createPollingRequest("job-404");
      const res = await GET(req, context);

      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Job not found");
    });

    it("returns 403 if job belongs to another user", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "job-other",
        userId: "different-user",
        status: "COMPLETED",
        progress: 100,
        exportedUrl: null,
        error: null,
        jobData: null,
      } as never);

      const { req, context } = createPollingRequest("job-other");
      const res = await GET(req, context);

      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data.error).toBe("Forbidden");
    });
  });

  describe("AVS_DUB polling", () => {
    it("returns alignedVideoUrl and duration for completed AVS_DUB job", async () => {
      const jobData = {
        kind: "AVS_DUB",
        alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned-dub.mp4",
        duration: 35.5,
        fallback: false,
      };

      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "dub-complete",
        userId: mockUserId,
        status: "COMPLETED",
        progress: 100,
        exportedUrl: null,
        error: null,
        jobData,
      } as never);

      const { req, context } = createPollingRequest("dub-complete");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data).toEqual({
        success: true,
        id: "dub-complete",
        status: "completed",
        state: "completed",
        progress: 100,
        exportedUrl: null,
        error: null,
        jobData,
        fallback: false,
        subtitles: null,
        aligned: {
          alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned-dub.mp4",
          duration: 35.5,
        },
      });
    });

    it("preserves pending behavior for PENDING AVS_DUB job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "dub-pending",
        userId: mockUserId,
        status: "PENDING",
        progress: 0,
        exportedUrl: null,
        error: null,
        jobData: {
          kind: "AVS_DUB",
        },
      } as never);

      const { req, context } = createPollingRequest("dub-pending");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.state).toBe("waiting");
      expect(data.progress).toBe(0);
      expect(data.aligned).toEqual({
        alignedVideoUrl: null,
        duration: null,
      });
    });

    it("preserves active behavior for PROCESSING AVS_DUB job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "dub-processing",
        userId: mockUserId,
        status: "PROCESSING",
        progress: 30,
        exportedUrl: null,
        error: null,
        jobData: {
          kind: "AVS_DUB",
        },
      } as never);

      const { req, context } = createPollingRequest("dub-processing");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.state).toBe("active");
      expect(data.progress).toBe(30);
    });

    it("preserves failure behavior for FAILED AVS_DUB job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "dub-failed",
        userId: mockUserId,
        status: "FAILED",
        progress: 20,
        exportedUrl: null,
        error: "Dub-sync alignment failed",
        jobData: {
          kind: "AVS_DUB",
        },
      } as never);

      const { req, context } = createPollingRequest("dub-failed");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.state).toBe("failed");
      expect(data.error).toBe("Dub-sync alignment failed");
    });

    it("preserves cancelled behavior for CANCELLED AVS_DUB job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "dub-cancelled",
        userId: mockUserId,
        status: "CANCELLED",
        progress: 10,
        exportedUrl: null,
        error: "Cancelled by the user",
        jobData: {
          kind: "AVS_DUB",
        },
      } as never);

      const { req, context } = createPollingRequest("dub-cancelled");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.state).toBe("cancelled");
    });
  });

  describe("Regression: other job kinds", () => {
    it("returns aligned result for AVS_SYNC job identically", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "sync-job",
        userId: mockUserId,
        status: "COMPLETED",
        progress: 100,
        exportedUrl: null,
        error: null,
        jobData: {
          kind: "AVS_SYNC",
          alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned-sync.mp4",
          duration: 18.2,
        },
      } as never);

      const { req, context } = createPollingRequest("sync-job");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.aligned).toEqual({
        alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned-sync.mp4",
        duration: 18.2,
      });
      expect(data.subtitles).toBeNull();
    });

    it("returns subtitles for SUBTITLES job", async () => {
      const mockCues = [
        {
          id: "1",
          start: 0,
          end: 2,
          text: "Hello",
        },
      ];

      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "sub-job",
        userId: mockUserId,
        status: "COMPLETED",
        progress: 100,
        exportedUrl: null,
        error: null,
        jobData: {
          kind: "SUBTITLES",
          subtitles: mockCues,
        },
      } as never);

      const { req, context } = createPollingRequest("sub-job");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.subtitles).toEqual(mockCues);
      expect(data.aligned).toBeUndefined();
    });

    it("returns exportedUrl without subtitles or aligned for standard export job", async () => {
      vi.mocked(prisma.videoJob.findUnique).mockResolvedValue({
        id: "export-job",
        userId: mockUserId,
        status: "COMPLETED",
        progress: 100,
        exportedUrl: "https://storage.googleapis.com/bucket/output.mp4",
        error: null,
        jobData: {
          segments: [],
        },
      } as never);

      const { req, context } = createPollingRequest("export-job");
      const res = await GET(req, context);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data.exportedUrl).toBe("https://storage.googleapis.com/bucket/output.mp4");
      expect(data.subtitles).toBeNull();
      expect(data.aligned).toBeUndefined();
    });
  });
});
