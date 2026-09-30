// LLM-powered viral clip candidate scoring engine (Task-00041).
//
// Analyzes Whisper transcript cues (with word-level timestamps) and visual scene
// cuts to extract, evaluate, align, and rank short-form clip candidates using OpenAI gpt-4o.

import OpenAI from "openai";
import type { SubtitleCue } from "../subtitles/types";
import { alignClipBoundaries } from "./boundaries";
import {
  type ClipCandidate,
  type ClipScoringInput,
  type ClipScoringOptions,
  type RawLlmClipCandidate,
  RawLlmClipResponseSchema,
  type SceneBoundary,
} from "./types";

export class ClipScoringError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ClipScoringError";
  }
}

/**
 * Formats a duration in seconds to MM:SS.ss timecode.
 */
function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * Formats transcript cues into clean timestamped transcript lines for LLM ingestion.
 */
export function buildTranscriptPromptText(cues: readonly SubtitleCue[]): string {
  if (!Array.isArray(cues) || cues.length === 0) {
    return "(No speech transcript available)";
  }

  return cues
    .filter((c) => c && c.text && String(c.text).trim().length > 0)
    .map((c) => `[${formatTimecode(c.start)} - ${formatTimecode(c.end)}] ${c.text.trim()}`)
    .join("\n");
}

/**
 * Builds system prompt instructing the LLM on viral clip identification and structured output.
 */
export function buildSystemPrompt(minDuration: number, maxDuration: number, platform: string): string {
  return [
    "You are an elite short-form video editor and viral content strategist specialized in TikTok, Instagram Reels, and YouTube Shorts.",
    "Your objective is to analyze the timestamped transcript of a video and select the highest-performing, self-contained clip candidates.",
    "",
    "Rules for selecting clips:",
    `1. Target Duration: Each clip MUST be between ${minDuration} and ${maxDuration} seconds long.`,
    "2. Strong Hook: The first 3 seconds must immediately pique curiosity, present a conflict, or reveal a surprising insight.",
    "3. Narrative Completeness: The clip must tell a complete micro-story or explain a complete idea. Never end on an unfinished sentence or cliffhanger unless it creates an irresistible loop.",
    "4. Virality Scoring (0-100): Score based on emotional resonance, hook strength, topic relevance, and shareability.",
    `5. Optimize specifically for: ${platform.toUpperCase()}.`,
    "",
    "Output Requirements:",
    "Return a JSON object containing a 'clips' array with the exact schema:",
    "{",
    '  "clips": [',
    "    {",
    '      "startTime": <float seconds>,',
    '      "endTime": <float seconds>,',
    '      "title": "<punchy attention-grabbing title under 80 chars>",',
    '      "hook": "<the opening hook line>",',
    '      "viralityScore": <integer 0 to 100>,',
    '      "engagementReasoning": "<1-2 sentences explaining why this moment will perform well>",',
    '      "keywords": ["<tag1>", "<tag2>"]',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

/**
 * Builds user prompt providing video metadata, transcript lines, and scene cuts.
 */
export function buildUserPrompt(
  cues: readonly SubtitleCue[],
  totalDuration: number,
  scenes: readonly SceneBoundary[] = [],
  videoTitle?: string
): string {
  const transcriptText = buildTranscriptPromptText(cues);
  const sceneCuts = scenes
    .map((s) => s.startTime)
    .filter((t) => t > 0.5 && t < totalDuration)
    .map((t) => `${t.toFixed(1)}s`);

  const lines = [
    videoTitle ? `Video Title: "${videoTitle}"` : "Video Title: (Untitled)",
    `Total Duration: ${totalDuration.toFixed(1)} seconds (${formatTimecode(totalDuration)})`,
  ];

  if (sceneCuts.length > 0) {
    lines.push(`Visual Scene Transitions Detected at: ${sceneCuts.slice(0, 30).join(", ")}`);
  }

  lines.push("", "=== Transcript ===", transcriptText);

  return lines.join("\n");
}

/**
 * Deduplicates overlapping candidates by keeping the candidate with the highest viralityScore.
 */
export function deduplicateCandidates(
  candidates: readonly ClipCandidate[],
  overlapThreshold = 0.65
): ClipCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.viralityScore - a.viralityScore);
  const result: ClipCandidate[] = [];

  for (const candidate of sorted) {
    const isOverlapping = result.some((accepted) => {
      const overlapStart = Math.max(candidate.startTime, accepted.startTime);
      const overlapEnd = Math.min(candidate.endTime, accepted.endTime);
      if (overlapEnd <= overlapStart) return false;

      const overlapDur = overlapEnd - overlapStart;
      const minDur = Math.min(candidate.duration, accepted.duration);
      return overlapDur / minDur >= overlapThreshold;
    });

    if (!isOverlapping) {
      result.push(candidate);
    }
  }

  return result.sort((a, b) => b.viralityScore - a.viralityScore);
}

/**
 * Evaluates a transcript and visual scene cuts with OpenAI to extract ranked viral clip candidates.
 */
export async function scoreTranscriptClips(
  input: ClipScoringInput
): Promise<ClipCandidate[]> {
  const { cues, totalDuration, scenes = [], videoTitle, options = {} } = input;

  if (!Array.isArray(cues) || cues.length === 0) {
    return [];
  }

  const minDuration = options.minDurationSeconds ?? 15;
  const maxDuration = options.maxDurationSeconds ?? 60;
  const targetCount = options.targetClipCount ?? 3;
  const platform = options.platform ?? "general";
  const model = options.model ?? "gpt-4o";
  const temperature = options.temperature ?? 0.3;

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ClipScoringError("Missing OPENAI_API_KEY for clip scoring");
  }

  const openai = new OpenAI({ apiKey });
  const systemPrompt = buildSystemPrompt(minDuration, maxDuration, platform);
  const userPrompt = buildUserPrompt(cues, totalDuration, scenes, videoTitle);

  let rawContent = "";
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    rawContent = completion.choices[0]?.message?.content ?? "{}";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ClipScoringError(`OpenAI API request failed: ${msg}`, err);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    throw new ClipScoringError("Failed to parse LLM JSON response", { rawContent, error: err });
  }

  const parseResult = RawLlmClipResponseSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    throw new ClipScoringError("LLM response failed schema validation", parseResult.error.format());
  }

  const rawClips: RawLlmClipCandidate[] = parseResult.data.clips;
  const alignedClips: ClipCandidate[] = [];

  for (const raw of rawClips) {
    const aligned = alignClipBoundaries(
      { startTime: raw.startTime, endTime: raw.endTime },
      cues,
      scenes,
      {
        minDurationSeconds: minDuration,
        maxDurationSeconds: maxDuration,
        totalDuration,
      }
    );

    if (!aligned) continue;

    alignedClips.push({
      id: `clip-${alignedClips.length + 1}`,
      startTime: aligned.startTime,
      endTime: aligned.endTime,
      duration: aligned.duration,
      title: raw.title.trim(),
      hook: raw.hook.trim(),
      viralityScore: Math.min(100, Math.max(0, Math.round(raw.viralityScore))),
      engagementReasoning: raw.engagementReasoning.trim(),
      keywords: Array.isArray(raw.keywords) ? raw.keywords.map((k) => String(k).trim()) : [],
      cues: aligned.cues,
      alignedToWordBoundary: aligned.alignedToWordBoundary,
      alignedToSceneBoundary: aligned.alignedToSceneBoundary,
    });
  }

  // Deduplicate overlapping moments and rank deterministically
  const deduplicated = deduplicateCandidates(alignedClips);

  // Take the top targetCount candidates and assign canonical IDs
  return deduplicated.slice(0, targetCount).map((clip, index) => ({
    ...clip,
    id: `clip-${index + 1}`,
  }));
}
