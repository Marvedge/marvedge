// Domain types and Zod schemas for Transcript + Scene Detection + LLM Clip Scoring (Task-00041).

import { z } from "zod";
import type { SubtitleCue, SubtitleWord } from "../subtitles/types";

/**
 * A detected visual scene span in a video.
 */
export interface SceneBoundary {
  /** Scene start time in seconds (inclusive). */
  startTime: number;
  /** Scene end time in seconds (exclusive). */
  endTime: number;
  /** Optional transition confidence score from 0.0 to 1.0. */
  score?: number;
}

/**
 * Raw candidate shape returned by the LLM before boundary alignment.
 */
export const RawLlmClipCandidateSchema = z.object({
  startTime: z.number().nonnegative(),
  endTime: z.number().positive(),
  title: z.string().min(1).max(120),
  hook: z.string().min(1),
  viralityScore: z.number().min(0).max(100),
  engagementReasoning: z.string().min(1),
  keywords: z.array(z.string()).default([]),
});

export type RawLlmClipCandidate = z.infer<typeof RawLlmClipCandidateSchema>;

/**
 * Expected JSON response envelope from the LLM.
 */
export const RawLlmClipResponseSchema = z.object({
  clips: z.array(RawLlmClipCandidateSchema),
});

export type RawLlmClipResponse = z.infer<typeof RawLlmClipResponseSchema>;

/**
 * A validated, boundary-aligned, ranked clip candidate.
 */
export interface ClipCandidate {
  /** Deterministic identifier for this clip (e.g. "clip-1"). */
  id: string;
  /** Final aligned start time in seconds. */
  startTime: number;
  /** Final aligned end time in seconds. */
  endTime: number;
  /** Duration in seconds (endTime - startTime). */
  duration: number;
  /** Attention-grabbing title proposed for social feeds. */
  title: string;
  /** Opening hook phrase or sentence. */
  hook: string;
  /** Virality prediction score from 0 to 100. */
  viralityScore: number;
  /** Explanation of why this moment is engaging / shareable. */
  engagementReasoning: string;
  /** Key topics or hashtags associated with this clip. */
  keywords: string[];
  /** Constituents subtitle cues falling within this clip's time window. */
  cues?: SubtitleCue[];
  /** True if the start or end snapped to a word boundary. */
  alignedToWordBoundary: boolean;
  /** True if the start or end snapped to a scene cut. */
  alignedToSceneBoundary: boolean;
}

/**
 * Configuration options for the clip scoring engine.
 */
export interface ClipScoringOptions {
  /** Minimum allowable clip duration in seconds (default: 15s). */
  minDurationSeconds?: number;
  /** Maximum allowable clip duration in seconds (default: 60s). */
  maxDurationSeconds?: number;
  /** Target number of top clips to return (default: 3). */
  targetClipCount?: number;
  /** Target social media platform style (default: "general"). */
  platform?: "tiktok" | "reels" | "shorts" | "general";
  /** Optional OpenAI API key override. If omitted, uses process.env.OPENAI_API_KEY. */
  apiKey?: string;
  /** OpenAI model to use (default: "gpt-4o"). */
  model?: string;
  /** Custom temperature for the LLM completion (default: 0.3 for consistency). */
  temperature?: number;
}

/**
 * Input payload passed into the clip scoring pipeline.
 */
export interface ClipScoringInput {
  /** Subtitle cues with word timestamps from Whisper (Task-00038). */
  cues: readonly SubtitleCue[];
  /** Total video duration in seconds. */
  totalDuration: number;
  /** Optional detected visual scene boundaries. */
  scenes?: readonly SceneBoundary[];
  /** Optional video title or topic context. */
  videoTitle?: string;
  /** Optional configuration overrides. */
  options?: ClipScoringOptions;
}
