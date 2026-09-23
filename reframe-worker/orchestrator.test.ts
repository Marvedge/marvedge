import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import fs from "fs";
import path from "path";
import type { CropTargetData } from "../app/types/editor/crop-target";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import {
  processReframeJob,
  isFinalBullMqAttempt,
  ReframePayloadValidationError,
  type ReframeJobContext,
} from "./orchestrator";
import { UnrecoverableError } from "bullmq";
import {
  callMlInference,
  postJobCallback,
  postJobCallbackWithRetry,
  CallbackHttpError,
  CropTargetValidationError,
  type JobCallbackPayload,
  type MlInferenceRequest,
} from "./client";
import { getReframeWorkerConfig } from "./config";

const sampleCropTargets: CropTargetData = {
  schema_version: 1,
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
  output: { aspect_ratio: "9:16" },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 420, y: 0, width: 608, height: 1080 },
    },
  ],
};

const sampleJobPayload: ReframeJobPayload = {
  jobId: "job-ref-123",
  videoUrl: "https://storage.example.com/video.mp4",
  targetAspectRatio: "9:16",
  source: { width: 1920, height: 1080, fps: 30, durationSec: 5 },
};

describe("Reframe Worker Orchestrator (Task-00023 Phase 2)", () => {
  let mockExecuteMl: any;
  let mockRenderVideo: any;
  let mockSendCallback: any;
  let localCache: Map<string, CropTargetData>;

  beforeEach(() => {
    mockExecuteMl = vi.fn<(request: MlInferenceRequest) => Promise<CropTargetData>>().mockResolvedValue(sampleCropTargets);
    mockRenderVideo = vi.fn<(videoUrl: string, cropTargets: CropTargetData) => Promise<string>>().mockResolvedValue("https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4");
    mockSendCallback = vi.fn<(payload: JobCallbackPayload) => Promise<{ success: boolean }>>().mockResolvedValue({ success: true });
    localCache = new Map<string, CropTargetData>();
  });

  describe("Attempt calculation", () => {
    it("correctly identifies non-final and final BullMQ attempts", () => {
      // 3 attempts total: 0, 1 are intermediate; 2 is final
      expect(isFinalBullMqAttempt({ jobId: "1", attemptsMade: 0, maxAttempts: 3 })).toBe(false);
      expect(isFinalBullMqAttempt({ jobId: "1", attemptsMade: 1, maxAttempts: 3 })).toBe(false);
      expect(isFinalBullMqAttempt({ jobId: "1", attemptsMade: 2, maxAttempts: 3 })).toBe(true);

      // Default 1 attempt: 0 is final
      expect(isFinalBullMqAttempt({ jobId: "1", attemptsMade: 0, maxAttempts: 1 })).toBe(true);
    });
  });

  describe("Happy Path", () => {
    it("coordinates ML inference and sends COMPLETED callback", async () => {
      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      const result = await processReframeJob(sampleJobPayload, context, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      expect(result.cropTargets).toEqual(sampleCropTargets);
      expect(result.exportedUrl).toBe("https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4");

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockExecuteMl).toHaveBeenCalledWith({
        videoUrl: sampleJobPayload.videoUrl,
        targetAspectRatio: sampleJobPayload.targetAspectRatio,
        source: sampleJobPayload.source,
      });

      expect(mockRenderVideo).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).toHaveBeenCalledWith(
        sampleJobPayload.videoUrl,
        sampleCropTargets
      );

      expect(mockSendCallback).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-ref-123",
        status: "COMPLETED",
        cropTargets: sampleCropTargets,
        exportedUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      });

      // Cache cleaned up after successful completion
      expect(localCache.has("job-ref-123")).toBe(false);
    });
  });

  describe("ML Failure Retry Semantics", () => {
    it("throws error and does NOT send FAILED callback on intermediate BullMQ attempts", async () => {
      mockExecuteMl.mockRejectedValue(new Error("AutoFlip container timeout"));

      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("AutoFlip container timeout");

      // No callback sent yet — BullMQ will retry
      expect(mockSendCallback).not.toHaveBeenCalled();
      expect(localCache.has("job-ref-123")).toBe(false);
    });

    it("sends FAILED callback on final BullMQ attempt before throwing", async () => {
      mockExecuteMl.mockRejectedValue(new Error("AutoFlip unrecoverable failure"));

      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 2, // Final of 3 attempts
        maxAttempts: 3,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("AutoFlip unrecoverable failure");

      expect(mockSendCallback).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-ref-123",
        status: "FAILED",
        error: "ML inference failed: AutoFlip unrecoverable failure",
      });
    });
  });

  describe("Callback Failure and Result Caching", () => {
    it("caches ML result and does NOT rerun ML when callback delivery fails transiently", async () => {
      mockSendCallback.mockRejectedValueOnce(
        new Error("Network error connecting to backend")
      );

      const contextAttempt0: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      // Attempt 0: ML succeeds, callback fails
      await expect(
        processReframeJob(sampleJobPayload, contextAttempt0, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("Network error connecting to backend");

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      // Result is preserved in cache
      expect(localCache.has("job-ref-123")).toBe(true);

      // Attempt 1: BullMQ retries the job
      mockSendCallback.mockResolvedValueOnce({ success: true });
      const contextAttempt1: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 1,
        maxAttempts: 3,
      };

      const result = await processReframeJob(sampleJobPayload, contextAttempt1, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      // ML was NOT re-run!
      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      // Callback was delivered
      expect(mockSendCallback).toHaveBeenCalledTimes(2);
      expect(mockSendCallback).toHaveBeenLastCalledWith({
        jobId: "job-ref-123",
        status: "COMPLETED",
        cropTargets: sampleCropTargets,
        exportedUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      });
      // Cache cleared after successful callback
      expect(localCache.has("job-ref-123")).toBe(false);
    });

    it("demonstrates that callback retry skips ML inference via cache but re-renders video (Task-00056 Phase 4 audit)", async () => {
      mockSendCallback.mockRejectedValueOnce(
        new Error("Transient ECONNRESET delivering callback")
      );

      const contextAttempt0: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      // Attempt 0: ML runs, render runs, callback fails
      await expect(
        processReframeJob(sampleJobPayload, contextAttempt0, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("Transient ECONNRESET delivering callback");

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).toHaveBeenCalledTimes(1);
      expect(localCache.has("job-ref-123")).toBe(true);

      // Attempt 1: BullMQ retry
      mockSendCallback.mockResolvedValueOnce({ success: true });
      const contextAttempt1: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 1,
        maxAttempts: 3,
      };

      const result = await processReframeJob(sampleJobPayload, contextAttempt1, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      // Invariant: ML inference was NOT re-run (cached CropTargetData reused)
      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      // Documented behavior: renderVideo IS called again (re-renders reframed MP4 on retry)
      expect(mockRenderVideo).toHaveBeenCalledTimes(2);
      // Invariant: callback succeeded and cache is cleaned up
      expect(localCache.has("job-ref-123")).toBe(false);
    });

    it("handles backend 400 validation rejection by clearing cache and sending FAILED callback", async () => {
      mockSendCallback.mockRejectedValueOnce(
        new CallbackHttpError(400, "Invalid cropTargets: missing cropWindow")
      );

      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("Callback request failed with status 400");

      // Cache is cleared because the crop targets are definitively invalid
      expect(localCache.has("job-ref-123")).toBe(false);

      // FAILED callback is sent to mark the VideoJob FAILED in Postgres
      expect(mockSendCallback).toHaveBeenCalledTimes(2);
      expect(mockSendCallback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          jobId: "job-ref-123",
          status: "FAILED",
        })
      );
    });
  });

  describe("Rendering Failure Retry Semantics", () => {
    it("throws error and does NOT send FAILED callback on intermediate BullMQ attempts when rendering fails", async () => {
      mockRenderVideo.mockRejectedValue(new Error("FFmpeg exited with code 1"));

      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("FFmpeg exited with code 1");

      // No callback sent yet — BullMQ will retry
      expect(mockSendCallback).not.toHaveBeenCalled();
      // ML result was cached so retry does not rerun ML
      expect(localCache.has("job-ref-123")).toBe(true);
    });

    it("sends FAILED callback on final BullMQ attempt when rendering fails", async () => {
      mockRenderVideo.mockRejectedValue(new Error("Cloudinary upload failed"));

      const context: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 2, // Final of 3 attempts
        maxAttempts: 3,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("Cloudinary upload failed");

      expect(mockSendCallback).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-ref-123",
        status: "FAILED",
        error: "Video rendering failed: Cloudinary upload failed",
      });
    });
  });

  describe("Pure HTTP Client Boundary", () => {
    it("callMlInference extracts crop_targets from canonical envelope", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          crop_targets: sampleCropTargets,
        }),
      } as Response);

      try {
        const result = await callMlInference("http://localhost:8000", {
          videoUrl: "https://example.com/v.mp4",
          targetAspectRatio: "9:16",
        });
        expect(result).toEqual(sampleCropTargets);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("callMlInference throws on { ok: false, error: ... } response", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: false,
          error: "Subprocess execution failed",
        }),
      } as Response);

      try {
        await expect(
          callMlInference("http://localhost:8000", {
            videoUrl: "https://example.com/v.mp4",
            targetAspectRatio: "9:16",
          })
        ).rejects.toThrow("Subprocess execution failed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("callMlInference supports direct CropTargetData response", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => sampleCropTargets,
      } as Response);

      try {
        const result = await callMlInference("http://localhost:8000", {
          videoUrl: "https://example.com/v.mp4",
          targetAspectRatio: "9:16",
        });
        expect(result).toEqual(sampleCropTargets);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("callMlInference rejects invalid response envelope", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ randomField: 123 }),
      } as Response);

      try {
        await expect(
          callMlInference("http://localhost:8000", {
            videoUrl: "https://example.com/v.mp4",
            targetAspectRatio: "9:16",
          })
        ).rejects.toThrow("missing 'crop_targets'");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("postJobCallback includes Authorization Bearer header", async () => {
      const originalFetch = globalThis.fetch;
      let capturedHeaders: Record<string, string> | undefined;

      globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init?.headers;
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        } as Response);
      });

      try {
        await postJobCallback("http://localhost:3000", "test-secret-123", {
          jobId: "job-1",
          status: "COMPLETED",
          cropTargets: sampleCropTargets,
        });

        expect(capturedHeaders?.authorization).toBe("Bearer test-secret-123");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("postJobCallbackWithRetry does NOT retry 4xx errors", async () => {
      const originalFetch = globalThis.fetch;
      let fetchCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        fetchCount++;
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: "Validation failed" }),
        } as Response);
      });

      try {
        await expect(
          postJobCallbackWithRetry(
            "http://localhost:3000",
            "secret",
            {
              jobId: "job-1",
              status: "COMPLETED",
              cropTargets: sampleCropTargets,
            },
            { retries: 3, delayMs: 10 }
          )
        ).rejects.toThrow(CallbackHttpError);

        // Failed immediately on 400 without consuming retries
        expect(fetchCount).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("loads environment variables following Next.js precedence (Issue B regression)", () => {
      const config = getReframeWorkerConfig();
      expect(config.backendUrl).toBeDefined();
      expect(config.redisUrl).toBeDefined();
      expect(config.mlServiceUrl).toBeDefined();
      if (fs.existsSync(path.resolve(process.cwd(), ".env.local"))) {
        expect(config.callbackSecret.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Worker Boundary Validation (Task-00056 Phase 2)", () => {
    const defaultContext: ReframeJobContext = {
      jobId: "job-ref-123",
      attemptsMade: 0,
      maxAttempts: 3,
    };

    // A. valid payload reaches orchestrator/processing path
    it("Test A: valid payload reaches orchestrator and completes processing path", async () => {
      const result = await processReframeJob(sampleJobPayload, defaultContext, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED" })
      );
    });

    // B. null payload rejected
    it("Test B: null payload rejected as unrecoverable error", async () => {
      await expect(
        processReframeJob(null as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow(ReframePayloadValidationError);
    });

    // C. array payload rejected
    it("Test C: array payload rejected", async () => {
      await expect(
        processReframeJob([] as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow(ReframePayloadValidationError);
    });

    // D. missing jobId rejected
    it("Test D: missing jobId rejected", async () => {
      const invalid = { ...sampleJobPayload, jobId: undefined };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("jobId is required");
    });

    // E. empty jobId rejected
    it("Test E: empty jobId rejected", async () => {
      const invalid = { ...sampleJobPayload, jobId: "   " };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("jobId is required");
    });

    // F. missing videoUrl rejected
    it("Test F: missing videoUrl rejected", async () => {
      const invalid = { ...sampleJobPayload, videoUrl: undefined };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("videoUrl is required");
    });

    // G. empty videoUrl rejected
    it("Test G: empty videoUrl rejected", async () => {
      const invalid = { ...sampleJobPayload, videoUrl: "   " };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("videoUrl is required");
    });

    // H. unsafe videoUrl rejected
    it("Test H: unsafe videoUrl rejected (e.g. localhost, private IP, non-http schemes)", async () => {
      const testCases = [
        "http://localhost:8000/reframe",
        "http://127.0.0.1:8000/video.mp4",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.1/video.mp4",
        "ftp://example.com/video.mp4",
        "file:///etc/passwd",
      ];

      for (const unsafeUrl of testCases) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, videoUrl: unsafeUrl },
            defaultContext,
            {
              executeMl: mockExecuteMl,
              renderVideo: mockRenderVideo,
              sendCallback: mockSendCallback,
            }
          )
        ).rejects.toThrow("videoUrl is unsafe or invalid");
      }
    });

    // I. missing targetAspectRatio rejected
    it("Test I: missing targetAspectRatio rejected", async () => {
      const invalid = { ...sampleJobPayload, targetAspectRatio: undefined };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("targetAspectRatio is required");
    });

    // J. empty targetAspectRatio rejected
    it("Test J: empty targetAspectRatio rejected", async () => {
      const invalid = { ...sampleJobPayload, targetAspectRatio: "   " };
      await expect(
        processReframeJob(invalid as any, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("targetAspectRatio is required");
    });

    // K. invalid source width rejected
    it("Test K: invalid source width rejected", async () => {
      for (const width of [0, -10, -1]) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, source: { ...sampleJobPayload.source!, width } },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow("source.width must be a positive number");
      }
    });

    // L. invalid source height rejected
    it("Test L: invalid source height rejected", async () => {
      for (const height of [0, -10, -1]) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, source: { ...sampleJobPayload.source!, height } },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow("source.height must be a positive number");
      }
    });

    // M. invalid source fps rejected
    it("Test M: invalid source fps rejected", async () => {
      for (const fps of [0, -5, -30]) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, source: { ...sampleJobPayload.source!, fps } },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow("source.fps must be a positive number if provided");
      }
    });

    // N. invalid source duration rejected
    it("Test N: invalid source duration rejected", async () => {
      await expect(
        processReframeJob(
          { ...sampleJobPayload, source: { ...sampleJobPayload.source!, durationSec: -1 } },
          defaultContext,
          { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
        )
      ).rejects.toThrow("source.durationSec must be a non-negative number if provided");
    });

    // O. malformed userId rejected
    it("Test O: malformed userId rejected", async () => {
      for (const userId of ["   ", 123 as any, {} as any]) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, userId },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow("userId must be a non-empty string if provided");
      }
    });

    // P. malformed demoId rejected
    it("Test P: malformed demoId rejected (allows null/string, rejects others)", async () => {
      for (const demoId of [123 as any, {} as any, true as any]) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, demoId },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow("demoId must be a string if provided");
      }

      // null is allowed
      const validWithNull = { ...sampleJobPayload, demoId: null };
      const res = await processReframeJob(validWithNull, defaultContext, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });
      expect(res.success).toBe(true);
    });

    // Q. NaN / Infinity rejected
    it("Test Q: NaN / Infinity rejected", async () => {
      const nanTestCases = [
        { width: NaN, height: 1080 },
        { width: Infinity, height: 1080 },
        { width: -Infinity, height: 1080 },
        { width: 1920, height: NaN },
        { width: 1920, height: Infinity },
        { width: 1920, height: 1080, fps: NaN },
        { width: 1920, height: 1080, fps: Infinity },
        { width: 1920, height: 1080, durationSec: NaN },
        { width: 1920, height: 1080, durationSec: Infinity },
      ];

      for (const src of nanTestCases) {
        await expect(
          processReframeJob(
            { ...sampleJobPayload, source: src },
            defaultContext,
            { executeMl: mockExecuteMl, renderVideo: mockRenderVideo, sendCallback: mockSendCallback }
          )
        ).rejects.toThrow(ReframePayloadValidationError);
      }
    });

    // R, S, T: Malformed job never reaches ML inference, rendering, or COMPLETED callback
    it("Tests R, S, T: Malformed job never calls ML inference, render, or COMPLETED callback", async () => {
      const malformedPayload = {
        jobId: "bad-job",
        videoUrl: "http://169.254.169.254/secret",
        targetAspectRatio: "9:16",
      };

      let error: any;
      try {
        await processReframeJob(malformedPayload, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        });
      } catch (err) {
        error = err;
      }

      // Must throw ReframePayloadValidationError which extends UnrecoverableError
      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ReframePayloadValidationError);
      expect(error).toBeInstanceOf(UnrecoverableError);

      // R. malformed job never reaches ML inference
      expect(mockExecuteMl).not.toHaveBeenCalled();

      // S. malformed job does not render/upload
      expect(mockRenderVideo).not.toHaveBeenCalled();

      // T. malformed job does not send COMPLETED callback
      expect(mockSendCallback).not.toHaveBeenCalled();
    });
  });

  describe("CropTarget Boundary Hardening (Task-00056 Phase 3)", () => {
    const defaultContext: ReframeJobContext = {
      jobId: "job-ref-123",
      attemptsMade: 0,
      maxAttempts: 3,
    };

    // A. Valid CropTargetData: accepted and orchestrator continues normally
    it("Test A: Valid CropTargetData accepted and orchestrator continues normally", async () => {
      const validTargets: CropTargetData = {
        schema_version: 1,
        source: { width: 1920, height: 1080, fps: 30, duration_sec: 10 },
        output: { aspect_ratio: "9:16", width: 1080, height: 1920 },
        crop_targets: [
          {
            timestamp_sec: 0,
            crop: { x: 420, y: 0, width: 608, height: 1080 },
            confidence: 0.95,
            source: "autoflip",
          },
          {
            timestamp_sec: 2.5,
            crop: { x: 500, y: 0, width: 608, height: 1080 },
            confidence: 0.88,
            source: "autoflip",
          },
        ],
      };
      mockExecuteMl.mockResolvedValue(validTargets);

      const result = await processReframeJob(sampleJobPayload, defaultContext, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).toHaveBeenCalledWith(sampleJobPayload.videoUrl, validTargets);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: sampleJobPayload.jobId,
        status: "COMPLETED",
        cropTargets: validTargets,
        exportedUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      });
      expect(result.success).toBe(true);
      expect(result.cropTargets).toEqual(validTargets);
    });

    // B. Missing schema_version: rejected, renderVideo NOT called, callback(COMPLETED) NOT called
    it("Test B: Missing schema_version rejected -> renderVideo and callback(COMPLETED) NOT called", async () => {
      const missingSchema = {
        source: { width: 1920, height: 1080 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [
          { timestamp_sec: 0, crop: { x: 0, y: 0, width: 608, height: 1080 } },
        ],
      };
      mockExecuteMl.mockResolvedValue(missingSchema as any);

      await expect(
        processReframeJob(sampleJobPayload, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow(CropTargetValidationError);

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).not.toHaveBeenCalled();
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    // C. Invalid schema_version: rejected, renderVideo NOT called
    it("Test C: Invalid schema_version rejected -> renderVideo NOT called", async () => {
      for (const badVersion of [0, 2, "1", null, undefined]) {
        const invalidVersion = {
          ...sampleCropTargets,
          schema_version: badVersion,
        };
        mockExecuteMl.mockResolvedValue(invalidVersion as any);

        await expect(
          processReframeJob(sampleJobPayload, defaultContext, {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
          })
        ).rejects.toThrow(CropTargetValidationError);

        expect(mockRenderVideo).not.toHaveBeenCalled();
        expect(mockSendCallback).not.toHaveBeenCalled();
      }
    });

    // D. Empty crop_targets: follow existing validator semantics (valid per schema)
    it("Test D: Empty crop_targets array is valid per existing schema semantics and accepted", async () => {
      const emptyTargets: CropTargetData = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [],
      };
      mockExecuteMl.mockResolvedValue(emptyTargets);

      const result = await processReframeJob(sampleJobPayload, defaultContext, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      expect(mockRenderVideo).toHaveBeenCalledWith(sampleJobPayload.videoUrl, emptyTargets);
      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED", cropTargets: emptyTargets })
      );
    });

    // E. Non-monotonic timestamps: rejected, renderVideo NOT called
    it("Test E: Non-monotonic timestamps rejected -> renderVideo NOT called", async () => {
      const nonMonotonic: CropTargetData = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [
          { timestamp_sec: 2.0, crop: { x: 0, y: 0, width: 608, height: 1080 } },
          { timestamp_sec: 1.0, crop: { x: 10, y: 0, width: 608, height: 1080 } },
        ],
      };
      mockExecuteMl.mockResolvedValue(nonMonotonic);

      await expect(
        processReframeJob(sampleJobPayload, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("crop target timestamps must be strictly increasing");

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockRenderVideo).not.toHaveBeenCalled();
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    // F. Negative timestamp: rejected
    it("Test F: Negative timestamp rejected -> renderVideo NOT called", async () => {
      const negativeTs: CropTargetData = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [
          { timestamp_sec: -0.5, crop: { x: 0, y: 0, width: 608, height: 1080 } },
        ],
      };
      mockExecuteMl.mockResolvedValue(negativeTs);

      await expect(
        processReframeJob(sampleJobPayload, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("must be non-negative");

      expect(mockRenderVideo).not.toHaveBeenCalled();
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    // G. Timestamp beyond duration: rejected
    it("Test G: Timestamp beyond duration rejected -> renderVideo NOT called", async () => {
      const beyondDuration: CropTargetData = {
        schema_version: 1,
        source: { width: 1920, height: 1080, duration_sec: 10 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [
          // Exceeds 10 + 0.5 drift allowance
          { timestamp_sec: 10.6, crop: { x: 0, y: 0, width: 608, height: 1080 } },
        ],
      };
      mockExecuteMl.mockResolvedValue(beyondDuration);

      await expect(
        processReframeJob(sampleJobPayload, defaultContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow("exceeds duration");

      expect(mockRenderVideo).not.toHaveBeenCalled();
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    // H. Invalid crop bounds: rejected, FFmpeg/render never reached
    it("Test H: Invalid crop bounds rejected -> FFmpeg/render never reached", async () => {
      const badBoundsCases = [
        // width exceeds source width
        { x: 0, y: 0, width: 1921, height: 1080, err: "exceeds source width" },
        // height exceeds source height
        { x: 0, y: 0, width: 608, height: 1081, err: "exceeds source height" },
        // x + width exceeds source width
        { x: 1500, y: 0, width: 608, height: 1080, err: "exceeds source width" },
        // y + height exceeds source height
        { x: 0, y: 500, width: 608, height: 1080, err: "exceeds source height" },
        // negative x
        { x: -1, y: 0, width: 608, height: 1080, err: "crop.x must be non-negative" },
        // negative y
        { x: 0, y: -1, width: 608, height: 1080, err: "crop.y must be non-negative" },
        // zero width
        { x: 0, y: 0, width: 0, height: 1080, err: "crop.width must be positive" },
        // zero height
        { x: 0, y: 0, width: 608, height: 0, err: "crop.height must be positive" },
      ];

      for (const item of badBoundsCases) {
        const badBounds: CropTargetData = {
          schema_version: 1,
          source: { width: 1920, height: 1080 },
          output: { aspect_ratio: "9:16" },
          crop_targets: [
            {
              timestamp_sec: 0,
              crop: { x: item.x, y: item.y, width: item.width, height: item.height },
            },
          ],
        };
        mockExecuteMl.mockResolvedValue(badBounds);

        await expect(
          processReframeJob(sampleJobPayload, defaultContext, {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
          })
        ).rejects.toThrow(item.err);

        expect(mockRenderVideo).not.toHaveBeenCalled();
        expect(mockSendCallback).not.toHaveBeenCalled();
      }
    });

    // I. Invalid confidence: rejected
    it("Test I: Invalid confidence rejected -> renderVideo NOT called", async () => {
      for (const confidence of [-0.01, 1.01, 2, NaN]) {
        const badConfidence: CropTargetData = {
          schema_version: 1,
          source: { width: 1920, height: 1080 },
          output: { aspect_ratio: "9:16" },
          crop_targets: [
            {
              timestamp_sec: 0,
              crop: { x: 0, y: 0, width: 608, height: 1080 },
              confidence,
            },
          ],
        };
        mockExecuteMl.mockResolvedValue(badConfidence);

        await expect(
          processReframeJob(sampleJobPayload, defaultContext, {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
          })
        ).rejects.toThrow("confidence must be between 0 and 1");

        expect(mockRenderVideo).not.toHaveBeenCalled();
        expect(mockSendCallback).not.toHaveBeenCalled();
      }
    });

    // J. Invalid source dimensions: rejected
    it("Test J: Invalid source dimensions rejected -> renderVideo NOT called", async () => {
      const badSourceCases = [
        { width: 0, height: 1080, err: "source.width must be positive" },
        { width: -1920, height: 1080, err: "source.width must be positive" },
        { width: 1920, height: 0, err: "source.height must be positive" },
        { width: 1920, height: -1080, err: "source.height must be positive" },
      ];

      for (const item of badSourceCases) {
        const badSource = {
          schema_version: 1,
          source: { width: item.width, height: item.height },
          output: { aspect_ratio: "9:16" },
          crop_targets: [
            { timestamp_sec: 0, crop: { x: 0, y: 0, width: 100, height: 100 } },
          ],
        };
        mockExecuteMl.mockResolvedValue(badSource as any);

        await expect(
          processReframeJob(sampleJobPayload, defaultContext, {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
          })
        ).rejects.toThrow(item.err);

        expect(mockRenderVideo).not.toHaveBeenCalled();
        expect(mockSendCallback).not.toHaveBeenCalled();
      }
    });

    // K. NaN / Infinity where relevant: rejected
    it("Test K: NaN / Infinity in CropTargetData rejected -> renderVideo NOT called", async () => {
      const nanCases = [
        {
          data: {
            ...sampleCropTargets,
            source: { width: NaN, height: 1080 },
          },
          err: "source.width must be positive",
        },
        {
          data: {
            ...sampleCropTargets,
            source: { width: Infinity, height: 1080 },
          },
          err: "source.width must be positive",
        },
        {
          data: {
            schema_version: 1,
            source: { width: 1920, height: 1080 },
            output: { aspect_ratio: "9:16" },
            crop_targets: [
              { timestamp_sec: NaN, crop: { x: 0, y: 0, width: 608, height: 1080 } },
            ],
          },
          err: "timestamp_sec must be non-negative",
        },
        {
          data: {
            schema_version: 1,
            source: { width: 1920, height: 1080 },
            output: { aspect_ratio: "9:16" },
            crop_targets: [
              { timestamp_sec: Infinity, crop: { x: 0, y: 0, width: 608, height: 1080 } },
            ],
          },
          err: "timestamp_sec must be non-negative",
        },
        {
          data: {
            schema_version: 1,
            source: { width: 1920, height: 1080 },
            output: { aspect_ratio: "9:16" },
            crop_targets: [
              { timestamp_sec: 0, crop: { x: NaN, y: 0, width: 608, height: 1080 } },
            ],
          },
          err: "crop.x must be non-negative",
        },
        {
          data: {
            schema_version: 1,
            source: { width: 1920, height: 1080 },
            output: { aspect_ratio: "9:16" },
            crop_targets: [
              { timestamp_sec: 0, crop: { x: 0, y: 0, width: Infinity, height: 1080 } },
            ],
          },
          err: "crop.width must be positive",
        },
      ];

      for (const item of nanCases) {
        mockExecuteMl.mockResolvedValue(item.data as any);

        await expect(
          processReframeJob(sampleJobPayload, defaultContext, {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
          })
        ).rejects.toThrow(item.err);

        expect(mockRenderVideo).not.toHaveBeenCalled();
        expect(mockSendCallback).not.toHaveBeenCalled();
      }
    });

    // L. Malformed ML response shape: rejected
    it("Test L: Malformed ML response shapes rejected at client / orchestrator boundary", async () => {
      const originalFetch = globalThis.fetch;
      try {
        const malformedResponses = [
          { body: null, desc: "null response" },
          { body: "not an object", desc: "string response" },
          { body: {}, desc: "empty object missing crop_targets" },
          { body: { randomField: "foo" }, desc: "unrelated object" },
          { body: { ok: true }, desc: "envelope missing crop_targets" },
          { body: { crop_targets: "invalid-string" }, desc: "crop_targets not object or array" },
        ];

        for (const item of malformedResponses) {
          globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => item.body,
          } as Response);

          await expect(
            callMlInference("http://localhost:8000", {
              videoUrl: "https://example.com/v.mp4",
              targetAspectRatio: "9:16",
            })
          ).rejects.toThrow();
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // M. Existing supported ML response shapes: still accepted
    it("Test M: Existing supported ML response shapes (canonical, alternate, direct root) are all accepted", async () => {
      const originalFetch = globalThis.fetch;
      try {
        // Shape 1: Canonical { ok: true, crop_targets: CropTargetData }
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: true, crop_targets: sampleCropTargets }),
        } as Response);

        const r1 = await callMlInference("http://localhost:8000", {
          videoUrl: "https://example.com/v.mp4",
          targetAspectRatio: "9:16",
        });
        expect(r1).toEqual(sampleCropTargets);

        // Shape 2: Alternate { cropTargets: CropTargetData }
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ cropTargets: sampleCropTargets }),
        } as Response);

        const r2 = await callMlInference("http://localhost:8000", {
          videoUrl: "https://example.com/v.mp4",
          targetAspectRatio: "9:16",
        });
        expect(r2).toEqual(sampleCropTargets);

        // Shape 3: Direct root CropTargetData
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => sampleCropTargets,
        } as Response);

        const r3 = await callMlInference("http://localhost:8000", {
          videoUrl: "https://example.com/v.mp4",
          targetAspectRatio: "9:16",
        });
        expect(r3).toEqual(sampleCropTargets);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // N. Existing successful rendering path: remains unchanged
    it("Test N: Existing successful rendering path remains unchanged and passes valid CropTargetData to FFmpeg", async () => {
      const result = await processReframeJob(sampleJobPayload, defaultContext, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      expect(result.cropTargets).toEqual(sampleCropTargets);
      expect(result.exportedUrl).toBe("https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4");
      expect(mockRenderVideo).toHaveBeenCalledWith(sampleJobPayload.videoUrl, sampleCropTargets);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: sampleJobPayload.jobId,
        status: "COMPLETED",
        cropTargets: sampleCropTargets,
        exportedUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      });
    });

    // Explicit assertion on final vs non-final attempt error handling for malformed CropTargetData
    it("asserts that on final attempt with malformed ML output, sendCallback(FAILED) is called and COMPLETED is NEVER called", async () => {
      const finalContext: ReframeJobContext = {
        jobId: "job-ref-123",
        attemptsMade: 2,
        maxAttempts: 3,
      };
      const malformedTargets = {
        ...sampleCropTargets,
        schema_version: 999,
      };
      mockExecuteMl.mockResolvedValue(malformedTargets as any);

      await expect(
        processReframeJob(sampleJobPayload, finalContext, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
        })
      ).rejects.toThrow(CropTargetValidationError);

      // ML completed / returned malformed data
      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      // FFmpeg/renderVideo NEVER called
      expect(mockRenderVideo).not.toHaveBeenCalled();
      // sendCallback(COMPLETED) NEVER called
      expect(mockSendCallback).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "COMPLETED" })
      );
      // sendCallback(FAILED) is sent on final attempt
      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: sampleJobPayload.jobId,
          status: "FAILED",
        })
      );
    });
  });

  describe("Architectural Constraints (ZERO Database Imports)", () => {
    it("ensures reframe-worker directory has ZERO Prisma, Postgres, or DB imports", () => {
      const workerDir = path.resolve(__dirname);
      const files = ["config.ts", "client.ts", "orchestrator.ts", "index.ts"];

      for (const file of files) {
        const filePath = path.join(workerDir, file);
        expect(fs.existsSync(filePath)).toBe(true);

        const content = fs.readFileSync(filePath, "utf-8");
        expect(content).not.toMatch(/@prisma\/client/);
        expect(content).not.toMatch(/from\s+["'].*prisma["']/);
        expect(content).not.toMatch(/require\(["'].*prisma["']\)/);
        expect(content).not.toMatch(/from\s+["']pg["']/);
        expect(content).not.toMatch(/from\s+["']child_process["']/);
        expect(content).not.toMatch(/require\(["']child_process["']\)/);
      }
    });
  });
});
