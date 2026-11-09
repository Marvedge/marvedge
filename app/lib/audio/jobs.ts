// Background job handlers for the audio feature (GitHub #285).
//
// These run in the BullMQ worker (video-worker/index.ts) — never inline in the
// request/response cycle. Both jobs are idempotent and safe to retry:
//
//   Job 1 "extract-metadata" (enqueued by /confirm):
//     download the original → enforce the 50MB cap → sniff the real MIME from
//     magic bytes → probe the duration → status UPLOADING → PROCESSING → READY.
//     On failure: status FAILED + stored error.
//
//   Job 2 "trim" (enqueued by PATCH /trim):
//     download the original → trim with `-ss/-to -c:a copy` → upload the result
//     to a new trimmedKey → status TRIM_PROCESSING → READY. The original is
//     never mutated. On failure: status FAILED and the previous trimmedKey (if
//     any) is left intact, so the clip keeps its pre-trim state.
//
// This module uses relative imports only (the worker resolves no `@/` aliases),
// and takes its DB client as an argument so tests can inject a mock.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { deleteObject, getR2RawBucket } from "../r2";
import type { AudioClipStatus } from "../../types/audio";
import type { AudioClipDb } from "./db";
import {
  downloadAudioToFile,
  probeAudioDuration,
  readHeadBytes,
  trimAudioFile,
  uploadAudioViaSignedUrl,
} from "./media";
import { AUDIO_MAX_BYTES, ALLOWED_AUDIO_MIME_TYPES, detectAudioMime } from "./validation";

/** Small retry wrapper for DB writes (Neon cold-starts, same as the worker). */
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Audio job failed";
}

/** Write an audio clip to FAILED with the error, leaving storage fields alone.
 *  Best-effort: never masks the original error (e.g. a clip that no longer
 *  exists). */
async function failClip(db: AudioClipDb, clipId: string, error: string): Promise<void> {
  try {
    // Terminal guard: do not overwrite a clip that already finished.
    const current = await withDbRetry(() => db.audioClip.findUnique({ where: { id: clipId } }));
    const currentStatus = current?.status as string | undefined;
    if (
      currentStatus === "READY" ||
      currentStatus === "COMPLETED" ||
      currentStatus === "CANCELLED"
    ) {
      return;
    }
    await withDbRetry(() =>
      db.audioClip.update({
        where: { id: clipId },
        data: { status: "FAILED" satisfies AudioClipStatus, error },
      })
    );
  } catch {
    // Ignore — the caller still throws its original error to BullMQ.
  }
}

export interface MetadataJobPayload {
  clipId: string;
  /** Pre-signed read URL for the original object. */
  sourceUrl: string;
}

/**
 * Job 1 — extract duration + validate the real bytes. Idempotent: a clip that
 * is already READY is left untouched (a re-enqueued confirm is a no-op).
 */
export async function runMetadataJob(payload: MetadataJobPayload, db: AudioClipDb): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `audio-meta-${payload.clipId}-`));
  const filePath = path.join(tempDir, "input");
  try {
    const clip = await withDbRetry(() =>
      db.audioClip.findUnique({ where: { id: payload.clipId } })
    );
    if (!clip) {
      throw new Error("Audio clip not found");
    }
    if (clip.status === "READY") {
      return; // already processed — retry-safe no-op
    }

    await withDbRetry(() =>
      db.audioClip.update({
        where: { id: clip.id },
        data: { status: "PROCESSING" satisfies AudioClipStatus, error: null },
      })
    );

    await downloadAudioToFile(payload.sourceUrl, filePath);

    // Server-side size cap — the client-reported size is never trusted here.
    const { size } = await fs.promises.stat(filePath);
    if (size > AUDIO_MAX_BYTES) {
      throw new Error("File exceeds the 50MB size limit");
    }

    // Server-side MIME validation from the actual bytes.
    const detected = detectAudioMime(readHeadBytes(filePath));
    if (!detected || !ALLOWED_AUDIO_MIME_TYPES.has(detected)) {
      throw new Error("Unsupported audio type — upload an MP3, WAV, M4A or OGG file");
    }

    const durationSec = await probeAudioDuration(filePath);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error("Could not read the audio duration");
    }

    await withDbRetry(() =>
      db.audioClip.update({
        where: { id: clip.id },
        data: {
          status: "READY" satisfies AudioClipStatus,
          durationSec,
          mimeType: detected,
          error: null,
        },
      })
    );
  } catch (error) {
    await failClip(db, payload.clipId, errorMessage(error));
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export interface TrimJobPayload {
  clipId: string;
  /** Pre-signed read URL for the ORIGINAL object (trimming never mutates it). */
  sourceUrl: string;
  /** Pre-signed upload URL for the trimmed result. */
  uploadUrl: string;
  /** Object key the trimmed result is stored under. */
  trimmedKey: string;
  /** Previous trimmed key to drop once the new trim succeeds (may be null). */
  previousTrimmedKey: string | null;
  /** MIME to store the trimmed result as (the detected type). */
  mimeType: string;
  trimStartSec: number;
  trimEndSec: number;
}

/**
 * Job 2 — trim the original with ffmpeg and upload a NEW asset. Idempotent: if
 * the same trim range has already been applied for this trimmedKey, it's a
 * no-op. On failure the previous trimmedKey is left intact.
 */
export async function runTrimJob(payload: TrimJobPayload, db: AudioClipDb): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `audio-trim-${payload.clipId}-`));
  const inputPath = path.join(tempDir, "input");
  const ext = path.extname(payload.trimmedKey);
  const outputPath = path.join(tempDir, `trimmed${ext}`);
  try {
    const clip = await withDbRetry(() =>
      db.audioClip.findUnique({ where: { id: payload.clipId } })
    );
    if (!clip) {
      throw new Error("Audio clip not found");
    }
    const alreadyApplied =
      clip.status === "READY" &&
      clip.trimmedKey === payload.trimmedKey &&
      clip.trimStartSec === payload.trimStartSec &&
      clip.trimEndSec === payload.trimEndSec;
    if (alreadyApplied) {
      return; // retry-safe no-op
    }

    await withDbRetry(() =>
      db.audioClip.update({
        where: { id: clip.id },
        data: { status: "TRIM_PROCESSING" satisfies AudioClipStatus, error: null },
      })
    );

    await downloadAudioToFile(payload.sourceUrl, inputPath);

    const detected = detectAudioMime(readHeadBytes(inputPath));
    if (!detected || !ALLOWED_AUDIO_MIME_TYPES.has(detected)) {
      throw new Error("Original audio could not be validated for trimming");
    }

    await trimAudioFile(inputPath, outputPath, payload.trimStartSec, payload.trimEndSec);
    await uploadAudioViaSignedUrl(payload.uploadUrl, outputPath, payload.mimeType);

    await withDbRetry(() =>
      db.audioClip.update({
        where: { id: clip.id },
        data: {
          status: "READY" satisfies AudioClipStatus,
          trimmedKey: payload.trimmedKey,
          trimStartSec: payload.trimStartSec,
          trimEndSec: payload.trimEndSec,
          error: null,
        },
      })
    );

    // The previous trimmed asset (from an earlier successful trim) is now
    // orphaned — drop it best-effort. Never fails the job.
    if (payload.previousTrimmedKey && payload.previousTrimmedKey !== payload.trimmedKey) {
      try {
        await deleteObject({ bucket: getR2RawBucket(), object: payload.previousTrimmedKey });
      } catch (error) {
        console.error(
          `[audio] failed to clean up previous trim ${payload.previousTrimmedKey}:`,
          error
        );
      }
    }
  } catch (error) {
    // Keep the previous trimmedKey (if any) intact — the clip stays playable.
    await failClip(db, payload.clipId, errorMessage(error));
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
