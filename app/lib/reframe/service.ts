// Service layer for the video reframing feature (Task-00023).
//
// Owns the business rules, queue submission, and payload typing for reframing jobs.
// Follows the same pattern as app/lib/audio/service.ts.
// The queue is injectable so handlers are unit-testable without a running Redis server.

import { reframeQueue } from "../queue";

export interface ReframeSourceMetadata {
  width: number;
  height: number;
  fps?: number;
  durationSec?: number;
}

export interface ReframeJobPayload {
  jobId: string;
  videoUrl: string;
  targetAspectRatio: string;
  userId?: string;
  demoId?: string | null;
  source?: ReframeSourceMetadata | null;
}

export interface ReframeJobQueue {
  add(
    kind: "reframe",
    payload: ReframeJobPayload,
    opts?: { jobId?: string }
  ): Promise<unknown>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** Default queue: BullMQ "reframe-processing", 3 retries, exponential backoff. */
export const reframeJobQueue: ReframeJobQueue = {
  add(kind, payload, opts) {
    return reframeQueue.add(kind, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
      jobId: opts?.jobId || payload.jobId,
    });
  },
};

/**
 * Validates request input fields before creating a database record or enqueuing.
 */
export function validateReframeInput(data: unknown): {
  videoUrl: string;
  targetAspectRatio: string;
  demoId?: string | null;
  source?: ReframeSourceMetadata | null;
} {
  if (!data || typeof data !== "object") {
    throw new ApiError(400, "Request body must be an object");
  }

  const record = data as Record<string, unknown>;
  const videoUrl = record.videoUrl;
  if (typeof videoUrl !== "string" || !videoUrl.trim()) {
    throw new ApiError(400, "videoUrl is required");
  }

  const targetAspectRatio = record.targetAspectRatio;
  if (typeof targetAspectRatio !== "string" || !targetAspectRatio.trim()) {
    throw new ApiError(400, "targetAspectRatio is required");
  }

  let demoId: string | null | undefined = undefined;
  if (record.demoId !== undefined) {
    if (record.demoId !== null && typeof record.demoId !== "string") {
      throw new ApiError(400, "demoId must be a string if provided");
    }
    demoId = record.demoId;
  }

  let source: ReframeSourceMetadata | null | undefined = undefined;
  if (record.source !== undefined && record.source !== null) {
    if (typeof record.source !== "object") {
      throw new ApiError(400, "source must be an object if provided");
    }
    const src = record.source as Record<string, unknown>;
    if (typeof src.width !== "number" || !Number.isFinite(src.width) || src.width <= 0) {
      throw new ApiError(400, "source.width must be a positive number");
    }
    if (typeof src.height !== "number" || !Number.isFinite(src.height) || src.height <= 0) {
      throw new ApiError(400, "source.height must be a positive number");
    }
    if (src.fps !== undefined && (typeof src.fps !== "number" || !Number.isFinite(src.fps) || src.fps <= 0)) {
      throw new ApiError(400, "source.fps must be a positive number if provided");
    }
    if (
      src.durationSec !== undefined &&
      (typeof src.durationSec !== "number" || !Number.isFinite(src.durationSec) || src.durationSec < 0)
    ) {
      throw new ApiError(400, "source.durationSec must be a non-negative number if provided");
    }
    source = {
      width: src.width,
      height: src.height,
      ...(src.fps !== undefined ? { fps: src.fps as number } : {}),
      ...(src.durationSec !== undefined ? { durationSec: src.durationSec as number } : {}),
    };
  }

  return {
    videoUrl: videoUrl.trim(),
    targetAspectRatio: targetAspectRatio.trim(),
    demoId,
    source,
  };
}
