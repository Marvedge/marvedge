import { execSync } from "node:child_process";
import fs from "node:fs";
// @ts-expect-error ffprobe-static does not bundle typescript types
import ffprobeStatic from "ffprobe-static";

export interface ClipScore {
  durationScore: number;
  bitrateScore: number;
  overlapScore?: number;
}

/**
 * Parses ASS timestamp "H:MM:SS.cs" into seconds.
 */
function parseAssTimestamp(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length < 3) return 0;
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Calculates subtitle display timing overlap ratio (0-100) from an ASS caption file.
 * NOTE: This represents subtitle display timing overlap (visual window collisions
 * between concurrent caption events on screen) rather than acoustic speech diarization
 * or spoken-voice overlap.
 * Returns undefined if no valid dialogue cues are found.
 */
function calculateAssOverlapScore(captionPath: string): number | undefined {
  try {
    if (!fs.existsSync(captionPath)) return undefined;
    const content = fs.readFileSync(captionPath, "utf8");
    const lines = content.split(/\r?\n/);
    const intervals: Array<{ start: number; end: number }> = [];

    for (const line of lines) {
      if (!line.startsWith("Dialogue:")) continue;
      // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const fields = line.substring("Dialogue:".length).split(",");
      if (fields.length >= 3) {
        const start = parseAssTimestamp(fields[1]);
        const end = parseAssTimestamp(fields[2]);
        if (end > start && Number.isFinite(start) && Number.isFinite(end)) {
          intervals.push({ start, end });
        }
      }
    }

    if (intervals.length === 0) return undefined;

    intervals.sort((a, b) => a.start - b.start);

    let totalDialogueDuration = 0;
    let totalOverlapDuration = 0;

    for (let i = 0; i < intervals.length; i++) {
      const cur = intervals[i];
      totalDialogueDuration += (cur.end - cur.start);

      for (let j = i + 1; j < intervals.length; j++) {
        const next = intervals[j];
        if (next.start >= cur.end) break; // intervals are sorted by start
        const overlapStart = Math.max(cur.start, next.start);
        const overlapEnd = Math.min(cur.end, next.end);
        if (overlapEnd > overlapStart) {
          totalOverlapDuration += (overlapEnd - overlapStart);
        }
      }
    }

    if (totalDialogueDuration <= 0) return 0;
    const overlapPercentage = (totalOverlapDuration / totalDialogueDuration) * 100;
    return Math.min(100, Math.max(0, Math.round(overlapPercentage)));
  } catch {
    return undefined;
  }
}

/**
 * Scores a video clip using FFprobe measurements and optional caption overlap analysis.
 *
 * Normalization formulas:
 * 1. durationScore:
 *    Target clip duration normalized to 60 seconds (1 minute):
 *    durationScore = Math.min(100, Math.max(0, Math.round((duration / 60) * 100)))
 * 2. bitrateScore:
 *    Target web 1080p video bitrate normalized to 5,000,000 bps (5 Mbps):
 *    bitrateScore = Math.min(100, Math.max(0, Math.round((bitrate / 5_000_000) * 100)))
 * 3. overlapScore (optional):
 *    Measures subtitle display timing overlap (visual window collisions between
 *    concurrent caption events) rather than acoustic speech diarization / spoken voice overlap:
 *    overlapScore = Math.min(100, Math.max(0, Math.round((overlapDuration / dialogueDuration) * 100)))
 *
 * Safe handling:
 * - Missing or invalid files return default scores of 0 without throwing.
 * - FFprobe execution failures are caught and handled gracefully.
 */
export function scoreClip(videoPath: string, captionPath?: string): ClipScore {
  const result: ClipScore = {
    durationScore: 0,
    bitrateScore: 0,
  };

  if (captionPath) {
    const overlapScore = calculateAssOverlapScore(captionPath);
    if (overlapScore !== undefined) {
      result.overlapScore = overlapScore;
    }
  }

  try {
    const isRemote =
      typeof videoPath === "string" &&
      (videoPath.startsWith("http://") || videoPath.startsWith("https://"));
    if (!videoPath || (!isRemote && !fs.existsSync(videoPath))) {
      return result;
    }

    const ffprobeBin =
      process.env.FFPROBE_PATH ||
      ffprobeStatic?.path ||
      "ffprobe";

    // Request format duration and stream bitrate in JSON format
    const cmd = `"${ffprobeBin}" -v error -select_streams v:0 -show_entries format=duration,bit_rate:stream=bit_rate -of json "${videoPath}"`;
    const stdout = execSync(cmd, { encoding: "utf8", timeout: 15000 });
    const data = JSON.parse(stdout);

    const duration = parseFloat(data.format?.duration) || 0;
    const streamBitrate = Number(data.streams?.[0]?.bit_rate) || 0;
    const formatBitrate = Number(data.format?.bit_rate) || 0;
    const bitrate = streamBitrate > 0 ? streamBitrate : formatBitrate;

    const durationScore = Math.min(100, Math.max(0, Math.round((duration / 60) * 100)));
    const bitrateScore = Math.min(100, Math.max(0, Math.round((bitrate / 5_000_000) * 100)));

    result.durationScore = Number.isFinite(durationScore) ? durationScore : 0;
    result.bitrateScore = Number.isFinite(bitrateScore) ? bitrateScore : 0;

    return result;
  } catch (err) {
    return result;
  }
}
