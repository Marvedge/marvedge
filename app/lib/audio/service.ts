// Service layer for the audio feature (GitHub #285).
//
// Owns the business rules and all side effects (DB writes, R2 URL signing, job
// enqueues). Routes stay thin: auth, ownership, feature flag, then a call into
// here. The queue is injected so the full upload → confirm → metadata → trim
// flow is integration-testable without a running Next server or Redis.

import { audioQueue } from "../queue";
import type { AudioClipDto, AudioClipRecord } from "../../types/audio";
import type { AudioClipDb } from "./db";
import { signClipUploadUrl } from "./presign";
import { audioPlayableUrl, buildAudioObjectKey, resolveTestingPlayableUrls } from "./storage";
import { signReadUrl, signUploadUrl, isR2Configured } from "../r2";
import { sanitizeFilename, validateTrimRange, validateUploadRequest } from "./validation";
import { TRIMABLE_STATUSES } from "./status";

export type AudioJobKind = "extract-metadata" | "trim";

export interface AudioJobQueue {
  add(
    kind: AudioJobKind,
    payload: Record<string, unknown>,
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

/** Default queue: BullMQ "audio-processing", 3 retries, exponential backoff. */
export const audioJobQueue: AudioJobQueue = {
  add(kind, payload, opts) {
    return audioQueue.add(kind, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
      ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    });
  },
};

const TRIM_READ_URL_TTL_SECONDS = 2 * 60 * 60;
const TRIM_UPLOAD_URL_TTL_SECONDS = 60 * 60;

/** Map a DB row to the API shape, resolving playable URLs for any existing keys. */
export async function buildClipDto(record: AudioClipRecord): Promise<AudioClipDto> {
  let originalUrl: string;
  let trimmedUrl: string | null = null;

  if (isR2Configured()) {
    [originalUrl, trimmedUrl] = await Promise.all([
      audioPlayableUrl(record.originalKey),
      record.trimmedKey ? audioPlayableUrl(record.trimmedKey) : Promise.resolve(null),
    ]);
  } else {
    // Testing mode: trims are Cloudinary URL transformations, not stored files.
    ({ originalUrl, trimmedUrl } = await resolveTestingPlayableUrls(
      record.originalKey,
      record.trimmedKey,
      record.trimStartSec,
      record.trimEndSec
    ));
  }

  return {
    id: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    durationSec: record.durationSec,
    trimStartSec: record.trimStartSec,
    trimEndSec: record.trimEndSec,
    order: record.order,
    status: record.status,
    error: record.error,
    originalUrl,
    trimmedUrl,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Resolve a clip by id, asserting it belongs to `userId` (via its demo).
 */
export async function resolveOwnedClip(
  db: AudioClipDb,
  clipId: string,
  userId: string
): Promise<{ clip: AudioClipRecord & { demo: { userId: string } }; demoId: string }> {
  const clip = await db.audioClip.findUnique({
    where: { id: clipId },
    include: { demo: { select: { userId: true } } },
  });
  if (!clip || clip.demo.userId !== userId) {
    throw new ApiError(404, "Audio clip not found");
  }
  return { clip, demoId: clip.demoId };
}

/**
 * POST /api/demos/:id/audio/presign — validate the request, create the
 * UPLOADING clip, and return a 5-minute pre-signed PUT URL scoped to exactly
 * one object key.
 */
export async function createAudioUpload(args: {
  db: AudioClipDb;
  demoId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<{ clipId: string; uploadUrl: string }> {
  const validated = validateUploadRequest({
    fileName: args.fileName,
    mimeType: args.mimeType,
    size: args.size,
  });
  if (!validated.ok) {
    throw new ApiError(400, validated.error);
  }

  const objectKey = buildAudioObjectKey({
    demoId: args.demoId,
    userId: args.userId,
    ext: validated.ext,
  });

  const max = await args.db.audioClip.aggregate({
    where: { demoId: args.demoId },
    _max: { order: true },
  });
  const order = Math.min((max._max.order ?? -1) + 1, 2_147_483_647);

  // Signing can fail independently of the database. Do it before creating
  // a clip so a failed request does not leave an unusable UPLOADING row.
  const signedUploadUrl = isR2Configured()
    ? await signClipUploadUrl({ objectKey, mimeType: validated.mimeType })
    : null;

  const clip = await args.db.audioClip.create({
    data: {
      demoId: args.demoId,
      originalKey: objectKey,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      status: "UPLOADING",
      order,
    },
  });

  // Testing mode: without R2 credentials the browser uploads through our own
  // Cloudinary-backed endpoint instead of a pre-signed PUT. The URL is relative
  // so axios posts to it exactly like an R2 presigned PUT.
  const uploadUrl = signedUploadUrl ?? `/api/audio/${clip.id}/cloudinary-upload`;

  return { clipId: clip.id, uploadUrl };
}

/**
 * POST /api/audio/:clipId/confirm — the browser finished uploading the bytes.
 *
 * R2 mode: enqueue the metadata job (deduped by clipId; ffprobe measures the
 * duration server-side). Testing mode (no R2 creds): there is no worker to run
 * ffprobe, so the clip is finalized inline as READY using the client-provided
 * duration. Idempotent: only an UPLOADING clip gets processed.
 */
export async function confirmAudioUpload(args: {
  db: AudioClipDb;
  queue?: AudioJobQueue;
  clipId: string;
  userId: string;
  durationSec?: number | null;
}): Promise<AudioClipDto> {
  const { clip } = await resolveOwnedClip(args.db, args.clipId, args.userId);
  if (clip.status !== "UPLOADING") {
    return buildClipDto(clip);
  }

  if (!isR2Configured()) {
    // Testing mode — finalize inline, bounded client-supplied duration.
    const raw = args.durationSec;
    const durationSec =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? Math.min(Math.round(raw * 100) / 100, 3600)
        : null;
    const updated = await args.db.audioClip.update({
      where: { id: clip.id },
      data: { status: "READY", durationSec },
    });
    return buildClipDto(updated);
  }

  const dto = await buildClipDto(clip);
  if (!dto.originalUrl) {
    throw new ApiError(503, "Audio source URL is temporarily unavailable");
  }

  const queue = args.queue ?? audioJobQueue;
  await queue.add(
    "extract-metadata",
    {
      clipId: args.clipId,
      sourceUrl: dto.originalUrl,
    },
    { jobId: args.clipId }
  );

  return dto;
}

/**
 * PATCH /api/audio/:clipId/trim — validate the range, then persist it.
 *
 * R2 mode: enqueue the trim job which runs entirely in the worker (never blocks
 * the request). Testing mode: Cloudinary applies the trim as a URL
 * transformation, so we just store the window — READY immediately.
 */
export async function requestAudioTrim(args: {
  db: AudioClipDb;
  queue?: AudioJobQueue;
  clipId: string;
  userId: string;
  trimStartSec: number;
  trimEndSec: number;
}): Promise<AudioClipDto> {
  const { clip } = await resolveOwnedClip(args.db, args.clipId, args.userId);

  if (!TRIMABLE_STATUSES.includes(clip.status)) {
    throw new ApiError(409, `Audio clip is ${clip.status.toLowerCase()} and cannot be trimmed yet`);
  }

  const range = validateTrimRange({
    trimStartSec: args.trimStartSec,
    trimEndSec: args.trimEndSec,
    durationSec: clip.durationSec,
  });
  if (!range.ok) {
    throw new ApiError(400, range.error);
  }

  if (!isR2Configured()) {
    const updated = await args.db.audioClip.update({
      where: { id: clip.id },
      data: { trimStartSec: args.trimStartSec, trimEndSec: args.trimEndSec },
    });
    return buildClipDto(updated);
  }

  // Trim always re-trims from the ORIGINAL object, so coordinates are always
  // original-relative. The pre-signed URLs ride along in the job payload — the
  // worker has no S3 SDK of its own.
  const bucket = process.env.R2_RAW_BUCKET || process.env.GCP_RAW_BUCKET || "raw";
  const trimmedKey = buildAudioObjectKey({
    demoId: clip.demoId,
    userId: args.userId,
    ext: extFromKey(clip.originalKey),
  });

  const queue = args.queue ?? audioJobQueue;
  await queue.add("trim", {
    clipId: args.clipId,
    sourceUrl: await signReadUrl({
      bucket,
      object: clip.originalKey,
      expiresIn: TRIM_READ_URL_TTL_SECONDS,
    }),
    uploadUrl: await signUploadUrl({
      bucket,
      object: trimmedKey,
      contentType: clip.mimeType,
      expiresIn: TRIM_UPLOAD_URL_TTL_SECONDS,
    }),
    trimmedKey,
    previousTrimmedKey: clip.trimmedKey ?? null,
    mimeType: clip.mimeType,
    trimStartSec: args.trimStartSec,
    trimEndSec: args.trimEndSec,
  });

  return buildClipDto(clip);
}

/**
 * PATCH /api/audio/:clipId — rename the clip. The stored object keys are not
 * touched (renaming is display-only).
 */
export async function renameAudioClip(args: {
  db: AudioClipDb;
  clipId: string;
  userId: string;
  fileName: string;
}): Promise<AudioClipDto> {
  const { clip } = await resolveOwnedClip(args.db, args.clipId, args.userId);
  const fileName = sanitizeFilename(args.fileName);
  if (!fileName) {
    throw new ApiError(400, "A file name is required");
  }

  const updated = await args.db.audioClip.update({
    where: { id: clip.id },
    data: { fileName },
  });
  return buildClipDto(updated);
}

/**
 * PATCH /api/audio/:clipId/reorder — set `order` (0-based index in the list).
 */
export async function reorderAudioClip(args: {
  db: AudioClipDb;
  clipId: string;
  userId: string;
  order: number;
}): Promise<AudioClipDto> {
  const { clip } = await resolveOwnedClip(args.db, args.clipId, args.userId);
  if (!Number.isInteger(args.order) || args.order < 0) {
    throw new ApiError(400, "Order must be a non-negative integer");
  }

  const updated = await args.db.audioClip.update({
    where: { id: clip.id },
    data: { order: args.order },
  });
  return buildClipDto(updated);
}

/**
 * DELETE /api/audio/:clipId — remove the clip row. The R2 objects are dropped
 * by the route afterwards via `after()` (from "next/server") so the response is
 * not blocked on storage cleanup.
 */
export async function deleteAudioClip(args: {
  db: AudioClipDb;
  clipId: string;
  userId: string;
}): Promise<{ objectKeys: string[] }> {
  const { clip } = await resolveOwnedClip(args.db, args.clipId, args.userId);

  await args.db.audioClip.deleteMany({
    where: { id: clip.id, demo: { userId: args.userId } },
  });

  return {
    objectKeys: [clip.originalKey, clip.trimmedKey].filter((key): key is string => Boolean(key)),
  };
}

/** GET /api/demos/:id/audio — ordered clip list for the sidebar panel. */
export async function listAudioClips(args: {
  db: AudioClipDb;
  demoId: string;
}): Promise<AudioClipDto[]> {
  const clips = await args.db.audioClip.findMany({
    where: { demoId: args.demoId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all(clips.map(buildClipDto));
}

function extFromKey(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "" : key.slice(idx + 1);
}
