/**
 * Audio Validation Utilities (Task-00103)
 * Inspects binary audio payloads to ensure valid non-zero streams,
 * correct container headers (WAV, MP3, OGG), and ffprobe duration/decodability.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { VoiceStudioAudioValidationError } from "./errors";
import type { AudioProbeResult } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Validates audio magic bytes at the beginning of a buffer.
 */
export function validateAudioMagicBytes(
  buffer: Buffer,
  formatHint?: string
): {
  detectedFormat: string;
  isValid: boolean;
  error?: string;
} {
  if (!buffer || buffer.length === 0) {
    return { detectedFormat: "unknown", isValid: false, error: "Audio buffer is empty (0 bytes)" };
  }

  // Reject text or HTML error bodies returned with 200 OK
  const textPrefix = buffer.slice(0, 100).toString("utf8").trim().toLowerCase();
  if (
    textPrefix.startsWith("<!doctype html") ||
    textPrefix.startsWith("<html") ||
    textPrefix.startsWith('{"detail"') ||
    textPrefix.startsWith('{"error"')
  ) {
    return {
      detectedFormat: "text",
      isValid: false,
      error: `Server returned text/html/json payload instead of binary audio: "${textPrefix.slice(0, 60)}..."`,
    };
  }

  // 1. WAV Container check: 'RIFF' .... 'WAVE'
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    if (buffer.length < 44) {
      return {
        detectedFormat: "wav",
        isValid: false,
        error: "Truncated WAV header (less than 44 bytes)",
      };
    }
    return { detectedFormat: "wav", isValid: true };
  }

  // 2. MP3 Container check: ID3 tag or MPEG sync word (0xFFE0 mask)
  if (buffer.length >= 4) {
    if (buffer.toString("ascii", 0, 3) === "ID3") {
      return { detectedFormat: "mp3", isValid: true };
    }
    const b0 = buffer[0];
    const b1 = buffer[1];
    if (b0 === 0xff && (b1 & 0xe0) === 0xe0) {
      return { detectedFormat: "mp3", isValid: true };
    }
  }

  // 3. Ogg Container check: 'OggS'
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "OggS") {
    return { detectedFormat: "ogg", isValid: true };
  }

  // 4. FLAC Container check: 'fLaC'
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "fLaC") {
    return { detectedFormat: "flac", isValid: true };
  }

  if (formatHint && (formatHint === "pcm" || formatHint === "raw")) {
    return { detectedFormat: formatHint, isValid: buffer.length > 0 };
  }

  return {
    detectedFormat: "unknown",
    isValid: false,
    error: `Unrecognized audio signature in first 16 bytes: [${Array.from(buffer.slice(0, 16))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")}]`,
  };
}

/**
 * Deep inspection of audio using ffprobe when available on host system.
 */
export async function probeAudioWithFfprobe(
  buffer: Buffer,
  formatHint: string = "wav"
): Promise<AudioProbeResult> {
  const magic = validateAudioMagicBytes(buffer, formatHint);
  if (!magic.isValid) {
    return {
      isValid: false,
      format: magic.detectedFormat,
      durationSec: 0,
      error: magic.error,
    };
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vs-probe-"));
  const tempFile = path.join(tempDir, `audio.${magic.detectedFormat}`);

  try {
    await fs.promises.writeFile(tempFile, buffer);

    const ffprobeBin = process.env.FFPROBE_PATH || "ffprobe";
    const { stdout } = await execFileAsync(ffprobeBin, [
      "-v",
      "error",
      "-show_entries",
      "format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels",
      "-of",
      "json",
      tempFile,
    ]);

    const parsed = JSON.parse(stdout);
    const duration = parseFloat(parsed?.format?.duration || "0");
    const bitRate = parseInt(parsed?.format?.bit_rate || "0", 10) || undefined;

    const stream = parsed?.streams?.[0] || {};
    const sampleRate = parseInt(stream.sample_rate || "0", 10) || undefined;
    const channels = parseInt(stream.channels || "0", 10) || undefined;
    const codec = stream.codec_name || parsed?.format?.format_name || magic.detectedFormat;

    if (isNaN(duration) || duration <= 0) {
      return {
        isValid: false,
        format: codec,
        durationSec: 0,
        error: "ffprobe reported non-positive or NaN audio duration",
      };
    }

    return {
      isValid: true,
      format: codec,
      durationSec: Number(duration.toFixed(3)),
      sampleRate,
      channels,
      bitRate,
    };
  } catch (err: unknown) {
    const errMsg = (err as Error).message || String(err);
    if (errMsg.includes("ENOENT") || errMsg.includes("not found")) {
      return {
        isValid: true,
        format: magic.detectedFormat,
        durationSec: 0,
      };
    }

    return {
      isValid: false,
      format: magic.detectedFormat,
      durationSec: 0,
      error: `ffprobe inspection failed: ${errMsg}`,
    };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Asserts audio buffer correctness. Throws VoiceStudioAudioValidationError if invalid.
 */
export async function assertValidAudio(
  buffer: Buffer,
  formatHint: string = "wav"
): Promise<AudioProbeResult> {
  const result = await probeAudioWithFfprobe(buffer, formatHint);
  if (!result.isValid) {
    throw new VoiceStudioAudioValidationError(result.error || "Audio validation failed");
  }
  return result;
}
