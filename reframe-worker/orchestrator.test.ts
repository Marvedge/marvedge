import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import fs from "fs";
import path from "path";
import type { CropTargetData } from "../app/types/editor/crop-target";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import {
  processReframeJob,
  isFinalBullMqAttempt,
  type ReframeJobContext,
} from "./orchestrator";
import {
  callMlInference,
  postJobCallback,
  postJobCallbackWithRetry,
  CallbackHttpError,
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
  let mockExecuteMl: Mock<[request: MlInferenceRequest], Promise<CropTargetData>>;
  let mockSendCallback: Mock<[payload: JobCallbackPayload], Promise<{ success: boolean }>>;
  let localCache: Map<string, CropTargetData>;

  beforeEach(() => {
    mockExecuteMl = vi.fn<(request: MlInferenceRequest) => Promise<CropTargetData>>().mockResolvedValue(sampleCropTargets);
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
        sendCallback: mockSendCallback,
        resultCache: localCache,
      });

      expect(result.success).toBe(true);
      expect(result.cropTargets).toEqual(sampleCropTargets);

      expect(mockExecuteMl).toHaveBeenCalledTimes(1);
      expect(mockExecuteMl).toHaveBeenCalledWith({
        videoUrl: sampleJobPayload.videoUrl,
        targetAspectRatio: sampleJobPayload.targetAspectRatio,
        source: sampleJobPayload.source,
      });

      expect(mockSendCallback).toHaveBeenCalledTimes(1);
      expect(mockSendCallback).toHaveBeenCalledWith({
        jobId: "job-ref-123",
        status: "COMPLETED",
        cropTargets: sampleCropTargets,
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
