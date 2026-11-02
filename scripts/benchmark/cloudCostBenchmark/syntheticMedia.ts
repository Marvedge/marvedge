/**
 * Task-0102: Synthetic Media & Input Resolution
 * Generates lightweight, valid test media locally with ffmpeg-static or resolves existing input files.
 */

import { execFileSync, spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
// @ts-expect-error untyped third-party module
import ffprobeStatic from "ffprobe-static";
import fs from "fs";
import os from "os";
import path from "path";
import type { InputMediaMetadata } from "./types";

/**
 * Validates that an MP4 file exists, is non-empty, and can be decoded by FFmpeg.
 * Returns parsed duration if available.
 */
export function validateMediaFile(
  filePath: string,
  ffmpegBinPath?: string
): { valid: boolean; durationSec?: number; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: `Media file does not exist at path: ${filePath}` };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, error: `Media file is empty (0 bytes): ${filePath}` };
  }

  // Fast signature check: reject text placeholders or non-binary headers
  try {
    const fd = fs.openSync(filePath, "r");
    const headerBuf = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, headerBuf, 0, 64, 0);
    fs.closeSync(fd);

    const prefix = headerBuf.slice(0, bytesRead).toString("utf8");
    if (prefix.includes("SYNTHETIC_MEDIA_PLACEHOLDER") || prefix.startsWith("placeholder")) {
      return { valid: false, error: `Media file is an invalid text placeholder: ${filePath}` };
    }
  } catch {
    // Continue to ffmpeg validation
  }

  const bin = ffmpegBinPath || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");

  // Validate format decoding with ffmpeg
  try {
    const probe = spawnSync(bin, ["-v", "error", "-i", filePath, "-f", "null", "-t", "0.5", "-"], {
      timeout: 5000,
      encoding: "utf8",
    });
    if (probe.status !== 0) {
      const errDetail = (probe.stderr || "").trim().slice(0, 200);
      return {
        valid: false,
        error: `FFmpeg failed to decode media file (${errDetail || "exit code " + probe.status})`,
      };
    }
  } catch (err: unknown) {
    return {
      valid: false,
      error: `Validation execution failed: ${(err as Error).message}`,
    };
  }

  return { valid: true };
}

export function resolveOrGenerateInputMedia(
  inputPath?: string,
  targetDurationSec: number = 5,
  options?: { ffmpegBin?: string; ffprobeBin?: string }
): { media: InputMediaMetadata; cleanup: () => void } {
  const durationTarget = Math.max(1, targetDurationSec);

  // 1. Existing input file resolution
  if (inputPath) {
    const resolvedPath = path.resolve(inputPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Input media file does not exist: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.size === 0) {
      throw new Error(`Input media file is empty (0 bytes): ${resolvedPath}`);
    }

    let durationSec = durationTarget;

    // Probe duration using ffprobe if available
    try {
      let ffprobeBin = options?.ffprobeBin || "ffprobe";
      if (
        !options?.ffprobeBin &&
        ffprobeStatic &&
        (ffprobeStatic as unknown as { path?: string }).path
      ) {
        ffprobeBin = (ffprobeStatic as unknown as { path: string }).path;
      }
      const probeRes = spawnSync(
        ffprobeBin,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          resolvedPath,
        ],
        { encoding: "utf8", timeout: 2000 }
      );
      if (probeRes.status === 0 && probeRes.stdout) {
        const parsed = parseFloat(probeRes.stdout.trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          durationSec = parsed;
        }
      }
    } catch {
      // Keep default target duration on probe failure
    }

    return {
      media: {
        path: resolvedPath,
        durationSec: Number(durationSec.toFixed(2)),
        fileSizeBytes: stats.size,
        isSynthetic: false,
      },
      cleanup: () => {},
    };
  }

  // 2. Synthetic media generation
  const tmpDir = path.join(os.tmpdir(), "marvedge-benchmark");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const syntheticPath = path.join(
    tmpDir,
    `synthetic_test_${durationTarget}s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
  );

  const ffmpegBin =
    options?.ffmpegBin || (typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg");

  // Verify FFmpeg availability before generating
  try {
    const check = spawnSync(ffmpegBin, ["-version"], { timeout: 3000 });
    if (check.error || check.status !== 0) {
      throw new Error(
        `FFmpeg binary is not executable at '${ffmpegBin}': ${check.error?.message || "exit code " + check.status}`
      );
    }
  } catch (err: unknown) {
    throw new Error(
      `Synthetic media generation failed: FFmpeg binary is unavailable (${(err as Error).message})`
    );
  }

  try {
    execFileSync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${durationTarget}:size=640x360:rate=15`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=1000:duration=${durationTarget}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        syntheticPath,
      ],
      { stdio: "ignore", timeout: 15000 }
    );
  } catch (err: unknown) {
    // Clean up partial or corrupted output on failure
    try {
      if (fs.existsSync(syntheticPath)) {
        fs.unlinkSync(syntheticPath);
      }
    } catch {
      // Ignored
    }
    throw new Error(
      `Synthetic media generation failed during FFmpeg encoding: ${(err as Error).message}`
    );
  }

  // Validate the generated output
  const validation = validateMediaFile(syntheticPath, ffmpegBin);
  if (!validation.valid) {
    try {
      if (fs.existsSync(syntheticPath)) {
        fs.unlinkSync(syntheticPath);
      }
    } catch {
      // Ignored
    }
    throw new Error(
      `Generated synthetic media failed validation: ${validation.error || "Corrupted media file"}`
    );
  }

  const stats = fs.statSync(syntheticPath);

  return {
    media: {
      path: syntheticPath,
      durationSec: durationTarget,
      fileSizeBytes: stats.size,
      isSynthetic: true,
    },
    cleanup: () => {
      try {
        if (fs.existsSync(syntheticPath)) {
          fs.unlinkSync(syntheticPath);
        }
      } catch {
        // Ignored
      }
    },
  };
}
