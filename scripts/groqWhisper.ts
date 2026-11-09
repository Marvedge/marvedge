import OpenAI from "openai";
import type {
  SubtitleCue,
  SubtitleWord,
  WhisperSegment,
  WhisperTranscript,
  WhisperVerboseJsonResponse,
} from "../app/lib/subtitles/index";

export const MAX_WORD_DURATION_SECONDS = 1.8;
export const MIN_WORD_DURATION_SECONDS = 0.05;
export const MIN_CUE_DURATION_SECONDS = 0.3;

export interface WordClusteringOptions {
  /** Max pause between words before splitting into a new cue (default 0.8s). */
  maxGapSeconds?: number;
  /** Max duration for a single subtitle cue (default 4.2s). */
  maxDurationSeconds?: number;
  /** Max character count before wrapping to a new cue (default 56 chars). */
  maxCharacters?: number;
}

export interface GroqWhisperOptions {
  apiKey?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  model?: string;
  clustering?: WordClusteringOptions;
}

/**
 * Strips sensitive values like API keys from error messages or strings.
 */
export function sanitizeErrorMessage(message: string, apiKey?: string): string {
  let clean = message;
  if (apiKey && apiKey.length > 5) {
    clean = clean.split(apiKey).join("[REDACTED_API_KEY]");
  }
  clean = clean.replace(/gsk_[a-zA-Z0-9_-]+/g, "[REDACTED_API_KEY]");
  clean = clean.replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED_API_KEY]");
  return clean;
}

/**
 * Partitions a flat array of Whisper words into segments according to segment text tokens,
 * guaranteeing 100% of valid words are preserved in natural lexical sequence without loss.
 */
export function partitionWordsBySegments(
  rawWords: Array<Record<string, unknown>>,
  rawSegments: Array<Record<string, unknown>>
): Array<{
  segment: Record<string, unknown>;
  words: Array<Record<string, unknown>>;
}> {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return [{ segment: { id: 0, start: 0, end: 0, text: "" }, words: rawWords }];
  }

  // If segments already have words attached, use them directly
  const allHaveWords = rawSegments.every(
    (s) => Array.isArray(s.words) && s.words.length > 0
  );
  if (allHaveWords) {
    return rawSegments.map((s) => ({
      segment: s,
      words: s.words as Array<Record<string, unknown>>,
    }));
  }

  if (!Array.isArray(rawWords) || rawWords.length === 0) {
    return rawSegments.map((s) => ({ segment: s, words: [] }));
  }

  const result: Array<{
    segment: Record<string, unknown>;
    words: Array<Record<string, unknown>>;
  }> = [];

  let wordIdx = 0;
  for (let sIdx = 0; sIdx < rawSegments.length; sIdx++) {
    const seg = rawSegments[sIdx];
    const segText = String(seg.text ?? "").trim();
    const segTokenCount = segText ? segText.split(/\s+/).filter(Boolean).length : 0;

    const segWords: Array<Record<string, unknown>> = [];

    if (sIdx === rawSegments.length - 1) {
      // Last segment absorbs all remaining words to guarantee zero dropped words
      while (wordIdx < rawWords.length) {
        segWords.push(rawWords[wordIdx++]);
      }
    } else {
      const countToTake = Math.min(segTokenCount, rawWords.length - wordIdx);
      for (let k = 0; k < countToTake; k++) {
        segWords.push(rawWords[wordIdx++]);
      }
    }

    result.push({ segment: seg, words: segWords });
  }

  return result;
}

/**
 * Repairs raw word timestamps within a segment while strictly preserving lexical word order.
 * - Enforces finite non-negative timestamps
 * - Clamps start >= previous word's start (monotonic invariant without reordering)
 * - Caps pathological word durations to MAX_WORD_DURATION_SECONDS
 * - Prevents intra-segment word overlaps
 */
export function repairSegmentWords(
  rawWords: Array<Record<string, unknown>>,
  maxWordDurationSec: number = MAX_WORD_DURATION_SECONDS,
  minWordDurationSec: number = MIN_WORD_DURATION_SECONDS
): SubtitleWord[] {
  if (!Array.isArray(rawWords) || rawWords.length === 0) return [];

  const valid: SubtitleWord[] = [];
  for (const raw of rawWords) {
    if (!raw || typeof raw !== "object") continue;
    const word = String(raw.word ?? "").trim();
    const start = Number(raw.start);
    const end = Number(raw.end);

    if (!word || !Number.isFinite(start) || !Number.isFinite(end)) continue;

    valid.push({
      word,
      start: Math.max(0, start),
      end: Math.max(start, end),
    });
  }

  if (valid.length === 0) return [];

  // Sequential monotonic repair preserving lexical order
  let prevStart = 0;
  for (let i = 0; i < valid.length; i++) {
    const cur = valid[i];
    if (i > 0 && cur.start < prevStart) {
      cur.start = prevStart;
    }
    prevStart = cur.start;

    if (cur.end < cur.start + minWordDurationSec) {
      cur.end = cur.start + minWordDurationSec;
    }

    if (cur.end - cur.start > maxWordDurationSec) {
      cur.end = cur.start + maxWordDurationSec;
    }
  }

  // Ensure consecutive words do not overlap internally
  for (let i = 0; i < valid.length - 1; i++) {
    const cur = valid[i];
    const next = valid[i + 1];
    if (cur.end > next.start) {
      cur.end = Math.max(cur.start + minWordDurationSec, next.start);
      if (next.start < cur.end) {
        next.start = cur.end;
        if (next.end < next.start + minWordDurationSec) {
          next.end = next.start + minWordDurationSec;
        }
      }
    }
  }

  return valid;
}

/**
 * Clusters words belonging to a single segment into readable SubtitleCue[] phrases
 * based on speech gaps, cue duration, and line length constraints.
 */
export function clusterSegmentWordsIntoCues(
  words: SubtitleWord[],
  options: WordClusteringOptions = {}
): SubtitleCue[] {
  if (words.length === 0) return [];

  const maxGap = options.maxGapSeconds ?? 0.8;
  const maxDur = options.maxDurationSeconds ?? 4.2;
  const maxChars = options.maxCharacters ?? 56;

  const cues: SubtitleCue[] = [];
  let cueStart = words[0].start;
  let cueEnd = words[0].end;
  let text = words[0].word;
  let currentWords: SubtitleWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const gap = w.start - cueEnd;
    const nextTextLen = `${text} ${w.word}`.trim().length;
    const candidateDur = w.end - cueStart;

    const shouldBreak = gap > maxGap || candidateDur > maxDur || nextTextLen > maxChars;

    if (shouldBreak && text) {
      cues.push({
        start: cueStart,
        end: Math.max(cueStart + MIN_CUE_DURATION_SECONDS, cueEnd),
        text: text.trim(),
        words: [...currentWords],
      });
      cueStart = w.start;
      cueEnd = w.end;
      text = w.word;
      currentWords = [w];
    } else {
      cueEnd = Math.max(cueEnd, w.end);
      text = `${text} ${w.word}`.trim();
      currentWords.push(w);
    }
  }

  if (text) {
    cues.push({
      start: cueStart,
      end: Math.max(cueStart + MIN_CUE_DURATION_SECONDS, cueEnd),
      text: text.trim(),
      words: [...currentWords],
    });
  }

  return cues;
}

/**
 * Enforces the strict sequential cue invariant: cue[i].end <= cue[i+1].start across all cues.
 * Completely eliminates subtitle collisions and overlapping dialogue events.
 */
export function preventCueCollisions(cues: SubtitleCue[]): SubtitleCue[] {
  if (cues.length <= 1) return cues;

  for (let i = 0; i < cues.length - 1; i++) {
    const cur = cues[i];
    const next = cues[i + 1];

    if (cur.end > next.start) {
      if (next.start > cur.start + MIN_CUE_DURATION_SECONDS) {
        cur.end = next.start;
      } else {
        cur.end = cur.start + MIN_CUE_DURATION_SECONDS;
        next.start = cur.end;
        if (next.end < next.start + MIN_CUE_DURATION_SECONDS) {
          next.end = next.start + MIN_CUE_DURATION_SECONDS;
        }
      }

      // Clamp constituent words within cur to not exceed cur.end
      if (cur.words && cur.words.length > 0) {
        for (const w of cur.words) {
          if (w.end > cur.end) {
            w.end = Math.max(w.start + MIN_WORD_DURATION_SECONDS, cur.end);
          }
          if (w.start >= cur.end) {
            w.start = Math.max(cur.start, cur.end - MIN_WORD_DURATION_SECONDS);
            w.end = cur.end;
          }
        }
      }

      // Adjust constituent words within next to not precede next.start
      if (next.words && next.words.length > 0) {
        for (const w of next.words) {
          if (w.start < next.start) {
            w.start = next.start;
            if (w.end <= w.start) {
              w.end = w.start + MIN_WORD_DURATION_SECONDS;
            }
          }
        }
      }
    }
  }

  return cues.filter((c) => c.text.length > 0 && c.end > c.start);
}

/**
 * Normalizes and adapts Groq Whisper response:
 * - Preserves natural lexical word order (no global start-timestamp sorting)
 * - Partitions words by segment boundaries
 * - Repairs timestamps monotonically per segment
 * - Caps pathological word durations at MAX_WORD_DURATION_SECONDS
 * - Prevents cue collisions: cue[i].end <= cue[i+1].start
 * - Preserves 100% of valid words returned by Groq
 */
export function adaptGroqWhisperResponse(
  raw: unknown,
  options: WordClusteringOptions = {}
): {
  transcript: WhisperTranscript;
  cues: SubtitleCue[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Groq Whisper response: expected an object");
  }

  const res = raw as Record<string, unknown>;
  const text = String(res.text ?? "").trim();
  const rawWords = Array.isArray(res.words) ? (res.words as Array<Record<string, unknown>>) : [];
  const rawSegments = Array.isArray(res.segments) ? (res.segments as Array<Record<string, unknown>>) : [];

  // Partition words across segment boundaries
  const partitioned = partitionWordsBySegments(rawWords, rawSegments);

  const allRepairedWords: SubtitleWord[] = [];
  const rawCues: SubtitleCue[] = [];

  for (const part of partitioned) {
    const repaired = repairSegmentWords(part.words);
    if (repaired.length > 0) {
      allRepairedWords.push(...repaired);
      const segCues = clusterSegmentWordsIntoCues(repaired, options);
      rawCues.push(...segCues);
    } else {
      // Fallback if segment has text but no words
      const segText = String(part.segment.text ?? "").trim();
      const segStart = Number(part.segment.start);
      const segEnd = Number(part.segment.end);
      if (segText && Number.isFinite(segStart) && Number.isFinite(segEnd) && segEnd > segStart) {
        rawCues.push({
          start: Math.max(0, segStart),
          end: Math.max(segStart + MIN_CUE_DURATION_SECONDS, segEnd),
          text: segText,
        });
      }
    }
  }

  // Enforce sequential cue collision prevention across the entire timeline
  const cues = preventCueCollisions(rawCues);

  const segments: WhisperSegment[] = rawSegments.map((s, idx) => ({
    id: typeof s.id === "number" ? s.id : idx,
    seek: typeof s.seek === "number" ? s.seek : 0,
    start: Number(s.start ?? 0),
    end: Number(s.end ?? 0),
    text: String(s.text ?? "").trim(),
  }));

  const transcript: WhisperTranscript = {
    text,
    duration: typeof res.duration === "number" ? res.duration : undefined,
    language: typeof res.language === "string" ? res.language : undefined,
    words: allRepairedWords,
    segments,
  };

  return { transcript, cues };
}

/**
 * Transcribes audio using Groq's OpenAI-compatible Whisper API.
 * Uses whisper-large-v3-turbo with verbose_json and word-level timestamps.
 */
export async function transcribeAudioWithGroq(
  audioFile: any,
  options: GroqWhisperOptions = {}
): Promise<{
  transcript: WhisperTranscript;
  cues: SubtitleCue[];
}> {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "Missing GROQ_API_KEY.\n" +
      "Add it to .env.local or provide it through the environment."
    );
  }

  const groq = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const model = options.model || "whisper-large-v3-turbo";

  try {
    const response = await groq.audio.transcriptions.create({
      file: audioFile,
      model,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      ...(options.language ? { language: options.language } : {}),
      ...(options.prompt ? { prompt: options.prompt } : {}),
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
    });

    return adaptGroqWhisperResponse(response, options.clustering);
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = sanitizeErrorMessage(rawMsg, apiKey);
    const status = (err as { status?: number })?.status;

    if (status === 401 || status === 403 || /unauthorized|auth|invalid.*key/i.test(sanitizedMsg)) {
      throw new Error(
        `Groq authentication error (${status || 401}): Invalid or unauthorized GROQ_API_KEY.\n` +
        `Please verify the key in .env.local or your environment.`
      );
    }

    if (status === 429 || /rate.*limit|quota|too many requests/i.test(sanitizedMsg)) {
      throw new Error(
        `Groq rate limit exceeded (429).\n` +
        `Details: ${sanitizedMsg}\n` +
        `Please wait before retrying or check your Groq usage limit.`
      );
    }

    if (status === 400 || /audio.*corrupt|unsupported.*format|invalid.*file/i.test(sanitizedMsg)) {
      throw new Error(
        `Groq transcription rejected audio input (400).\n` +
        `Details: ${sanitizedMsg}`
      );
    }

    throw new Error(`Groq Whisper transcription failed: ${sanitizedMsg}`);
  }
}
