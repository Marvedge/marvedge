import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import fs from "fs";
import path from "path";
import type { CropTargetData } from "../app/types/editor/crop-target";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import {
  processReframeJob,
  isFinalBullMqAttempt,
  classifyReframeError,
  type ReframeJobContext,
} from "./orchestrator";
import {
  callMlInference,
  postJobCallback,
  postJobCallbackWithRetry,
  CallbackHttpError,
  MlInferenceHttpError,
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
      crop: { x: 420, y: 0, width: 1080, height: 1920 },
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
        sampleCropTargets,
        { jobId: sampleJobPayload.jobId }
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

  describe("Phase 2 Fallback and Error Classification (Task-00082)", () => {
    it("triggers static center crop fallback and persists metadata when AutoFlip returns zero crop targets", async () => {
      mockExecuteMl.mockResolvedValueOnce({
        schema_version: 1,
        source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [],
      });

      const context: ReframeJobContext = {
        jobId: "job-empty-targets",
        attemptsMade: 0,
        maxAttempts: 3,
      };

      const result = await processReframeJob(
        {
          ...sampleJobPayload,
          jobId: "job-empty-targets",
        },
        context,
        {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        }
      );

      expect(result.success).toBe(true);
      expect(result.fallbackMetadata).toEqual({
        fallback: true,
        fallbackStage: "REFRAME",
        fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
        attemptsMade: 1,
      });

      // Crop targets should be non-empty and centered
      expect(result.cropTargets.crop_targets.length).toBeGreaterThan(0);
      expect(result.cropTargets.crop_targets[0].crop.width).toBe(608);
      expect(result.cropTargets.crop_targets[0].crop.height).toBe(1080);
      expect(result.cropTargets.crop_targets[0].crop.x).toBe(656);

      // Verify callback received fallback metadata
      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-empty-targets",
          status: "COMPLETED",
          fallback: true,
          fallbackStage: "REFRAME",
          fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
          attemptsMade: 1,
        })
      );
    });

    it("triggers static center crop fallback when AutoFlip returns invalid/unusable crop targets", async () => {
      mockExecuteMl.mockResolvedValueOnce({
        schema_version: 1,
        source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
        output: { aspect_ratio: "9:16" },
        crop_targets: [
          {
            timestamp_sec: 0,
            crop: { x: 0, y: 0, width: 0, height: 0 },
          },
        ],
      });

      const context: ReframeJobContext = {
        jobId: "job-invalid-targets",
        attemptsMade: 1,
        maxAttempts: 3,
      };

      const result = await processReframeJob(
        {
          ...sampleJobPayload,
          jobId: "job-invalid-targets",
        },
        context,
        {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        }
      );

      expect(result.success).toBe(true);
      expect(result.fallbackMetadata).toEqual({
        fallback: true,
        fallbackStage: "REFRAME",
        fallbackReason: "AUTOFLIP_INVALID_CROP_TARGETS",
        attemptsMade: 2,
      });

      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-invalid-targets",
          status: "COMPLETED",
          fallback: true,
          fallbackStage: "REFRAME",
          fallbackReason: "AUTOFLIP_INVALID_CROP_TARGETS",
          attemptsMade: 2,
        })
      );
    });

    it("fast-fails deterministic validation errors immediately without wasting BullMQ attempts", async () => {
      const mockDiscardJob = vi.fn().mockResolvedValue(undefined);
      const context: ReframeJobContext = {
        jobId: "job-bad-aspect",
        attemptsMade: 0,
        maxAttempts: 3,
        discardJob: mockDiscardJob,
      };

      await expect(
        processReframeJob(
          {
            ...sampleJobPayload,
            jobId: "job-bad-aspect",
            targetAspectRatio: "invalid-aspect",
          },
          context,
          {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
            resultCache: localCache,
          }
        )
      ).rejects.toThrow("invalid targetAspectRatio");

      // Fast-fail: discard job so BullMQ does not retry
      expect(mockDiscardJob).toHaveBeenCalledTimes(1);

      // Sent FAILED callback immediately
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-bad-aspect",
        status: "FAILED",
        error: expect.stringContaining("invalid targetAspectRatio"),
      });

      // Did not attempt ML or render
      expect(mockExecuteMl).not.toHaveBeenCalled();
      expect(mockRenderVideo).not.toHaveBeenCalled();
    });

    it("allows BullMQ retry on intermediate attempt (1/3) for transient ML failure", async () => {
      const mockDiscardJob = vi.fn();
      mockExecuteMl.mockRejectedValueOnce(
        new MlInferenceHttpError(503, "Service Unavailable")
      );

      const context: ReframeJobContext = {
        jobId: "job-transient",
        attemptsMade: 0,
        maxAttempts: 3,
        discardJob: mockDiscardJob,
      };

      await expect(
        processReframeJob(sampleJobPayload, context, {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        })
      ).rejects.toThrow("ML inference HTTP 503");

      // Did not discard job, so BullMQ will retry
      expect(mockDiscardJob).not.toHaveBeenCalled();

      // Did NOT send FAILED callback on intermediate attempt
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    it("falls back to center crop on retry exhaustion (attempt 3/3) after transient ML failures", async () => {
      mockExecuteMl.mockRejectedValueOnce(
        new MlInferenceHttpError(504, "Gateway Timeout")
      );

      const context: ReframeJobContext = {
        jobId: "job-retry-exhausted",
        attemptsMade: 2, // 3rd of 3 attempts
        maxAttempts: 3,
      };

      const result = await processReframeJob(
        {
          ...sampleJobPayload,
          jobId: "job-retry-exhausted",
          source: { width: 1920, height: 1080, fps: 30, durationSec: 5 },
        },
        context,
        {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        }
      );

      expect(result.success).toBe(true);
      expect(result.fallbackMetadata).toEqual({
        fallback: true,
        fallbackStage: "REFRAME",
        fallbackReason: "AUTOFLIP_RETRY_EXHAUSTED",
        attemptsMade: 3,
      });

      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-retry-exhausted",
          status: "COMPLETED",
          fallback: true,
          fallbackStage: "REFRAME",
          fallbackReason: "AUTOFLIP_RETRY_EXHAUSTED",
          attemptsMade: 3,
        })
      );
    });

    // ── LIVE BUG REGRESSION (Task-00082 manual validation) ────────────────────
    // Real BullMQ `job.attemptsMade` semantics:
    //   attempt 1 (1st execution):  attemptsMade=0  → transient → BullMQ retries
    //   attempt 2 (2nd execution):  attemptsMade=1  → transient → BullMQ retries
    //   attempt 3 (3rd execution):  attemptsMade=2  → FINAL     → fallback or FAILED
    // The `failed` event fires AFTER moveToFailed increments attemptsMade (+1),
    // so `attemptsMade=3` in the failed log does NOT reflect the in-processor value.
    //
    // The live worker submitted job cmuod5w6y0005vypwo3zgs5ed WITHOUT source dimensions.
    // Every execution: ML → fetch failed (TRANSIENT).
    // Expected: attempt 3 → FAILED with "retry exhausted; no source dimensions" message.
    // Observed: the old else-branch ran, logging "ML inference failed" without any
    //   indication that missing source dimensions caused the fallback to be skipped.
    it("sends FAILED with actionable message on final transient failure when source dimensions are absent (live regression)", async () => {
      // Simulate `fetch failed` — exactly what ECONNREFUSED produces via node fetch
      mockExecuteMl.mockRejectedValueOnce(new Error("fetch failed"));

      const mockDiscardJob = vi.fn();
      const context: ReframeJobContext = {
        // Real BullMQ value during the 3rd processor execution of a 3-attempt job
        jobId: "job-no-source-final",
        attemptsMade: 2,
        maxAttempts: 3,
        discardJob: mockDiscardJob,
      };

      // Payload WITHOUT source dimensions — matches the live ToolsPanel submission
      await expect(
        processReframeJob(
          {
            ...sampleJobPayload,
            jobId: "job-no-source-final",
            source: null, // ← no source dimensions
          },
          context,
          {
            executeMl: mockExecuteMl,
            renderVideo: mockRenderVideo,
            sendCallback: mockSendCallback,
            resultCache: localCache,
          }
        )
      ).rejects.toThrow("fetch failed");

      // Must have sent exactly one FAILED callback (not silently discarded)
      expect(mockSendCallback).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-no-source-final",
        status: "FAILED",
        error: expect.stringContaining("no source dimensions for fallback"),
      });

      // Must NOT have called discard (this is a transient exhaustion, not deterministic)
      expect(mockDiscardJob).not.toHaveBeenCalled();

      // Must NOT have attempted render (no valid crop targets computed)
      expect(mockRenderVideo).not.toHaveBeenCalled();
    });

    it("falls back to center crop on final transient failure when source dimensions ARE present (existing behavior preserved)", async () => {
      // Uses the same "fetch failed" error as the live failure to prove source
      // dimensions are the decisive factor — not the error type.
      mockExecuteMl.mockRejectedValueOnce(new Error("fetch failed"));

      const context: ReframeJobContext = {
        jobId: "job-with-source-final",
        attemptsMade: 2, // 3rd of 3 attempts — real BullMQ in-processor value
        maxAttempts: 3,
      };

      const result = await processReframeJob(
        {
          ...sampleJobPayload,
          jobId: "job-with-source-final",
          source: { width: 1920, height: 1080, fps: 30, durationSec: 10 },
        },
        context,
        {
          executeMl: mockExecuteMl,
          renderVideo: mockRenderVideo,
          sendCallback: mockSendCallback,
          resultCache: localCache,
        }
      );

      expect(result.success).toBe(true);
      expect(result.fallbackMetadata).toEqual({
        fallback: true,
        fallbackStage: "REFRAME",
        fallbackReason: "AUTOFLIP_RETRY_EXHAUSTED",
        attemptsMade: 3,
      });
      expect(mockRenderVideo).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-with-source-final",
          status: "COMPLETED",
          fallback: true,
          fallbackStage: "REFRAME",
          fallbackReason: "AUTOFLIP_RETRY_EXHAUSTED",
          attemptsMade: 3,
        })
      );
    });

    it("classifies error categories accurately and defaults unknown errors to TRANSIENT", () => {
      // Transient: timeouts, network failures, HTTP 429/502/503/504
      expect(classifyReframeError(new Error("AutoFlip container timeout"))).toBe("TRANSIENT");
      expect(classifyReframeError(new Error("Network error connecting to backend"))).toBe("TRANSIENT");
      expect(classifyReframeError(new Error("fetch failed"))).toBe("TRANSIENT");
      expect(classifyReframeError(new MlInferenceHttpError(503, "Service Unavailable"))).toBe("TRANSIENT");
      expect(classifyReframeError(new MlInferenceHttpError(429, "Too Many Requests"))).toBe("TRANSIENT");
      const econnError = Object.assign(new Error("connection dropped"), { code: "ECONNRESET" });
      expect(classifyReframeError(econnError)).toBe("TRANSIENT");

      // Deterministic: invalid payloads, bad aspect ratios, 4xx client errors
      expect(classifyReframeError(new Error("Invalid targetAspectRatio 'invalid'"))).toBe("DETERMINISTIC");
      expect(classifyReframeError(new Error("missing videoUrl"))).toBe("DETERMINISTIC");
      expect(classifyReframeError(new CallbackHttpError(400, "Bad Request"))).toBe("DETERMINISTIC");
      expect(classifyReframeError(new MlInferenceHttpError(400, "Bad Request"))).toBe("DETERMINISTIC");

      // Terminal: unrecoverable source media/rendering failures
      expect(classifyReframeError(new Error("FFmpeg rendering failed: unrecoverable bitstream"))).toBe("TERMINAL");
      expect(classifyReframeError(new Error("Cannot render reframed video"))).toBe("TERMINAL");
      expect(classifyReframeError(new Error("AutoFlip unrecoverable failure"))).toBe("TERMINAL");

      // Unknown or unclassified errors default to TRANSIENT so BullMQ can retry
      expect(classifyReframeError(new Error("Something completely unexpected happened"))).toBe("TRANSIENT");
      expect(classifyReframeError("string error")).toBe("TRANSIENT");
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
