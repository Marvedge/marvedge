// Pure validation module for video reframing (Task-00056).
// Contains ZERO Prisma, Postgres, Redis, or child_process imports.
// Safe to import in worker, Next.js route handlers, and unit tests.

import { UnrecoverableError } from "bullmq";
import { isSafeUrl } from "../safeUrl";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class ReframePayloadValidationError extends UnrecoverableError {
  constructor(message: string) {
    super(`Invalid queued reframe payload: ${message}`);
    this.name = "ReframePayloadValidationError";
  }
}

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

export function validateSourceMetadata(
  source: unknown,
  createError: (msg: string) => Error
): ReframeSourceMetadata | null | undefined {
  if (source === undefined || source === null) {
    return source;
  }
  if (typeof source !== "object" || Array.isArray(source)) {
    throw createError("source must be an object if provided");
  }
  const src = source as Record<string, unknown>;
  if (typeof src.width !== "number" || !Number.isFinite(src.width) || src.width <= 0) {
    throw createError("source.width must be a positive number");
  }
  if (typeof src.height !== "number" || !Number.isFinite(src.height) || src.height <= 0) {
    throw createError("source.height must be a positive number");
  }
  if (
    src.fps !== undefined &&
    (typeof src.fps !== "number" || !Number.isFinite(src.fps) || src.fps <= 0)
  ) {
    throw createError("source.fps must be a positive number if provided");
  }
  if (
    src.durationSec !== undefined &&
    (typeof src.durationSec !== "number" || !Number.isFinite(src.durationSec) || src.durationSec < 0)
  ) {
    throw createError("source.durationSec must be a non-negative number if provided");
  }
  return {
    width: src.width,
    height: src.height,
    ...(src.fps !== undefined ? { fps: src.fps } : {}),
    ...(src.durationSec !== undefined ? { durationSec: src.durationSec } : {}),
  };
}

/**
 * Validates API request input fields before creating a database record or enqueuing.
 * Throws ApiError(400, message) on validation failure.
 */
export function validateReframeInput(data: unknown): {
  videoUrl: string;
  targetAspectRatio: string;
  demoId?: string | null;
  source?: ReframeSourceMetadata | null;
} {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
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

  const source = validateSourceMetadata(record.source, (msg) => new ApiError(400, msg));

  return {
    videoUrl: videoUrl.trim(),
    targetAspectRatio: targetAspectRatio.trim(),
    demoId,
    source,
  };
}

/**
 * Validates a job payload entering the BullMQ worker boundary.
 * Throws ReframePayloadValidationError (UnrecoverableError) so BullMQ immediately
 * halts without retrying deterministic validation failures.
 */
export function validateReframeJobPayload(data: unknown): ReframeJobPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ReframePayloadValidationError("Job payload must be an object");
  }

  const record = data as Record<string, unknown>;

  // 1. jobId (required non-empty string)
  if (typeof record.jobId !== "string" || !record.jobId.trim()) {
    throw new ReframePayloadValidationError("jobId is required and must be a non-empty string");
  }

  // 2. videoUrl (required non-empty safe URL)
  if (typeof record.videoUrl !== "string" || !record.videoUrl.trim()) {
    throw new ReframePayloadValidationError("videoUrl is required and must be a non-empty string");
  }
  const trimmedUrl = record.videoUrl.trim();
  if (!isSafeUrl(trimmedUrl)) {
    throw new ReframePayloadValidationError(`videoUrl is unsafe or invalid: ${trimmedUrl}`);
  }

  // 3. targetAspectRatio (required non-empty string)
  if (typeof record.targetAspectRatio !== "string" || !record.targetAspectRatio.trim()) {
    throw new ReframePayloadValidationError("targetAspectRatio is required and must be a non-empty string");
  }

  // 4. userId (optional non-empty string)
  let userId: string | undefined = undefined;
  if (record.userId !== undefined) {
    if (typeof record.userId !== "string" || !record.userId.trim()) {
      throw new ReframePayloadValidationError("userId must be a non-empty string if provided");
    }
    userId = record.userId.trim();
  }

  // 5. demoId (optional string or null)
  let demoId: string | null | undefined = undefined;
  if (record.demoId !== undefined) {
    if (record.demoId !== null && typeof record.demoId !== "string") {
      throw new ReframePayloadValidationError("demoId must be a string if provided");
    }
    demoId = record.demoId;
  }

  // 6. source metadata (optional object with positive finite dimensions)
  const source = validateSourceMetadata(
    record.source,
    (msg) => new ReframePayloadValidationError(msg)
  );

  return {
    jobId: record.jobId.trim(),
    videoUrl: trimmedUrl,
    targetAspectRatio: record.targetAspectRatio.trim(),
    ...(userId !== undefined ? { userId } : {}),
    ...(demoId !== undefined ? { demoId } : {}),
    ...(source !== undefined ? { source } : {}),
  };
}
