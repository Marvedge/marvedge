// Media operations for the audio background jobs (GitHub #285).
//
// This module runs in the BullMQ worker (video-worker/index.ts) and is also
// imported by the app's test suite, so it uses relative imports only (no `@/`
// aliases — the worker resolves no tsconfig paths).
//
// Deliberately free of any R2/S3 SDK usage: download/upload go over the
// pre-signed URLs the API routes embed in the job payloads.

import { execFile } from "node:child_process";
import { closeSync, createReadStream, createWriteStream, openSync, readSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

import { AUDIO_MAX_BYTES, detectAudioMime } from "./validation";

/** How long a single download/upload may take before we give up. */
const TRANSFER_TIMEOUT_MS = 5 * 60 * 1000;

/** Download a signed URL, enforcing the audio size cap while streaming. */
export async function downloadAudioToFile(url: string, destinationPath: string): Promise<void> {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: TRANSFER_TIMEOUT_MS,
  });
  let receivedBytes = 0;
  const byteLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > AUDIO_MAX_BYTES) {
        callback(new Error("File exceeds the 50MB size limit"));
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    response.data as NodeJS.ReadableStream,
    byteLimit,
    createWriteStream(destinationPath)
  );
}

/** PUT a local file to a pre-signed upload URL. */
export async function uploadAudioViaSignedUrl(
  url: string,
  sourcePath: string,
  mimeType: string
): Promise<void> {
  const { size } = await stat(sourcePath);
  await axios.put(url, createReadStream(sourcePath), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(size),
    },
    maxBodyLength: Infinity,
    timeout: TRANSFER_TIMEOUT_MS,
  });
}

/**
 * Extract the duration (seconds) of an audio file. Prefers `ffprobe` (the same
 * API the existing worker uses) and falls back to parsing the `Duration:` line
 * from `ffmpeg -i` stderr so a machine without ffprobe on PATH still works.
 * Returns NaN when the duration cannot be determined.
 */
export async function probeAudioDuration(filePath: string): Promise<number> {
  try {
    const meta = await new Promise<{ format?: { duration?: number | string } }>(
      (resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, m) => (err ? reject(err) : resolve(m)));
      }
    );
    const duration = Number(meta?.format?.duration);
    if (Number.isFinite(duration) && duration > 0) {
      return duration;
    }
  } catch {
    // Fall through to the ffmpeg stderr fallback.
  }
  return probeDurationWithFfmpeg(filePath);
}

function probeDurationWithFfmpeg(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    if (!ffmpegStatic) {
      resolve(NaN);
      return;
    }
    execFile(
      ffmpegStatic,
      ["-hide_banner", "-i", filePath],
      { timeout: 30_000 },
      (_err, _stdout, stderr) => {
        // `ffmpeg -i` prints "Duration: HH:MM:SS.mmm" to stderr and exits
        // non-zero because there is no output file — that is expected.
        const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(String(stderr));
        if (match) {
          const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
          resolve(Number.isFinite(seconds) ? seconds : NaN);
        } else {
          resolve(NaN);
        }
      }
    );
  });
}

/** Read the first 512 bytes of a file for magic-byte sniffing. */
export function readHeadBytes(filePath: string): Buffer {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(512);
    const bytesRead = readSync(fd, buffer, 0, 512, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

/**
 * Trim an audio file with `ffmpeg -ss {start} -i in -t {end-start} -c:a copy out`.
 * The output codec is copied (the original is never re-encoded), so the trimmed
 * file is a brand-new asset with the same codec/container as its source.
 */
export function trimAudioFile(
  inputPath: string,
  outputPath: string,
  trimStartSec: number,
  trimEndSec: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .inputOptions(["-ss", String(trimStartSec)])
      .output(outputPath)
      .outputOptions(["-t", String(trimEndSec - trimStartSec)])
      .audioCodec("copy")
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err));
    command.run();
  });
}

export { detectAudioMime };
