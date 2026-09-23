// Orchestrator for the lightweight Reframe Worker (Task-00023).
//
// Consumes jobs from BullMQ "reframe-processing", coordinates external ML inference,
// and reports authenticated results back to the authoritative /api/jobs/callback.
//
// RETRY SEMANTICS:
// 1. ML inference failure:
//    - Intermediate BullMQ attempts: re-throw to allow BullMQ backoff retry; do NOT send FAILED callback.
//    - Final BullMQ attempt: send FAILED callback to backend, then throw.
// 2. Callback delivery failure:
//    - Retried internally with exponential backoff.
//    - If transient failure persists, successful ML result is cached so subsequent BullMQ attempts
//      retry callback delivery WITHOUT re-running ML inference.
//    - If backend returns 4xx (e.g. 400 validation rejection from validateCropTargetData),
//      the error is definitive; report FAILED callback and do not retry ML.
//
// Contains ZERO Prisma / Postgres imports.

import type { CropTargetData } from "../app/types/editor/crop-target";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import {
  callMlInference,
  postJobCallbackWithRetry,
  CallbackHttpError,
  type JobCallbackPayload,
  type MlInferenceRequest,
} from "./client";
import { getReframeWorkerConfig, type ReframeWorkerConfig } from "./config";
import { renderReframedVideo } from "./render";

export interface ReframeJobContext {
  jobId: string;
  attemptsMade: number;
  maxAttempts: number;
}

export interface ReframeOrchestratorDeps {
  config?: ReframeWorkerConfig;
  executeMl?: (request: MlInferenceRequest) => Promise<CropTargetData>;
  renderVideo?: (videoUrl: string, cropTargets: CropTargetData) => Promise<string>;
  sendCallback?: (payload: JobCallbackPayload) => Promise<{ success: boolean }>;
  resultCache?: Map<string, CropTargetData>;
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
  payload: ReframeJobPayload,
  context: ReframeJobContext,
  deps: ReframeOrchestratorDeps = {}
): Promise<{ success: boolean; cropTargets: CropTargetData; exportedUrl?: string }> {
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
    ((videoUrl: string, cropData: CropTargetData) =>
      renderReframedVideo(videoUrl, cropData));

  const sendCallback =
    deps.sendCallback ??
    ((cbPayload: JobCallbackPayload) =>
      postJobCallbackWithRetry(
        config.backendUrl,
        config.callbackSecret,
        cbPayload,
        {
          retries: config.callbackMaxRetries,
          delayMs: config.callbackRetryDelayMs,
        }
      ));

  const finalAttempt = isFinalBullMqAttempt(context);
  let cropTargets: CropTargetData;

  // ── Step 1: Obtain Crop Targets (Cache Check or ML Inference) ───────────
  if (cache.has(payload.jobId)) {
    console.log(
      `[reframe-worker] Reusing cached ML inference result for job ${payload.jobId} (attempt ${context.attemptsMade + 1}/${context.maxAttempts})`
    );
    cropTargets = cache.get(payload.jobId)!;
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

      // Cache the result in memory in case callback delivery fails
      cache.set(payload.jobId, cropTargets);
    } catch (mlError) {
      const errMsg =
        mlError instanceof Error ? mlError.message : String(mlError);

      if (!finalAttempt) {
        console.warn(
          `[reframe-worker] ML inference failed on attempt ${context.attemptsMade + 1}/${context.maxAttempts} for job ${payload.jobId}. Retrying via BullMQ... Error: ${errMsg}`
        );
        throw mlError;
      }

      // Final attempt: notify backend of permanent failure
      console.error(
        `[reframe-worker] ML inference exhausted all ${context.maxAttempts} attempts for job ${payload.jobId}. Sending FAILED callback... Error: ${errMsg}`
      );
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

  // ── Step 2: Render Reframed MP4 ─────────────────────────────────────────
  let exportedUrl: string | undefined;
  try {
    console.log(
      `[reframe-worker] Rendering reframed video for job ${payload.jobId}...`
    );
    exportedUrl = await renderVideo(payload.videoUrl, cropTargets);
    console.log(
      `[reframe-worker] Reframed video rendered and uploaded: ${exportedUrl}`
    );
  } catch (renderError) {
    const errMsg =
      renderError instanceof Error ? renderError.message : String(renderError);

    if (!finalAttempt) {
      console.warn(
        `[reframe-worker] Rendering failed on attempt ${context.attemptsMade + 1}/${context.maxAttempts} for job ${payload.jobId}. Retrying via BullMQ... Error: ${errMsg}`
      );
      throw renderError;
    }

    // Final attempt: notify backend of permanent failure
    console.error(
      `[reframe-worker] Rendering exhausted all ${context.maxAttempts} attempts for job ${payload.jobId}. Sending FAILED callback... Error: ${errMsg}`
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
    console.log(
      `[reframe-worker] Delivering COMPLETED callback for job ${payload.jobId}...`
    );
    await sendCallback({
      jobId: payload.jobId,
      status: "COMPLETED",
      cropTargets,
      exportedUrl,
    });

    // Callback succeeded; clean up cache
    cache.delete(payload.jobId);
    console.log(
      `[reframe-worker] Job ${payload.jobId} processed and callback confirmed successfully.`
    );
    return { success: true, cropTargets, exportedUrl };
  } catch (cbError) {
    // If the backend definitively rejected the payload (e.g. 400 validation error from validateCropTargetData)
    if (cbError instanceof CallbackHttpError && cbError.isClientError) {
      console.error(
        `[reframe-worker] Backend rejected callback with client error ${cbError.status} for job ${payload.jobId}: ${cbError.message}`
      );
      cache.delete(payload.jobId);

      // Report failure back to backend if it wasn't already a terminal state
      try {
        await sendCallback({
          jobId: payload.jobId,
          status: "FAILED",
          error: `Backend validation failed: ${cbError.message}`,
        });
      } catch (innerErr) {
        console.error(
          `[reframe-worker] Failed to report rejection failure callback:`,
          innerErr
        );
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
