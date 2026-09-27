import { describe, expect, it, vi } from "vitest";
import {
  processDubbingJob,
  postJobCallbackWithRetry,
  type DubbingJobPayload,
  type DubbingCallbackPayload,
} from "./dubbingProcessor";
import type { GcpDubSyncPayload, GcpDubSyncResult } from "../gcpWorker";

describe("AVS Dubbing Processor (processDubbingJob)", () => {
  const basePayload: DubbingJobPayload = {
    jobId: "job-dub-123",
    videoUrl: "https://storage.googleapis.com/test-bucket/source.mp4",
    dubUrl: "https://storage.googleapis.com/test-bucket/dub.mp3",
    steps: [
      { id: "step-1", index: 0, startTime: 0, endTime: 5 },
      { id: "step-2", index: 1, startTime: 5, endTime: 10 },
    ],
    dubTimings: [
      { stepId: "step-1", start: 0, end: 4.8 },
      { stepId: "step-2", start: 4.8, end: 11.2 },
    ],
    sourceDuration: 10,
    userId: "user-abc",
    demoId: "demo-xyz",
  };

  it("A. executes successful dubbing, invokes GCP, and sends COMPLETED callback", async () => {
    const fakeGcpResult: GcpDubSyncResult = {
      alignedVideoUrl: "https://storage.googleapis.com/processed-bucket/aligned-dub.mp4",
      duration: 11.2,
    };

    const invokeDubSync = vi.fn(async () => fakeGcpResult);
    const postCallback = vi.fn(async () => {});
    const updateProgress = vi.fn();

    await processDubbingJob(basePayload, {
      invokeDubSync,
      postCallback,
      updateProgress,
    });

    expect(invokeDubSync).toHaveBeenCalledTimes(1);
    expect(invokeDubSync).toHaveBeenCalledWith({
      videoUrl: basePayload.videoUrl,
      dubUrl: basePayload.dubUrl,
      steps: basePayload.steps,
      dubTimings: basePayload.dubTimings,
    });

    expect(postCallback).toHaveBeenCalledTimes(1);
    expect(postCallback).toHaveBeenCalledWith({
      jobId: "job-dub-123",
      status: "COMPLETED",
      alignedVideoUrl: "https://storage.googleapis.com/processed-bucket/aligned-dub.mp4",
      duration: 11.2,
    });

    expect(updateProgress).toHaveBeenCalledWith(20);
    expect(updateProgress).toHaveBeenCalledWith(40);
    expect(updateProgress).toHaveBeenCalledWith(90);
    expect(updateProgress).toHaveBeenCalledWith(100);
  });

  describe("B. Fallback handling", () => {
    it("falls back to source video when dubUrl is empty without invoking GCP", async () => {
      const invokeDubSync = vi.fn();
      const postCallback = vi.fn().mockResolvedValue(undefined);

      const payload: DubbingJobPayload = {
        ...basePayload,
        dubUrl: "",
      };

      await processDubbingJob(payload, { invokeDubSync, postCallback });

      expect(invokeDubSync).not.toHaveBeenCalled();
      expect(postCallback).toHaveBeenCalledTimes(1);
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "COMPLETED",
        alignedVideoUrl: basePayload.videoUrl,
        duration: basePayload.sourceDuration,
      });
    });

    it("falls back to source video when steps are empty", async () => {
      const invokeDubSync = vi.fn();
      const postCallback = vi.fn().mockResolvedValue(undefined);

      const payload: DubbingJobPayload = {
        ...basePayload,
        steps: [],
      };

      await processDubbingJob(payload, { invokeDubSync, postCallback });

      expect(invokeDubSync).not.toHaveBeenCalled();
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "COMPLETED",
        alignedVideoUrl: basePayload.videoUrl,
        duration: basePayload.sourceDuration,
      });
    });

    it("falls back to source video when dubTimings are empty", async () => {
      const invokeDubSync = vi.fn();
      const postCallback = vi.fn().mockResolvedValue(undefined);

      const payload: DubbingJobPayload = {
        ...basePayload,
        dubTimings: [],
      };

      await processDubbingJob(payload, { invokeDubSync, postCallback });

      expect(invokeDubSync).not.toHaveBeenCalled();
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "COMPLETED",
        alignedVideoUrl: basePayload.videoUrl,
        duration: basePayload.sourceDuration,
      });
    });
  });

  describe("C. GCP failure handling", () => {
    it("sends FAILED callback and re-throws error for BullMQ retry", async () => {
      const invokeDubSync = vi
        .fn()
        .mockRejectedValue(new Error("Cloud Run /avs-dub connection reset"));
      const postCallback = vi.fn().mockResolvedValue(undefined);

      await expect(
        processDubbingJob(basePayload, { invokeDubSync, postCallback })
      ).rejects.toThrow("Cloud Run /avs-dub connection reset");

      expect(postCallback).toHaveBeenCalledTimes(1);
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "FAILED",
        error: "Cloud Run /avs-dub connection reset",
      });
    });
  });

  describe("D. Validation of payload and GCP output", () => {
    it("rejects missing or non-string jobId", async () => {
      await expect(
        processDubbingJob({} as any)
      ).rejects.toThrow("missing jobId");
    });

    it("rejects missing videoUrl and sends FAILED callback", async () => {
      const postCallback = vi.fn().mockResolvedValue(undefined);
      await expect(
        processDubbingJob(
          { jobId: "job-no-vid", videoUrl: "" } as any,
          { postCallback }
        )
      ).rejects.toThrow("Missing required videoUrl");

      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-no-vid",
        status: "FAILED",
        error: "Missing required videoUrl",
      });
    });

    it("rejects non-http/https URL from GCP worker and sends FAILED callback", async () => {
      const invokeDubSync = vi.fn().mockResolvedValue({
        alignedVideoUrl: "file:///etc/passwd",
        duration: 10,
      });
      const postCallback = vi.fn().mockResolvedValue(undefined);

      await expect(
        processDubbingJob(basePayload, { invokeDubSync, postCallback })
      ).rejects.toThrow("Dub-sync worker returned non-http/https URL");

      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "FAILED",
        error: "Dub-sync worker returned non-http/https URL",
      });
    });

    it("rejects invalid negative duration from GCP worker", async () => {
      const invokeDubSync = vi.fn().mockResolvedValue({
        alignedVideoUrl: "https://storage.googleapis.com/processed/output.mp4",
        duration: -1,
      });
      const postCallback = vi.fn().mockResolvedValue(undefined);

      await expect(
        processDubbingJob(basePayload, { invokeDubSync, postCallback })
      ).rejects.toThrow("Dub-sync worker returned invalid duration");

      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "FAILED",
        error: "Dub-sync worker returned invalid duration",
      });
    });
  });

  describe("Callback HTTP client (postJobCallbackWithRetry)", () => {
    it("succeeds on 200 response with correct headers and payload", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      globalThis.fetch = mockFetch;

      try {
        await postJobCallbackWithRetry(
          {
            jobId: "job-cb-1",
            status: "COMPLETED",
            alignedVideoUrl: "https://storage.googleapis.com/bucket/aligned.mp4",
            duration: 15,
          },
          {
            appUrl: "http://localhost:3000",
            callbackSecret: "secret-123",
          }
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/jobs/callback",
          expect.objectContaining({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer secret-123",
            },
          })
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws immediately on 4xx rejection without retrying", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Unauthorized" }),
      });
      globalThis.fetch = mockFetch;

      try {
        await expect(
          postJobCallbackWithRetry(
            { jobId: "job-401", status: "FAILED", error: "fail" },
            { appUrl: "http://localhost:3000", callbackSecret: "bad", delayMs: 1 }
          )
        ).rejects.toThrow("Callback rejected (401)");

        // Non-transient 4xx should NOT retry
        expect(mockFetch).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("retries on transient 5xx server error and succeeds on subsequent attempt", async () => {
      const originalFetch = globalThis.fetch;
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });
      globalThis.fetch = mockFetch;

      try {
        await postJobCallbackWithRetry(
          { jobId: "job-retry", status: "COMPLETED", alignedVideoUrl: "https://a.com/b.mp4", duration: 10 },
          { appUrl: "http://localhost:3000", delayMs: 1, maxAttempts: 3 }
        );

        expect(mockFetch).toHaveBeenCalledTimes(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("F. Cloudinary persistence handling", () => {
    it("1. successful upload returns a valid Cloudinary URL to the callback while preserving duration", async () => {
      const fakeGcpResult: GcpDubSyncResult = {
        alignedVideoUrl: "http://localhost:8080/artifacts/aligned-local-1.mp4",
        duration: 11.2,
      };

      const invokeDubSync = vi.fn(async () => fakeGcpResult);
      const postCallback = vi.fn(async () => {});
      const uploadToCloudinary = vi.fn(async () => ({
        secure_url: "https://res.cloudinary.com/test-cloud/video/upload/v123/dubbed_exports/out.mp4",
      }));
      const updateProgress = vi.fn();

      await processDubbingJob(basePayload, {
        invokeDubSync,
        postCallback,
        uploadToCloudinary,
        updateProgress,
      });

      expect(invokeDubSync).toHaveBeenCalledTimes(1);
      expect(uploadToCloudinary).toHaveBeenCalledTimes(1);
      expect(uploadToCloudinary).toHaveBeenCalledWith("http://localhost:8080/artifacts/aligned-local-1.mp4");

      expect(postCallback).toHaveBeenCalledTimes(1);
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "COMPLETED",
        alignedVideoUrl: "https://res.cloudinary.com/test-cloud/video/upload/v123/dubbed_exports/out.mp4",
        duration: 11.2,
      });

      expect(updateProgress).toHaveBeenCalledWith(70);
      expect(updateProgress).toHaveBeenCalledWith(90);
      expect(updateProgress).toHaveBeenCalledWith(100);
    });

    it("2. upload failure produces a controlled job failure and sends FAILED callback", async () => {
      const fakeGcpResult: GcpDubSyncResult = {
        alignedVideoUrl: "http://localhost:8080/artifacts/aligned-local-1.mp4",
        duration: 11.2,
      };

      const invokeDubSync = vi.fn(async () => fakeGcpResult);
      const postCallback = vi.fn(async () => {});
      const uploadToCloudinary = vi.fn(async () => {
        throw new Error("Cloudinary quota exceeded");
      });

      await expect(
        processDubbingJob(basePayload, {
          invokeDubSync,
          postCallback,
          uploadToCloudinary,
        })
      ).rejects.toThrow("Cloudinary quota exceeded");

      expect(postCallback).toHaveBeenCalledTimes(1);
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "FAILED",
        error: "Cloudinary quota exceeded",
      });
    });

    it("3. automatically triggers Cloudinary upload for localhost URLs when STORAGE_PROVIDER is not set", async () => {
      const fakeGcpResult: GcpDubSyncResult = {
        alignedVideoUrl: "http://localhost:8080/artifacts/aligned-auto.mp4",
        duration: 8.5,
      };

      const invokeDubSync = vi.fn(async () => fakeGcpResult);
      const postCallback = vi.fn(async () => {});
      const uploadToCloudinary = vi.fn(async () => ({
        secure_url: "https://res.cloudinary.com/demo/video/upload/auto.mp4",
      }));

      await processDubbingJob(basePayload, {
        invokeDubSync,
        postCallback,
        uploadToCloudinary,
      });

      expect(uploadToCloudinary).toHaveBeenCalledWith("http://localhost:8080/artifacts/aligned-auto.mp4");
      expect(postCallback).toHaveBeenCalledWith({
        jobId: "job-dub-123",
        status: "COMPLETED",
        alignedVideoUrl: "https://res.cloudinary.com/demo/video/upload/auto.mp4",
        duration: 8.5,
      });
    });

    it("4. preserves production GCS URLs without Cloudinary upload when not in local mode", async () => {
      const fakeGcpResult: GcpDubSyncResult = {
        alignedVideoUrl: "https://storage.googleapis.com/processed-bucket/aligned-prod.mp4",
        duration: 15.0,
      };

      const invokeDubSync = vi.fn(async () => fakeGcpResult);
      const postCallback = vi.fn(async () => {});
      const prevStorageProvider = process.env.STORAGE_PROVIDER;
      delete process.env.STORAGE_PROVIDER;

      try {
        await processDubbingJob(basePayload, {
          invokeDubSync,
          postCallback,
        });

        expect(postCallback).toHaveBeenCalledWith({
          jobId: "job-dub-123",
          status: "COMPLETED",
          alignedVideoUrl: "https://storage.googleapis.com/processed-bucket/aligned-prod.mp4",
          duration: 15.0,
        });
      } finally {
        if (prevStorageProvider !== undefined) {
          process.env.STORAGE_PROVIDER = prevStorageProvider;
        }
      }
    });
  });
});
