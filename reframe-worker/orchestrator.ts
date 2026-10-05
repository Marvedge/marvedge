// Orchestrator for the lightweight Reframe Worker (Task-00023, Task-00082).
//
// Consumes jobs from BullMQ "reframe-processing", coordinates external ML inference,
// handles error classification, applies static center-crop fallback on recoverable failures,
// and reports authenticated results back to the authoritative /api/jobs/callback.
//
// RETRY & FALLBACK SEMANTICS:
// 1. Error Classification:
//    - TRANSIENT: Network failures, timeouts, 429/502/503/504 -> retry via BullMQ with backoff.
//    - DETERMINISTIC: Invalid input, 4xx client errors, invalid schema -> fast-fail without wasting retries.
//    - TERMINAL: FFmpeg unrecoverable media decoding/rendering failures -> report FAILED callback.
// 2. ML Inference Fallback:
//    - If AutoFlip returns 0 crop targets or invalid targets -> safely fall back to static center crop.
//    - If transient ML inference retries are exhausted on final attempt -> fall back to static center crop if source dimensions are available.
//    - Persist fallback metadata: { fallback: true, fallbackStage: "REFRAME", fallbackReason: "...", attemptsMade: ... }.
// 3. Rendering Idempotency:
//    - Pass jobId to renderVideo to ensure deterministic Cloudinary public ID.
// 4. Callback Delivery Failure:
//    - Retried internally with exponential backoff.
//    - Caches ML / fallback result in memory so retried attempts do not re-run ML.
//
// Contains ZERO Prisma / Postgres imports.

import {
  calculateCenterCropTargets,
  CropTargetValidationError,
  type CropTargetData,
  validateCropTargetData,
} from "../app/types/editor/crop-target";
import {
  validateReframeJobPayload,
  ReframePayloadValidationError,
} from "../app/lib/reframe/validation";
import {
  callMlInference,
  postJobCallbackWithRetry,
  CallbackHttpError,
  MlInferenceHttpError,
  type JobCallbackPayload,
  type MlInferenceRequest,
} from "./client";
import { getReframeWorkerConfig, type ReframeWorkerConfig } from "./config";
import { renderReframedVideo, type RenderReframedVideoOptions } from "./render";
import type { JobFallbackMetadata } from "../app/types/jobs/fallback";

export { ReframePayloadValidationError };

export interface ReframeJobContext {
  jobId: string;
  attemptsMade: number;
  maxAttempts: number;
  discardJob?: () => Promise<void> | void;
}

export interface ReframeOrchestratorDeps {
  config?: ReframeWorkerConfig;
  executeMl?: (request: MlInferenceRequest) => Promise<CropTargetData>;
  renderVideo?: (
    videoUrl: string,
    cropTargets: CropTargetData,
    options?: RenderReframedVideoOptions
  ) => Promise<string>;
  sendCallback?: (payload: JobCallbackPayload) => Promise<{ success: boolean }>;
  resultCache?: Map<string, CropTargetData>;
}

export type ErrorCategory = "TRANSIENT" | "DETERMINISTIC" | "TERMINAL";

/**
 * Classifies errors to determine whether BullMQ should retry or fail immediately.
 */
export function classifyReframeError(error: unknown): ErrorCategory {
  if (!error) {
    return "TRANSIENT";
  }

  if (error instanceof CallbackHttpError) {
    if (error.isClientError && error.status !== 429) {
      return "DETERMINISTIC";
    }
    return "TRANSIENT";
  }

  if (error instanceof MlInferenceHttpError) {
    if ([429, 502, 503, 504].includes(error.status)) {
      return "TRANSIENT";
    }
    if (error.isClientError) {
      return "DETERMINISTIC";
    }
    return "TRANSIENT";
  }

  if (error instanceof CropTargetValidationError) {
    return "DETERMINISTIC";
  }

  if (error instanceof Error) {
    if (
      error.name === "AbortError" ||
      error.message.includes("timed out") ||
      error.message.includes("timeout") ||
      error.message.includes("AutoFlip container timeout") ||
      error.message.toLowerCase().includes("network error") ||
      error.message.includes("fetch failed")
    ) {
      return "TRANSIENT";
    }

    if (
      "code" in error &&
      typeof (error as Record<string, unknown>).code === "string" &&
      ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN"].includes(
        (error as Record<string, unknown>).code as string
      )
    ) {
      return "TRANSIENT";
    }

    const match = /HTTP\s+(\d{3})/i.exec(error.message);
    if (match) {
      const code = parseInt(match[1], 10);
      if ([429, 502, 503, 504].includes(code)) {
        return "TRANSIENT";
      }
      if (code >= 400 && code < 500) {
        return "DETERMINISTIC";
      }
      if (code >= 500) {
        return "TRANSIENT";
      }
    }

    if (
      error.message.includes("missing videoUrl") ||
      error.message.includes("Invalid targetAspectRatio") ||
      error.message.includes("invalid targetAspectRatio") ||
      error.message.includes("Invalid reframe job payload") ||
      error.message.toLowerCase().includes("validation") ||
      error.message.toLowerCase().includes("unsupported")
    ) {
      return "DETERMINISTIC";
    }

    if (
      error.message.includes("FFmpeg rendering failed") ||
      error.message.includes("Cannot render reframed video") ||
      error.message.toLowerCase().includes("unrecoverable")
    ) {
      return "TERMINAL";
    }
  }

  // Unknown or unclassified errors default to TRANSIENT so BullMQ can retry
  // rather than prematurely discarding the job as deterministic.
  return "TRANSIENT";
}

// Module-level cache for successful ML inference results.
// Prevents duplicate ML inference if callback delivery experiences transient network issues.
const globalResultCache = new Map<string, CropTargetData>();

/**
 * Checks if current BullMQ run is the final allowed attempt.
 */
export function isFinalBullMqAttempt(context: ReframeJobContext): boolean {
  const maxAttempts = context.maxAttempts > 0 ? context.maxAttempts : 1;
  return context.attemptsMade >= maxAttempts - 1;
}

/**
 * Core orchestration logic for processing a single reframe job.
 */
export async function processReframeJob(
  rawPayload: unknown,
  context: ReframeJobContext,
  deps: ReframeOrchestratorDeps = {}
): Promise<{
  success: boolean;
  cropTargets: CropTargetData;
  exportedUrl?: string;
  fallbackMetadata?: JobFallbackMetadata;
}> {
  // ── Step 0: Validate Queued Job Payload (Task-00056) ───────────────────
  // A queued job cannot be trusted merely because it came from BullMQ.
  // Fails immediately before ML inference, rendering, upload, or callbacks.
  // Throws ReframePayloadValidationError (UnrecoverableError) so BullMQ does not retry.
  const payload = validateReframeJobPayload(rawPayload);

  const config = deps.config ?? getReframeWorkerConfig();
  const cache = deps.resultCache ?? globalResultCache;

  const executeMl =
    deps.executeMl ??
    ((req: MlInferenceRequest) =>
      callMlInference(config.mlServiceUrl, req, {
        timeoutMs: config.mlTimeoutMs,
      }));

  const renderVideo =
    deps.renderVideo ??
    ((videoUrl: string, cropData: CropTargetData, options?: RenderReframedVideoOptions) =>
      renderReframedVideo(videoUrl, cropData, options));

  const sendCallback =
    deps.sendCallback ??
    ((cbPayload: JobCallbackPayload) =>
      postJobCallbackWithRetry(config.backendUrl, config.callbackSecret, cbPayload, {
        retries: config.callbackMaxRetries,
        delayMs: config.callbackRetryDelayMs,
      }));

  // ── Step 0: Validate Input (Fast-Fail Deterministic Errors) ───────────────
  if (!payload.videoUrl || typeof payload.videoUrl !== "string") {
    const valErr = new Error("Invalid reframe job payload: missing videoUrl");
    console.error(`[reframe-worker] ${valErr.message}`);
    await context.discardJob?.();
    await sendCallback({
      jobId: payload.jobId,
      status: "FAILED",
      error: valErr.message,
    });
    throw valErr;
  }

  if (
    !payload.targetAspectRatio ||
    typeof payload.targetAspectRatio !== "string" ||
    !/^\d+:\d+$/.test(payload.targetAspectRatio.trim())
  ) {
    const valErr = new Error(
      `Invalid reframe job payload: invalid targetAspectRatio '${payload.targetAspectRatio}'`
    );
    console.error(`[reframe-worker] ${valErr.message}`);
    await context.discardJob?.();
    await sendCallback({
      jobId: payload.jobId,
      status: "FAILED",
      error: valErr.message,
    });
    throw valErr;
  }

  const finalAttempt = isFinalBullMqAttempt(context);
  let cropTargets: CropTargetData;
  let fallbackMetadata: JobFallbackMetadata | undefined;
  const createCenterCropFallback = (
    sourceDim: {
      width: number;
      height: number;
      fps?: number;
      durationSec?: number;
      duration_sec?: number;
    },
    reason: string
  ): CropTargetData => {
    const fallbackTargets = calculateCenterCropTargets(
      {
        width: sourceDim.width,
        height: sourceDim.height,
        fps: sourceDim.fps,
        duration_sec: sourceDim.duration_sec ?? sourceDim.durationSec,
      },
      payload.targetAspectRatio,
      payload.jobId
    );
    validateCropTargetData(fallbackTargets);
    fallbackMetadata = {
      fallback: true,
      fallbackStage: "REFRAME",
      fallbackReason: reason,
      attemptsMade: context.attemptsMade + 1,
    };
    return fallbackTargets;
  };

  // ── Step 1: Obtain Crop Targets (Cache Check, ML Inference, or Fallback) ─
  if (cache.has(payload.jobId)) {
    console.log(
      `[reframe-worker] Reusing cached ML inference result for job ${payload.jobId} (attempt ${context.attemptsMade + 1}/${context.maxAttempts})`
    );
    cropTargets = cache.get(payload.jobId)!;
    validateCropTargetData(cropTargets);
  } else {
    try {
      console.log(
        `[reframe-worker] Requesting ML inference for job ${payload.jobId} (attempt ${context.attemptsMade + 1}/${context.maxAttempts})`
      );
      cropTargets = await executeMl({
        videoUrl: payload.videoUrl,
        targetAspectRatio: payload.targetAspectRatio,
        source: payload.source,
      });

      // Check if returned crop targets are empty or unusable
      const isTargetEmpty =
        Array.isArray(cropTargets?.crop_targets) && cropTargets.crop_targets.length === 0;
      const hasUnusableTargets =
        Array.isArray(cropTargets?.crop_targets) &&
        cropTargets.crop_targets.length > 0 &&
        cropTargets.crop_targets.some(
          (t) =>
            !t ||
            !t.crop ||
            ((!Number.isFinite(t.crop.width) || t.crop.width <= 0) &&
              (!Number.isFinite(t.crop.height) || t.crop.height <= 0))
        );

      if (isTargetEmpty || hasUnusableTargets) {
        const sourceDim =
          payload.source?.width && payload.source?.height
            ? payload.source
            : cropTargets?.source?.width && cropTargets?.source?.height
              ? cropTargets.source
              : null;

        if (sourceDim) {
          const reason = isTargetEmpty
            ? "AUTOFLIP_EMPTY_CROP_TARGETS"
            : "AUTOFLIP_INVALID_CROP_TARGETS";
          console.warn(
            `[reframe-worker] AutoFlip returned ${isTargetEmpty ? "0" : "unusable"} crop targets; falling back to center crop for job ${payload.jobId}`
          );
          cropTargets = createCenterCropFallback(sourceDim, reason);
        } else {
          throw new Error(
            `AutoFlip returned ${isTargetEmpty ? "0" : "unusable"} crop targets and source dimensions are unknown`
          );
        }
      }

      validateCropTargetData(cropTargets);

      // Cache the result in memory in case callback delivery fails
      cache.set(payload.jobId, cropTargets);
    } catch (mlError) {
      if (mlError instanceof CropTargetValidationError && !finalAttempt) {
        throw mlError;
      }

      const category = classifyReframeError(mlError);
      const errMsg = mlError instanceof Error ? mlError.message : String(mlError);

      if (category === "TRANSIENT" && !finalAttempt) {
        console.warn(
          `[reframe-worker] Transient ML failure on attempt ${context.attemptsMade + 1}/${context.maxAttempts} for job ${payload.jobId}. Retrying via BullMQ... Error: ${errMsg}`
        );
        throw mlError;
      }

      // If final attempt of transient failure, try center crop fallback if source dimensions are available
      if (
        category === "TRANSIENT" &&
        finalAttempt &&
        payload.source?.width &&
        payload.source?.height
      ) {
        console.warn(
          `[reframe-worker] ML inference retry exhausted for job ${payload.jobId}; falling back to center crop. Error: ${errMsg}`
        );
        cropTargets = createCenterCropFallback(
          payload.source,
          "AUTOFLIP_RETRY_EXHAUSTED"
        );
        cache.set(payload.jobId, cropTargets);
      } else if (category === "TRANSIENT" && finalAttempt) {
        // Final transient failure but no source dimensions available: cannot compute
        // center-crop fallback. Report FAILED with an actionable message so the
        // caller knows to include source dimensions in future submissions.
        const noSrcMsg = `ML inference retry exhausted for job ${payload.jobId} and source dimensions unavailable for center-crop fallback. Error: ${errMsg}`;
        console.error(`[reframe-worker] ${noSrcMsg}`);
        try {
          await sendCallback({
            jobId: payload.jobId,
            status: "FAILED",
            error: `ML inference retry exhausted; no source dimensions for fallback: ${errMsg}`,
          });
        } catch (cbErr) {
          console.error(
            `[reframe-worker] Failed to send FAILED callback for job ${payload.jobId}:`,
            cbErr
          );
        }
        throw mlError;
      } else {
        // Non-recoverable failure or deterministic rejection
        console.error(
          `[reframe-worker] ML inference ${category === "DETERMINISTIC" ? "rejected" : "failed"} for job ${payload.jobId}: ${errMsg}`
        );
        if (category === "DETERMINISTIC") {
          await context.discardJob?.();
        }
        try {
          await sendCallback({
            jobId: payload.jobId,
            status: "FAILED",
            error: `ML inference failed: ${errMsg}`,
          });
        } catch (cbErr) {
          console.error(
            `[reframe-worker] Failed to send FAILED callback for job ${payload.jobId}:`,
            cbErr
          );
        }
        throw mlError;
      }
    }
  }


  // ── Step 2: Render Reframed MP4 ─────────────────────────────────────────
  let exportedUrl: string | undefined;
  try {
    console.log(`[reframe-worker] Rendering reframed video for job ${payload.jobId}...`);
    exportedUrl = await renderVideo(payload.videoUrl, cropTargets, {
      jobId: payload.jobId,
    });
    console.log(`[reframe-worker] Reframed video rendered and uploaded: ${exportedUrl}`);
  } catch (renderError) {
    const errMsg = renderError instanceof Error ? renderError.message : String(renderError);

    if (!finalAttempt) {
      console.warn(
        `[reframe-worker] Rendering failed on attempt ${context.attemptsMade + 1}/${context.maxAttempts} for job ${payload.jobId}. Retrying via BullMQ... Error: ${errMsg}`
      );
      throw renderError;
    }

    const renderCategory = classifyReframeError(renderError);
    if (renderCategory === "DETERMINISTIC") {
      await context.discardJob?.();
    }

    // Final attempt or non-retryable failure: notify backend of permanent failure
    console.error(
      `[reframe-worker] Rendering failed permanently for job ${payload.jobId}. Sending FAILED callback... Error: ${errMsg}`
    );
    try {
      await sendCallback({
        jobId: payload.jobId,
        status: "FAILED",
        error: `Video rendering failed: ${errMsg}`,
      });
    } catch (cbErr) {
      console.error(
        `[reframe-worker] Failed to send FAILED callback for job ${payload.jobId}:`,
        cbErr
      );
    }
    throw renderError;
  }

  // ── Step 3: Deliver Authenticated Callback to Backend ─────────────────
  try {
    console.log(`[reframe-worker] Delivering COMPLETED callback for job ${payload.jobId}...`);
    await sendCallback({
      jobId: payload.jobId,
      status: "COMPLETED",
      cropTargets,
      exportedUrl,
      ...(fallbackMetadata ?? {}),
    });

    // Callback succeeded; clean up cache
    cache.delete(payload.jobId);
    console.log(
      `[reframe-worker] Job ${payload.jobId} processed and callback confirmed successfully.`
    );
    return {
      success: true,
      cropTargets,
      exportedUrl,
      ...(fallbackMetadata ? { fallbackMetadata } : {}),
    };
  } catch (cbError) {
    // If the backend definitively rejected the payload (e.g. 400 validation error from validateCropTargetData)
    if (cbError instanceof CallbackHttpError && cbError.isClientError) {
      console.error(
        `[reframe-worker] Backend rejected callback with client error ${cbError.status} for job ${payload.jobId}: ${cbError.message}`
      );
      cache.delete(payload.jobId);
      await context.discardJob?.();

      // Report failure back to backend if it wasn't already a terminal state
      try {
        await sendCallback({
          jobId: payload.jobId,
          status: "FAILED",
          error: `Backend validation failed: ${cbError.message}`,
        });
      } catch (innerErr) {
        console.error("[reframe-worker] Failed to report rejection failure callback:", innerErr);
      }
      throw cbError;
    }

    // Transient callback delivery failure
    if (finalAttempt) {
      cache.delete(payload.jobId);
    }
    console.warn(
      `[reframe-worker] Callback delivery failed for job ${payload.jobId} (attempt ${context.attemptsMade + 1}/${context.maxAttempts}):`,
      cbError
    );
    throw cbError;
  }
}
