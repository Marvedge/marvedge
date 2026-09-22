// Deterministic boundary snapping and alignment for clip candidates (Task-00041).
//
// Ensures candidate start/end times never cut through a spoken word, align cleanly
// to natural speech pauses and scene transitions, and strictly adhere to clip
// duration constraints (e.g. 15s - 60s).

import type { SubtitleCue, SubtitleWord } from "../subtitles/types";
import type { SceneBoundary } from "./types";

export interface BoundaryAlignmentOptions {
  /** Minimum allowed clip duration in seconds (default: 15s). */
  minDurationSeconds?: number;
  /** Maximum allowed clip duration in seconds (default: 60s). */
  maxDurationSeconds?: number;
  /** Total video duration in seconds. */
  totalDuration?: number;
  /** Maximum tolerance in seconds to snap to a nearby scene cut (default: 0.8s). */
  sceneSnapToleranceSeconds?: number;
  /** Maximum tolerance in seconds to snap to a word boundary (default: 1.0s). */
  wordSnapToleranceSeconds?: number;
}

export interface AlignedBoundariesResult {
  startTime: number;
  endTime: number;
  duration: number;
  alignedToWordBoundary: boolean;
  alignedToSceneBoundary: boolean;
  cues: SubtitleCue[];
}

/**
 * Extracts all SubtitleWord items from cues in chronological order.
 * If cue.words is not present (legacy or manually edited cues), synthesizes words
 * by evenly distributing words across the cue span.
 */
export function extractAllWords(cues: readonly SubtitleCue[]): SubtitleWord[] {
  if (!Array.isArray(cues) || cues.length === 0) return [];

  const words: SubtitleWord[] = [];
  for (const cue of cues) {
    if (!cue || !cue.text) continue;

    if (Array.isArray(cue.words) && cue.words.length > 0) {
      for (const w of cue.words) {
        if (w && typeof w.word === "string" && Number.isFinite(w.start) && Number.isFinite(w.end)) {
          words.push({
            word: w.word.trim(),
            start: Math.max(0, w.start),
            end: Math.max(w.start + 0.01, w.end),
          });
        }
      }
    } else {
      // Synthesize words from cue.text
      const tokens = String(cue.text).trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      const start = Math.max(0, cue.start);
      const end = Math.max(start + 0.1, cue.end);
      const span = (end - start) / tokens.length;

      tokens.forEach((token, idx) => {
        const wStart = start + idx * span;
        const wEnd = wStart + span;
        words.push({
          word: token,
          start: Math.round(wStart * 100) / 100,
          end: Math.round(wEnd * 100) / 100,
        });
      });
    }
  }

  return words.sort((a, b) => a.start - b.start);
}

/**
 * Snaps a raw timestamp so that it NEVER cuts through the middle of a spoken word.
 *
 * For "start":
 * - If inside word [w.start, w.end], snaps to w.start.
 * - If within tolerance of a word start, snaps to w.start.
 *
 * For "end":
 * - If inside word [w.start, w.end], snaps to w.end.
 * - If within tolerance of a word end, snaps to w.end.
 */
export function snapToWordBoundary(
  timestamp: number,
  words: readonly SubtitleWord[],
  mode: "start" | "end",
  tolerance = 1.0
): { time: number; didSnap: boolean } {
  if (words.length === 0 || !Number.isFinite(timestamp)) {
    return { time: Math.max(0, timestamp), didSnap: false };
  }

  const t = Math.max(0, timestamp);

  // 1. Check if timestamp cuts right through any word
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (t >= w.start && t <= w.end) {
      // Cutting mid-word! Must snap.
      const snapped = mode === "start" ? w.start : w.end;
      return { time: Math.round(snapped * 100) / 100, didSnap: true };
    }
  }

  // 2. Look for the closest word boundary within tolerance
  let closestTime = t;
  let minDiff = tolerance;
  let didSnap = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const target = mode === "start" ? w.start : w.end;
    const diff = Math.abs(t - target);

    if (diff <= minDiff) {
      minDiff = diff;
      closestTime = target;
      didSnap = true;
    }
  }

  return {
    time: Math.round(closestTime * 100) / 100,
    didSnap,
  };
}

/**
 * Checks if a timestamp can snap to a nearby visual scene cut point,
 * provided doing so does not cut through a spoken word.
 */
export function snapToSceneCut(
  timestamp: number,
  sceneCuts: readonly number[],
  words: readonly SubtitleWord[],
  tolerance = 0.8
): { time: number; didSnap: boolean } {
  if (sceneCuts.length === 0 || !Number.isFinite(timestamp)) {
    return { time: timestamp, didSnap: false };
  }

  let bestCut = timestamp;
  let minDiff = tolerance;
  let didSnap = false;

  for (const cut of sceneCuts) {
    const diff = Math.abs(timestamp - cut);
    if (diff <= minDiff) {
      // Verify that this scene cut does NOT slice through an active spoken word
      const cutsWord = words.some((w) => cut > w.start + 0.05 && cut < w.end - 0.05);
      if (!cutsWord) {
        minDiff = diff;
        bestCut = cut;
        didSnap = true;
      }
    }
  }

  return { time: Math.round(bestCut * 100) / 100, didSnap };
}

/**
 * Slices SubtitleCues falling within [startTime, endTime].
 */
export function sliceCuesForClip(
  cues: readonly SubtitleCue[],
  startTime: number,
  endTime: number
): SubtitleCue[] {
  if (!Array.isArray(cues)) return [];

  return cues
    .filter((c) => c && c.end > startTime && c.start < endTime)
    .map((c) => {
      // Re-time cue relative to video, clamped to clip window
      const start = Math.max(startTime, c.start);
      const end = Math.min(endTime, c.end);
      const words = Array.isArray(c.words)
        ? (c.words as SubtitleWord[]).filter((w: SubtitleWord) => w.end > startTime && w.start < endTime)
        : undefined;

      return {
        start: Math.round(start * 100) / 100,
        end: Math.round(end * 100) / 100,
        text: c.text,
        words,
      };
    });
}

/**
 * Aligns raw candidate start and end times to:
 * 1. Word boundaries (avoiding cutting mid-word)
 * 2. Visual scene transitions (when close and safe)
 * 3. Min/max duration constraints (e.g. 15s - 60s)
 */
export function alignClipBoundaries(
  candidate: { startTime: number; endTime: number },
  cues: readonly SubtitleCue[],
  scenes: readonly SceneBoundary[] = [],
  options: BoundaryAlignmentOptions = {}
): AlignedBoundariesResult | null {
  const minDur = options.minDurationSeconds ?? 15;
  const maxDur = options.maxDurationSeconds ?? 60;
  const totalDuration = options.totalDuration ?? Infinity;
  const sceneTolerance = options.sceneSnapToleranceSeconds ?? 0.8;
  const wordTolerance = options.wordSnapToleranceSeconds ?? 1.0;

  const words = extractAllWords(cues);
  const sceneCutPoints = scenes
    .map((s) => s.startTime)
    .concat(scenes.map((s) => s.endTime))
    .filter((t) => t > 0.1 && t < totalDuration);

  let start = Math.max(0, candidate.startTime);
  let end = Math.max(start + 1.0, candidate.endTime);

  let alignedToWord = false;
  let alignedToScene = false;

  // 1. First attempt word snap to prevent cutting words
  const wordStartSnap = snapToWordBoundary(start, words, "start", wordTolerance);
  start = wordStartSnap.time;
  if (wordStartSnap.didSnap) alignedToWord = true;

  const wordEndSnap = snapToWordBoundary(end, words, "end", wordTolerance);
  end = wordEndSnap.time;
  if (wordEndSnap.didSnap) alignedToWord = true;

  // 2. Attempt scene cut snap if near a transition
  const sceneStartSnap = snapToSceneCut(start, sceneCutPoints, words, sceneTolerance);
  if (sceneStartSnap.didSnap) {
    start = sceneStartSnap.time;
    alignedToScene = true;
  }

  const sceneEndSnap = snapToSceneCut(end, sceneCutPoints, words, sceneTolerance);
  if (sceneEndSnap.didSnap) {
    end = sceneEndSnap.time;
    alignedToScene = true;
  }

  // 3. Clamp to total video duration
  start = Math.max(0, start);
  if (Number.isFinite(totalDuration)) {
    end = Math.min(totalDuration, end);
  }

  let duration = end - start;

  // 4. Enforce minimum duration constraint
  if (duration < minDur) {
    // Try to extend end
    const needed = minDur - duration;
    const proposedEnd = end + needed;
    if (proposedEnd <= totalDuration) {
      const snapAfterExtend = snapToWordBoundary(proposedEnd, words, "end", wordTolerance);
      end = Math.min(totalDuration, snapAfterExtend.time);
      duration = end - start;
    } else {
      // Try to extend start backwards
      const proposedStart = Math.max(0, start - (minDur - duration));
      const snapStart = snapToWordBoundary(proposedStart, words, "start", wordTolerance);
      start = snapStart.time;
      duration = end - start;
    }
  }

  // 5. Enforce maximum duration constraint
  if (duration > maxDur) {
    const proposedEnd = start + maxDur;
    const snapEnd = snapToWordBoundary(proposedEnd, words, "end", wordTolerance);
    end = snapEnd.time;
    duration = end - start;
  }

  // Final check on duration validity
  duration = Math.round((end - start) * 100) / 100;
  if (duration < minDur * 0.8 || duration > maxDur * 1.2 || end <= start) {
    return null;
  }

  const clipCues = sliceCuesForClip(cues, start, end);

  return {
    startTime: Math.round(start * 100) / 100,
    endTime: Math.round(end * 100) / 100,
    duration,
    alignedToWordBoundary: alignedToWord,
    alignedToSceneBoundary: alignedToScene,
    cues: clipCues,
  };
}
