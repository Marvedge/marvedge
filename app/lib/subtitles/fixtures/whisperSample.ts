// Realistic synthetic Whisper verbose_json API response fixtures for Task-00067 validation.
//
// These fixtures mimic the OpenAI Whisper API response_format="verbose_json" payload
// with timestamp_granularities=["word", "segment"].

import type { WhisperVerboseJsonResponse } from "../types";

/**
 * Realistic multi-phrase, multi-segment transcription fixture.
 * Contains 35 words across 4 segments with natural pauses (>0.8s), varied word
 * durations, punctuation, and floating-point timestamps.
 */
export const realisticWhisperVerboseResponse: WhisperVerboseJsonResponse = {
  task: "transcribe",
  language: "english",
  duration: 19.5,
  text: "Welcome everyone to this product demonstration. Today, we are showcasing our automated video reframing technology. Notice how smoothly the subject remains centered in every aspect ratio. Finally, let us inspect the exported output with confidence.",
  segments: [
    {
      id: 0,
      seek: 0,
      start: 0.12,
      end: 3.05,
      text: "Welcome everyone to this product demonstration.",
      tokens: [50364, 7085, 2465, 281, 341, 1323, 14032, 13, 50510],
      temperature: 0,
      avg_logprob: -0.18,
      compression_ratio: 1.25,
      no_speech_prob: 0.002,
    },
    {
      id: 1,
      seek: 305,
      start: 4.1,
      end: 8.35,
      text: "Today, we are showcasing our automated video reframing technology.",
      tokens: [50564, 2692, 11, 321, 366, 38167, 527, 18047, 2008, 1435, 1269, 3037, 13, 50780],
      temperature: 0,
      avg_logprob: -0.15,
      compression_ratio: 1.32,
      no_speech_prob: 0.001,
    },
    {
      id: 2,
      seek: 835,
      start: 9.3,
      end: 14.15,
      text: "Notice how smoothly the subject remains centered in every aspect ratio.",
      tokens: [50828, 18569, 577, 24536, 264, 2904, 6940, 18274, 294, 633, 4426, 4529, 13, 51070],
      temperature: 0,
      avg_logprob: -0.21,
      compression_ratio: 1.28,
      no_speech_prob: 0.003,
    },
    {
      id: 3,
      seek: 1415,
      start: 15.2,
      end: 19.3,
      text: "Finally, let us inspect the exported output with confidence.",
      tokens: [51124, 6343, 11, 718, 505, 15024, 264, 27464, 4070, 365, 5456, 13, 51330],
      temperature: 0,
      avg_logprob: -0.19,
      compression_ratio: 1.22,
      no_speech_prob: 0.002,
    },
  ],
  words: [
    // Segment 1 (0.12s -> 3.05s)
    { word: "Welcome", start: 0.12, end: 0.58 },
    { word: "everyone", start: 0.64, end: 1.15 },
    { word: "to", start: 1.2, end: 1.34 },
    { word: "this", start: 1.38, end: 1.62 },
    { word: "product", start: 1.68, end: 2.14 },
    { word: "demonstration.", start: 2.2, end: 3.05 },
    // 1.05s pause between 3.05s and 4.10s (triggers cue boundary)

    // Segment 2 (4.10s -> 8.35s)
    { word: "Today,", start: 4.1, end: 4.56 },
    { word: "we", start: 4.62, end: 4.78 },
    { word: "are", start: 4.82, end: 4.98 },
    { word: "showcasing", start: 5.04, end: 5.68 },
    { word: "our", start: 5.74, end: 5.92 },
    { word: "automated", start: 5.98, end: 6.55 },
    { word: "video", start: 6.6, end: 6.95 },
    { word: "reframing", start: 7.02, end: 7.58 },
    { word: "technology.", start: 7.64, end: 8.35 },
    // 0.95s pause between 8.35s and 9.30s (triggers cue boundary)

    // Segment 3 (9.30s -> 14.15s)
    { word: "Notice", start: 9.3, end: 9.72 },
    { word: "how", start: 9.76, end: 9.94 },
    { word: "smoothly", start: 10.02, end: 10.55 },
    { word: "the", start: 10.6, end: 10.74 },
    { word: "subject", start: 10.8, end: 11.28 },
    { word: "remains", start: 11.34, end: 11.82 },
    { word: "centered", start: 11.88, end: 12.38 },
    { word: "in", start: 12.44, end: 12.58 },
    { word: "every", start: 12.64, end: 12.98 },
    { word: "aspect", start: 13.04, end: 13.48 },
    { word: "ratio.", start: 13.54, end: 14.15 },
    // 1.05s pause between 14.15s and 15.20s (triggers cue boundary)

    // Segment 4 (15.20s -> 19.30s)
    { word: "Finally,", start: 15.2, end: 15.75 },
    { word: "let", start: 15.82, end: 16.04 },
    { word: "us", start: 16.1, end: 16.28 },
    { word: "inspect", start: 16.34, end: 16.85 },
    { word: "the", start: 16.9, end: 17.06 },
    { word: "exported", start: 17.12, end: 17.72 },
    { word: "output", start: 17.78, end: 18.25 },
    { word: "with", start: 18.3, end: 18.48 },
    { word: "confidence.", start: 18.54, end: 19.3 },
  ],
};

/**
 * Realistic segment-only Whisper fixture without word timestamps.
 * Simulates speech recognition output when word timestamps were disabled or unavailable.
 */
export const segmentOnlyWhisperResponse: WhisperVerboseJsonResponse = {
  task: "transcribe",
  language: "english",
  duration: 10.0,
  text: "Overview of video reframing technology. Automatic subject detection and tracking.",
  segments: [
    {
      id: 0,
      start: 0.25,
      end: 4.5,
      text: "Overview of video reframing technology.",
    },
    {
      id: 1,
      start: 5.2,
      end: 9.8,
      text: "Automatic subject detection and tracking.",
    },
  ],
  words: [],
};

/**
 * Realistic synthetic Arabic Whisper response fixture with word timestamps for RTL testing.
 */
export const arabicWhisperResponse: WhisperVerboseJsonResponse = {
  task: "transcribe",
  language: "arabic",
  duration: 7.5,
  text: "مرحبا بكم في هذا العرض التوضيحي. اليوم سنشاهد إعادة تأطير الفيديو.",
  segments: [
    {
      id: 0,
      start: 0.15,
      end: 3.1,
      text: "مرحبا بكم في هذا العرض التوضيحي.",
    },
    {
      id: 1,
      start: 4.0,
      end: 7.1,
      text: "اليوم سنشاهد إعادة تأطير الفيديو.",
    },
  ],
  words: [
    { word: "مرحبا", start: 0.15, end: 0.75 },
    { word: "بكم", start: 0.8, end: 1.2 },
    { word: "في", start: 1.25, end: 1.45 },
    { word: "هذا", start: 1.5, end: 1.8 },
    { word: "العرض", start: 1.85, end: 2.35 },
    { word: "التوضيحي.", start: 2.4, end: 3.1 },
    // 0.9s pause between 3.1s and 4.0s
    { word: "اليوم", start: 4.0, end: 4.5 },
    { word: "سنشاهد", start: 4.55, end: 5.25 },
    { word: "إعادة", start: 5.3, end: 5.75 },
    { word: "تأطير", start: 5.8, end: 6.3 },
    { word: "الفيديو.", start: 6.35, end: 7.1 },
  ],
};
