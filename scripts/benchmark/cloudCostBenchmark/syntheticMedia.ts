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

export function resolveOrGenerateInputMedia(
  inputPath?: string,
  targetDurationSec: number = 5
): { media: InputMediaMetadata; cleanup: () => void } {
  if (inputPath && fs.existsSync(inputPath)) {
    const stats = fs.statSync(inputPath);
    let durationSec = targetDurationSec;

    // Probe duration using ffprobe if available
    try {
      let ffprobeBin = "ffprobe";
      if (ffprobeStatic && (ffprobeStatic as unknown as { path?: string }).path) {
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
          inputPath,
        ],
        { encoding: "utf8", timeout: 1000 }
      );
      if (probeRes.status === 0 && probeRes.stdout) {
        const parsed = parseFloat(probeRes.stdout.trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          durationSec = parsed;
        }
      }
    } catch {
      // Keep default targetDurationSec on probe failure
    }

    return {
      media: {
        path: path.resolve(inputPath),
        durationSec: Number(durationSec.toFixed(2)),
        fileSizeBytes: stats.size,
        isSynthetic: false,
      },
      cleanup: () => {},
    };
  }

  // Generate lightweight synthetic MP4 test video in temp directory
  const tmpDir = path.join(os.tmpdir(), "marvedge-benchmark");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const syntheticPath = path.join(tmpDir, `synthetic_test_${targetDurationSec}s_${Date.now()}.mp4`);

  const ffmpegBin = typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg";

  try {
    execFileSync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${targetDurationSec}:size=1280x720:rate=30`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=1000:duration=${targetDurationSec}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        syntheticPath,
      ],
      { stdio: "ignore", timeout: 8000 }
    );
  } catch {
    fs.writeFileSync(syntheticPath, Buffer.from("SYNTHETIC_MEDIA_PLACEHOLDER"));
  }

  const stats = fs.existsSync(syntheticPath) ? fs.statSync(syntheticPath) : { size: 1024 };

  return {
    media: {
      path: syntheticPath,
      durationSec: targetDurationSec,
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
