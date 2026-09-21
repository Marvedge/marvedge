// Whisper transcription client and word-level timestamp normalizer (Task-00038).
//
// Responsibilities:
// 1. Calls OpenAI Whisper API with verbose_json and word-level timestamps.
// 2. Normalizes Whisper word tokens into the repository's standard SubtitleCue format.
// 3. Preserves exact word-level timing on each SubtitleCue (cue.words) for Task-00041
//    and future interactive/karaoke features.
// 4. Clusters words into flicker-free, readable phrase-level subtitle cues using
//    the same proven timing heuristics as Deepgram (gap > 0.8s, dur > 4.2s, len > 56).

import OpenAI from "openai";
import type {
  SubtitleCue,
  SubtitleWord,
  WhisperSegment,
  WhisperTranscript,
  WhisperVerboseJsonResponse,
  WhisperWord,
} from "./types";

export interface WordClusteringOptions {
  /** Max pause between words before splitting into a new cue (default 0.8s). */
  maxGapSeconds?: number;
  /** Max duration for a single subtitle cue (default 4.2s). */
  maxDurationSeconds?: number;
  /** Max character count before wrapping to a new cue (default 56 chars). */
  maxCharacters?: number;
}

export interface WhisperTranscriptionOptions {
  apiKey?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  clustering?: WordClusteringOptions;
}

/**
 * Normalizes raw words from Whisper into sorted, valid SubtitleWord objects.
 */
export function normalizeWhisperWords(rawWords: readonly unknown[]): SubtitleWord[] {
  if (!Array.isArray(rawWords)) return [];

  const out: SubtitleWord[] = [];
  for (const raw of rawWords) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const word = String(item.word ?? "").trim();
    const start = Number(item.start);
    const end = Number(item.end);

    if (!word || !Number.isFinite(start) || !Number.isFinite(end)) continue;

    out.push({
      word,
      start: Math.max(0, start),
      end: Math.max(start + 0.01, end),
    });
  }

  return out.sort((a, b) => a.start - b.start);
}

/**
 * Clusters word-level timestamps into readable SubtitleCue phrases.
 *
 * Adheres to the proven timing heuristics from cloudrun-worker cuesFromDeepgramWords:
 * - Breaks on speech pause: gap > 0.8s
 * - Breaks on phrase duration: cueDur > 4.2s
 * - Breaks on line length: nextTextLen > 56 characters
 *
 * Each generated cue stores its constituent words in `cue.words`, preserving
 * exact word-level timing for downstream consumers (Task-00041, karaoke, interactive transcripts).
 */
export function cuesFromWhisperWords(
  words: readonly WhisperWord[],
  options: WordClusteringOptions = {}
): SubtitleCue[] {
  const normalized = normalizeWhisperWords(words);
  if (normalized.length === 0) return [];

  const maxGap = options.maxGapSeconds ?? 0.8;
  const maxDur = options.maxDurationSeconds ?? 4.2;
  const maxChars = options.maxCharacters ?? 56;

  const cues: SubtitleCue[] = [];
  let cueStart = normalized[0].start;
  let cueEnd = Math.max(normalized[0].end, cueStart + 0.3);
  let text = normalized[0].word;
  let currentWords: SubtitleWord[] = [normalized[0]];

  for (let i = 1; i < normalized.length; i++) {
    const w = normalized[i];
    const wStart = w.start;
    const wEnd = Math.max(w.end, wStart + 0.25);
    const gap = wStart - cueEnd;
    const nextTextLen = `${text} ${w.word}`.trim().length;
    const cueDur = cueEnd - cueStart;

    const shouldBreak = gap > maxGap || cueDur > maxDur || nextTextLen > maxChars;

    if (shouldBreak && text) {
      cues.push({
        start: Math.max(0, cueStart),
        end: Math.max(cueStart + 0.04, cueEnd),
        text: text.trim(),
        words: [...currentWords],
      });
      cueStart = wStart;
      cueEnd = wEnd;
      text = w.word;
      currentWords = [w];
    } else {
      cueEnd = Math.max(cueEnd, wEnd);
      text = `${text} ${w.word}`.trim();
      currentWords.push(w);
    }
  }

  if (text) {
    cues.push({
      start: Math.max(0, cueStart),
      end: Math.max(cueStart + 0.04, cueEnd),
      text: text.trim(),
      words: [...currentWords],
    });
  }

  return cues.filter((c) => c.text.length > 0 && c.end - c.start > 0.01);
}

/**
 * Fallback parser when Whisper response only contains segment-level timestamps.
 */
export function cuesFromWhisperSegments(segments: readonly WhisperSegment[]): SubtitleCue[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const cues: SubtitleCue[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const text = String(seg.text ?? "").trim();
    const start = Number(seg.start);
    const end = Number(seg.end);

    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    cues.push({
      start: Math.max(0, start),
      end: Math.max(start + 0.04, end),
      text,
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Normalizes any Whisper verbose_json API response into a structured WhisperTranscript
 * and clustered SubtitleCue array with preserved word timestamps.
 */
export function normalizeWhisperResponse(
  raw: unknown,
  options: WordClusteringOptions = {}
): {
  transcript: WhisperTranscript;
  cues: SubtitleCue[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Whisper response: expected an object");
  }

  const res = raw as WhisperVerboseJsonResponse;
  const text = String(res.text ?? "").trim();
  const rawWords = Array.isArray(res.words) ? res.words : [];
  const rawSegments = Array.isArray(res.segments) ? res.segments : [];

  const words = normalizeWhisperWords(rawWords);
  const segments: WhisperSegment[] = rawSegments.map((s) => ({
    id: s.id,
    seek: s.seek,
    start: Number(s.start || 0),
    end: Number(s.end || 0),
    text: String(s.text || "").trim(),
  }));

  let cues: SubtitleCue[] = [];
  if (words.length > 0) {
    cues = cuesFromWhisperWords(words, options);
  } else if (segments.length > 0) {
    cues = cuesFromWhisperSegments(segments);
  } else if (text) {
    cues = [{ start: 0, end: Math.max(1, Number(res.duration) || 3), text }];
  }

  const transcript: WhisperTranscript = {
    text,
    language: res.language,
    duration: typeof res.duration === "number" ? res.duration : undefined,
    words,
    segments,
  };

  return { transcript, cues };
}

/**
 * Transcribes an audio file or stream using OpenAI's Whisper API with word-level timestamps.
 * Returns both the complete transcript (with words and segments) and clustered SubtitleCue array.
 */
export async function transcribeAudioWithWhisper(
  audioFile: any,
  options: WhisperTranscriptionOptions = {}
): Promise<{
  transcript: WhisperTranscript;
  cues: SubtitleCue[];
}> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for Whisper transcription");
  }

  const openai = new OpenAI({ apiKey });

  const params: OpenAI.Audio.Transcriptions.TranscriptionCreateParams = {
    file: audioFile,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
    ...(options.language ? { language: options.language } : {}),
    ...(options.prompt ? { prompt: options.prompt } : {}),
    ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
  };

  const response = await openai.audio.transcriptions.create(params);

  return normalizeWhisperResponse(response, options.clustering);
}
