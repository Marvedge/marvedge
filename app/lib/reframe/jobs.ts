// Background job execution boundary for the video reframing feature (Task-00023).
//
// Defines the consumer lifecycle contract for when the AI/ML service or worker picks up
// a "reframe" job from BullMQ.
//
// In accordance with Task-00023 constraints:
// - The AI/ML service is an external integration boundary.
// - No synthetic or deterministic crop coordinates are manufactured here.
// - If no external ML execution backend is provided, the runner fails explicitly and cleanly.
//
// This module uses relative imports only (for worker process compatibility) and
// accepts a DB client argument so tests can inject a mock.

import type { CropTargetData } from "../../types/editor/crop-target";
import { validateCropTargetData } from "../../types/editor/crop-target";
import type { ReframeJobPayload } from "./service";

export interface ReframeDbClient {
  videoJob: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string;
      status: string;
      jobData: unknown;
    } | null>;
    update: (args: {
      where: { id: string };
      data: {
        status?: string;
        progress?: number;
        jobData?: unknown;
        error?: string | null;
      };
    }) => Promise<unknown>;
  };
}

export interface ReframeJobRunnerOptions {
  /**
   * External AI/ML inference boundary handler.
   * By default, this is undefined in this repository because AutoFlip/TalkNet
   * inference runs in an external ML container/service.
   */
  executeMlReframe?: (payload: ReframeJobPayload) => Promise<CropTargetData>;
}

/** Small retry wrapper for DB writes (Neon cold-starts, matching worker standard). */
async function withDbRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isConnErr =
        error instanceof Error &&
        (error.message.includes("Can't reach database") || error.message.includes("connect"));
      if (isConnErr && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Runs a reframe job lifecycle on the consumer side.
 * Updates VideoJob progress, invokes the external ML runner if configured, validates
 * the result against the Task-00016 CropTargetData contract, and persists the result.
 */
export async function runReframeJob(
  payload: ReframeJobPayload,
  db: ReframeDbClient,
  options: ReframeJobRunnerOptions = {}
): Promise<CropTargetData> {
  const { jobId, targetAspectRatio } = payload;

  const job = await withDbRetry(() => db.videoJob.findUnique({ where: { id: jobId } }));
  if (!job) {
    throw new Error(`VideoJob not found: ${jobId}`);
  }

  // Idempotency: if already completed, do not re-process
  if (job.status === "COMPLETED") {
    const existingData = (job.jobData || {}) as Record<string, unknown>;
    return existingData.cropTargets as CropTargetData;
  }

  try {
    // 1. Mark PROCESSING
    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: {
          status: "PROCESSING",
          progress: 10,
        },
      })
    );

    // 2. Check ML execution boundary
    if (!options.executeMlReframe) {
      throw new Error(
        "AI/ML reframe service is not configured. An external ML service (AutoFlip container) is required to process reframe jobs."
      );
    }

    // 3. Execute external ML inference
    const cropData = await options.executeMlReframe(payload);

    // 4. Validate output against Task-00016 contract
    validateCropTargetData(cropData);

    // 5. Persist COMPLETED status and cropTargets in jobData
    const existingJobData =
      job.jobData && typeof job.jobData === "object" ? (job.jobData as Record<string, unknown>) : {};

    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          jobData: {
            ...existingJobData,
            kind: "REFRAME",
            targetAspectRatio,
            cropTargets: cropData,
          },
        },
      })
    );

    return cropData;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Reframe job failed";

    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: errorMsg,
        },
      })
    ).catch(() => {});

    throw err;
  }
}
