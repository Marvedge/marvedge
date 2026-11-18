import fs from "fs";
import path from "path";
import { normalizeWhisperResponse } from "../app/lib/subtitles/index";
import { writeAssFile } from "../app/lib/subtitles/server";
import type { WhisperVerboseJsonResponse } from "../app/lib/subtitles/types";

const outDir = path.resolve(process.cwd(), "investor-demo", "demo-assets");
fs.mkdirSync(outDir, { recursive: true });

export const investorDemoEnglishNarrationFixture: WhisperVerboseJsonResponse = {
  task: "transcribe",
  language: "english",
  duration: 16.0,
  text: "Marvedge turns wide clips into shorts. Auto-framing tracks the main visual action. Blur-pad fit preserves full widescreen context. Export vertical videos in one workflow.",
  segments: [
    {
      id: 0,
      seek: 0,
      start: 0.25,
      end: 3.3,
      text: "Marvedge turns wide clips into shorts.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
    {
      id: 1,
      seek: 330,
      start: 4.25,
      end: 7.35,
      text: "Auto-framing tracks the main visual action.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
    {
      id: 2,
      seek: 735,
      start: 8.3,
      end: 11.4,
      text: "Blur-pad fit preserves full widescreen context.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
    {
      id: 3,
      seek: 1140,
      start: 12.35,
      end: 15.55,
      text: "Export vertical videos in one workflow.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
  ],
  words: [
    // Cue 1 (0.25s -> 3.30s, 6 words)
    { word: "Marvedge", start: 0.25, end: 0.8 },
    { word: "turns", start: 0.86, end: 1.3 },
    { word: "wide", start: 1.36, end: 1.76 },
    { word: "clips", start: 1.82, end: 2.26 },
    { word: "into", start: 2.32, end: 2.68 },
    { word: "shorts.", start: 2.74, end: 3.3 },

    // Cue 2 (4.25s -> 7.35s, 6 words)
    { word: "Auto-framing", start: 4.25, end: 4.85 },
    { word: "tracks", start: 4.91, end: 5.32 },
    { word: "the", start: 5.38, end: 5.66 },
    { word: "main", start: 5.72, end: 6.14 },
    { word: "visual", start: 6.2, end: 6.68 },
    { word: "action.", start: 6.74, end: 7.35 },

    // Cue 3 (8.30s -> 11.40s, 6 words)
    { word: "Blur-pad", start: 8.3, end: 8.75 },
    { word: "fit", start: 8.81, end: 9.38 },
    { word: "preserves", start: 9.44, end: 10.02 },
    { word: "full", start: 10.08, end: 10.42 },
    { word: "widescreen", start: 10.48, end: 10.92 },
    { word: "context.", start: 10.98, end: 11.4 },

    // Cue 4 (12.35s -> 15.55s, 6 words)
    { word: "Export", start: 12.35, end: 12.85 },
    { word: "vertical", start: 12.91, end: 13.45 },
    { word: "videos", start: 13.51, end: 14.0 },
    { word: "in", start: 14.06, end: 14.32 },
    { word: "one", start: 14.38, end: 14.75 },
    { word: "workflow.", start: 14.81, end: 15.55 },
  ],
};

export const investorDemoMultilingualPreviewFixture: WhisperVerboseJsonResponse = {
  task: "transcribe",
  language: "multilingual",
  duration: 16.0,
  text: "[EN] Marvedge turns wide clips into shorts. [ES] El encuadre centra cada sujeto clave. [FR] Exportez vos videos en un clic.",
  segments: [
    {
      id: 0,
      seek: 0,
      start: 0.3,
      end: 4.5,
      text: "[EN] Marvedge turns wide clips into shorts.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
    {
      id: 1,
      seek: 450,
      start: 5.5,
      end: 10.0,
      text: "[ES] El encuadre centra cada sujeto clave.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
    {
      id: 2,
      seek: 1000,
      start: 11.0,
      end: 15.5,
      text: "[FR] Exportez vos videos en un clic.",
      tokens: [],
      temperature: 0,
      avg_logprob: -0.1,
      compression_ratio: 1.2,
      no_speech_prob: 0.001,
    },
  ],
  words: [
    // English Track (0.30s -> 4.50s)
    { word: "[EN]", start: 0.3, end: 0.7 },
    { word: "Marvedge", start: 0.76, end: 1.34 },
    { word: "turns", start: 1.4, end: 1.9 },
    { word: "wide", start: 1.96, end: 2.45 },
    { word: "clips", start: 2.51, end: 3.05 },
    { word: "into", start: 3.11, end: 3.6 },
    { word: "shorts.", start: 3.66, end: 4.5 },

    // Spanish Track (5.50s -> 10.00s)
    { word: "[ES]", start: 5.5, end: 5.9 },
    { word: "El", start: 5.96, end: 6.3 },
    { word: "encuadre", start: 6.36, end: 7.05 },
    { word: "centra", start: 7.11, end: 7.75 },
    { word: "cada", start: 7.81, end: 8.35 },
    { word: "sujeto", start: 8.41, end: 9.1 },
    { word: "clave.", start: 9.16, end: 10.0 },

    // French Track (11.00s -> 15.50s)
    { word: "[FR]", start: 11.0, end: 11.4 },
    { word: "Exportez", start: 11.46, end: 12.15 },
    { word: "vos", start: 12.21, end: 12.68 },
    { word: "videos", start: 12.74, end: 13.45 },
    { word: "en", start: 13.51, end: 13.92 },
    { word: "un", start: 13.98, end: 14.45 },
    { word: "clic.", start: 14.51, end: 15.5 },
  ],
};

function tunePortraitAssStyle(assPath: string) {
  let content = fs.readFileSync(assPath, "utf8");
  // Enable smart 2-line wrapping (WrapStyle: 0) so portrait 720px width never clips horizontally
  content = content.replace("WrapStyle: 2", "WrapStyle: 0");
  // Set portrait-optimized font size (38pt bold), gold active word highlight (&H0000EAFF), crisp white secondary (&H00FFFFFF), deep navy outline
  content = content.replace(
    /^Style: Default,.*$/m,
    "Style: Default,Arial,38,&H0000EAFF,&H00FFFFFF,&H000F172A,&H960F172A,-1,0,0,0,100,100,0.5,0,1,4,2,2,48,48,110,1"
  );
  fs.writeFileSync(assPath, content, "utf8");
}

function main() {
  const enJsonPath = path.join(outDir, "demo2_narration_cues.json");
  fs.writeFileSync(
    enJsonPath,
    JSON.stringify(investorDemoEnglishNarrationFixture, null, 2),
    "utf8"
  );

  const mlJsonPath = path.join(outDir, "demo3_multilingual_cues.json");
  fs.writeFileSync(
    mlJsonPath,
    JSON.stringify(investorDemoMultilingualPreviewFixture, null, 2),
    "utf8"
  );

  const enNorm = normalizeWhisperResponse(investorDemoEnglishNarrationFixture);
  const enAssPath = writeAssFile(
    outDir,
    enNorm.cues,
    720,
    1280,
    undefined,
    null,
    "demo2_kinetic_karaoke.ass",
    { karaoke: true }
  );
  tunePortraitAssStyle(enAssPath);

  const mlNorm = normalizeWhisperResponse(investorDemoMultilingualPreviewFixture);
  const mlAssPath = writeAssFile(
    outDir,
    mlNorm.cues,
    720,
    1280,
    undefined,
    null,
    "demo3_multilingual_preview.ass",
    { karaoke: true }
  );
  tunePortraitAssStyle(mlAssPath);

  console.log(
    "Generated portrait-tuned ASS files successfully:",
    enNorm.cues.length,
    "cues,",
    enNorm.transcript.words.length,
    "words."
  );
}

main();
