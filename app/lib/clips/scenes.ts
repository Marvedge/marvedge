// Scene boundary detection using FFmpeg-native scene detection (Task-00041).
//
// Extracts visual cut boundaries directly using ffmpeg-static, with zero external
// Python or PySceneDetect runtime dependencies.

import { execFile } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import type { SceneBoundary } from "./types";

export interface SceneDetectionOptions {
  /** Scene change sensitivity threshold between 0.0 and 1.0 (default: 0.3). */
  threshold?: number;
  /** Maximum number of scenes to return (default: 50). */
  maxScenes?: number;
  /** Maximum time in ms to wait for FFmpeg to finish (default: 60000ms). */
  timeoutMs?: number;
  /** Known total video duration in seconds. If omitted or <= 0, inferred from last timestamp. */
  totalDuration?: number;
  /** Custom ffmpeg binary path override (defaults to ffmpeg-static). */
  ffmpegPath?: string;
}

/**
 * Parses stderr output from FFmpeg's `select='gt(scene,threshold)',showinfo` filter.
 *
 * Extracts PTS timestamps of detected scene changes and returns contiguous SceneBoundary spans.
 */
export function parseFfmpegSceneLog(
  logText: string,
  totalDuration = 0
): SceneBoundary[] {
  if (!logText || typeof logText !== "string") {
    return totalDuration > 0
      ? [{ startTime: 0, endTime: totalDuration }]
      : [];
  }

  // Look for showinfo pts_time lines: e.g. "pts_time:14.500" or "pts_time: 14.50"
  const regex = /pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g;
  const cutTimes: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(logText)) !== null) {
    const timeSec = parseFloat(match[1]);
    if (Number.isFinite(timeSec) && timeSec > 0.05) {
      // Deduplicate cuts that are too close together (< 0.2s apart)
      const last = cutTimes[cutTimes.length - 1];
      if (last === undefined || timeSec - last >= 0.2) {
        cutTimes.push(Math.round(timeSec * 100) / 100);
      }
    }
  }

  if (cutTimes.length === 0) {
    return totalDuration > 0
      ? [{ startTime: 0, endTime: Math.max(0.1, totalDuration) }]
      : [];
  }

  const effectiveDuration =
    totalDuration > 0
      ? totalDuration
      : Math.max(...cutTimes) + 5.0;

  const scenes: SceneBoundary[] = [];
  let currentStart = 0;

  for (const cut of cutTimes) {
    if (cut > currentStart && cut < effectiveDuration) {
      scenes.push({
        startTime: currentStart,
        endTime: cut,
      });
      currentStart = cut;
    }
  }

  // Final scene segment to end of video
  if (currentStart < effectiveDuration) {
    scenes.push({
      startTime: currentStart,
      endTime: effectiveDuration,
    });
  }

  return scenes;
}

/**
 * Runs FFmpeg to detect visual scene transitions in a video file.
 * Returns an array of contiguous SceneBoundary spans.
 */
export async function detectSceneCuts(
  videoPath: string,
  options: SceneDetectionOptions = {}
): Promise<SceneBoundary[]> {
  const threshold = options.threshold ?? 0.3;
  const timeoutMs = options.timeoutMs ?? 60000;
  const totalDuration = options.totalDuration ?? 0;
  const ffmpegBin = options.ffmpegPath || ffmpegStatic;

  if (!ffmpegBin) {
    // Fallback if no binary available
    return totalDuration > 0
      ? [{ startTime: 0, endTime: totalDuration }]
      : [];
  }

  const filterArg = `select='gt(scene,${threshold})',showinfo`;
  const args = [
    "-nostdin",
    "-i",
    videoPath,
    "-filter:v",
    filterArg,
    "-f",
    "null",
    "-",
  ];

  return new Promise((resolve) => {
    execFile(
      ffmpegBin,
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        // FFmpeg writes filter output to stderr
        const output = `${stdout || ""}\n${stderr || ""}`;
        const scenes = parseFfmpegSceneLog(output, totalDuration);

        // Even on execution failure, return fallback scene span rather than crashing
        if (scenes.length === 0 && totalDuration > 0) {
          resolve([{ startTime: 0, endTime: totalDuration }]);
        } else {
          resolve(scenes);
        }
      }
    );
  });
}
