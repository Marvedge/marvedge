"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createHash, randomUUID } = require("node:crypto");
const { createReadStream } = require("node:fs");

const express = require("express");
const { Storage } = require("@google-cloud/storage");
const { Firestore, FieldValue } = require("@google-cloud/firestore");
const { renderChunkFromRecipe } = require("./render");

const storage = new Storage();
const firestore = new Firestore();

const PORT = Number(process.env.PORT || 8080);
const RAW_BUCKET = process.env.RAW_BUCKET || "";
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET || "";
const RAW_PREFIX = process.env.RAW_PREFIX || "";
const PROCESSED_PREFIX = process.env.PROCESSED_PREFIX || "";
const RECIPES_COLLECTION = process.env.RECIPES_COLLECTION || "recipes";
const CHUNKS_COLLECTION = process.env.CHUNKS_COLLECTION || "chunks";
const CHUNK_DURATION_SECS = Number(process.env.CHUNK_DURATION_SECS || 10);
// GCS object prefix for AVS voiceover MP3s (in the processed bucket).
const AVS_VOICEOVER_PREFIX = process.env.AVS_VOICEOVER_PREFIX || "avs-voiceover/";
// GCS object prefix for AVS time-aligned MP4s (in the processed bucket).
const AVS_ALIGNED_PREFIX = process.env.AVS_ALIGNED_PREFIX || "avs-aligned/";
// Frame rate the aligned segments are normalized to so they concat with -c copy.
const AVS_SYNC_FPS = Number(process.env.AVS_SYNC_FPS || 30);
// GCS object prefix for WTM webcam-bubble composited MP4s (processed bucket).
const WTM_COMPOSITE_PREFIX = process.env.WTM_COMPOSITE_PREFIX || "wtm-composite/";
// BOTH compositor inputs are normalized to this frame rate first: a 60 FPS
// screen capture overlaid with a 24 FPS webcam otherwise drifts apart over a
// long recording (PRD §6.4 edge case).
const WTM_COMPOSITE_FPS = Number(process.env.WTM_COMPOSITE_FPS || 30);
// Bubble inset from its corner, in px at 1080p and scaled with the source
// height — mirrors the watermark margin logic in render.js.
const WTM_BUBBLE_MARGIN_PX = 25;
// Bubble diameter as a fraction of the source height. Mirrors
// DEFAULT_WEBCAM.size / WTM_WEBCAM_SIZE_MIN / MAX in app/lib/wtm/webcam.ts.
const WTM_BUBBLE_SIZE_MIN = 0.05;
const WTM_BUBBLE_SIZE_MAX = 0.6;
const WTM_BUBBLE_SIZE_DEFAULT = 0.28;
// Corners an overlay can be anchored to (same set as render.js / WtmPosition).
const WTM_POSITIONS = ["br", "bl", "tr", "tl"];
// Deepgram Aura per-request text cap. The API rejects very long text, so we
// split a step's narration at sentence boundaries to stay comfortably under it.
const AURA_CHAR_LIMIT = Number(process.env.AURA_CHAR_LIMIT || 1800);
// Deepgram Aura English voices exposed by the panel; anything else falls back.
const AVS_DEFAULT_VOICE = "aura-2-thalia-en";
const AVS_ALLOWED_VOICES = new Set([
  "aura-2-thalia-en",
  "aura-2-andromeda-en",
  "aura-2-helena-en",
  "aura-2-apollo-en",
  "aura-2-arcas-en",
]);
// --- HLS packaging (OVL PR 8) ----------------------------------------------
// R2 object prefix for packaged renditions. Mirrors HLS_PREFIX in
// app/lib/overlays/hls.ts, which builds the same keys on the Next side; the two
// cannot share a module because this is a standalone CommonJS service.
const HLS_PREFIX = process.env.HLS_PREFIX || "hls/";
// The rendition ladder, highest first. 1080p is the top rung because the export
// pipeline never produces more, and a rung above the source is only ever an
// upscale that costs bitrate and adds nothing — ladderForSource() drops those.
const HLS_LADDER = [
  { height: 1080, videoKbps: 5000, maxrateKbps: 5350, bufsizeKbps: 7500, audioKbps: 192 },
  { height: 720, videoKbps: 2800, maxrateKbps: 3000, bufsizeKbps: 4200, audioKbps: 128 },
  { height: 480, videoKbps: 1400, maxrateKbps: 1500, bufsizeKbps: 2100, audioKbps: 96 },
];
// Segment length in seconds. Also the GOP length — see the keyframe comment in
// packageHlsJob(). Four is the usual compromise: shorter means more requests and
// more playlist, longer means a slower first frame and coarser ABR reactions.
const HLS_SEGMENT_SECONDS = Number(process.env.HLS_SEGMENT_SECONDS || 4);
// Frame rate every rendition is normalized to. A CONSTANT frame rate is what
// makes `-g` a fixed number of SECONDS rather than a fixed number of frames that
// means something different per rendition.
const HLS_FPS = Number(process.env.HLS_FPS || 30);

const execFileAsync = promisify(execFile);

function must(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function downloadRawChunkFromGcs({
  bucketName,
  objectName,
  destinationPath,
}) {
  await storage
    .bucket(bucketName)
    .file(objectName)
    .download({ destination: destinationPath });
}

function parseGsUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("gs://")) {
    return null;
  }
  const trimmed = uri.slice("gs://".length);
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }
  const bucket = trimmed.slice(0, slashIndex);
  const object = trimmed.slice(slashIndex + 1);
  if (!bucket || !object) {
    return null;
  }
  return { bucket, object };
}

async function downloadFromGsUri({ uri, destinationPath }) {
  const parsed = parseGsUri(uri);
  if (!parsed) {
    throw new Error(`Invalid gs:// uri: ${uri}`);
  }
  await downloadRawChunkFromGcs({
    bucketName: parsed.bucket,
    objectName: parsed.object,
    destinationPath,
  });
}

async function getSignedHttpUrlForGsUri(uri) {
  const parsed = parseGsUri(uri);
  if (!parsed) {
    throw new Error(`Invalid gs:// uri: ${uri}`);
  }
  const [signedUrl] = await storage
    .bucket(parsed.bucket)
    .file(parsed.object)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 2 * 60 * 60 * 1000,
    });
  return signedUrl;
}

async function downloadFromUrl({ url, destinationPath }) {
  // never let a job point us at internal addresses
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error("Invalid source URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Refusing to fetch non-http(s) URL");
  }
  if (isBlockedWorkerHost(parsed.hostname)) {
    throw new Error("Refusing to fetch blocked host");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source video: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, bytes);
}

/**
 * Pull the last few meaningful lines out of an ffmpeg stderr dump.
 *
 * ffmpeg writes its banner, every build flag and every stream's metadata to
 * stderr before it says what actually went wrong, and execFile puts the whole
 * thing in `err.message`. Surfacing that verbatim to a user is the same as
 * surfacing nothing. The real diagnosis is in the last line or two.
 */
function ffmpegErrorDetail(err) {
  const raw = String((err && err.stderr) || (err && err.message) || "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.startsWith("ffmpeg version") &&
        !l.startsWith("built with") &&
        !l.startsWith("configuration:") &&
        !/^lib(av|sw|post)\w*\s+\d/.test(l),
    );
  return (
    lines
      .slice(-2)
      .join(" — ")
      // The detail is shown to the user, so strip the container's own scratch
      // paths: they mean nothing to them and expose our internals for no gain.
      .replace(/\/tmp\/\S+/g, "the file")
      .slice(0, 300)
  );
}

async function extractAudioWav16kMono(inputPath, wavPath) {
  try {
    await execFileAsync("/usr/bin/ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      wavPath,
    ]);
  } catch (err) {
    // PRD §13, corrupted / incomplete uploads. This is the FIRST thing that
    // touches the actual bytes, so a truncated recording, a zero-length upload
    // or a container ffmpeg cannot demux all land here — and used to reach the
    // user as a wall of ffmpeg banner text, or as a bare "Internal Server
    // Error" once something upstream flattened it.
    const detail = ffmpegErrorDetail(err);
    console.error(`[subtitles] ffmpeg audio extract failed: ${detail}`);

    // A file with no audio stream at all is not a broken file — it is a silent
    // screen recording, which is an ordinary thing to have. Distinguished from a
    // corrupted file because the fix is completely different: "re-upload it"
    // is useless advice for a video that simply has no sound. (This is NOT the
    // same case as a video whose audio contains no speech — that one reaches
    // Deepgram, returns no cues, and surfaces as "No speech detected".)
    if (/does not contain any stream|Output file (#\d+ )?does not contain/i.test(detail)) {
      throw new Error(
        "This video has no audio track, so there is nothing to transcribe.",
      );
    }

    throw new Error(
      `This video could not be read — it may be corrupted or the upload may be incomplete. Try re-uploading it. (${detail || "ffmpeg could not decode the file"})`,
    );
  }
}

function cuesFromDeepgramWords(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const cues = [];
  let cueStart = Number(words[0].start || 0);
  let cueEnd = Number(words[0].end || cueStart + 0.3);
  let text = String(words[0].punctuated_word || words[0].word || "").trim();

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const wText = String(w.punctuated_word || w.word || "").trim();
    const wStart = Number(w.start || cueEnd);
    const wEnd = Number(w.end || wStart + 0.25);
    const gap = wStart - cueEnd;
    const nextTextLen = (text + " " + wText).trim().length;
    const cueDur = cueEnd - cueStart;
    const shouldBreak = gap > 0.8 || cueDur > 4.2 || nextTextLen > 56;

    if (shouldBreak && text) {
      cues.push({
        start: Math.max(0, cueStart),
        end: Math.max(cueStart + 0.04, cueEnd),
        text: text.trim(),
      });
      cueStart = wStart;
      cueEnd = wEnd;
      text = wText;
    } else {
      cueEnd = Math.max(cueEnd, wEnd);
      text = `${text} ${wText}`.trim();
    }
  }

  if (text) {
    cues.push({
      start: Math.max(0, cueStart),
      end: Math.max(cueStart + 0.04, cueEnd),
      text: text.trim(),
    });
  }
  return cues.filter((c) => c.text.length > 0 && c.end - c.start > 0.01);
}

// SUB PR 5: not every language is on the same Deepgram model.
//
// nova-2 — what this worker has always sent, and still the default for every
// language that has always worked. Its request is unchanged.
//
// nova-3 — used ONLY for languages nova-2 does not cover. Arabic is the one such
// language among the seven the product offers: it is absent from nova-2's
// language list, and nova-3 added it as its first right-to-left language across
// 17 regional variants.
//
// This mirrors `sttModelFor()` in app/lib/subtitles/languages.ts, which is the
// source of truth and carries the full reasoning; that module cannot be imported
// here (this worker is a standalone package). Keep the two in step — the table
// there is pinned by app/lib/subtitles/languages.test.ts.
const DEEPGRAM_DEFAULT_MODEL = "nova-2";
const DEEPGRAM_MODEL_BY_LANGUAGE = {
  ar: "nova-3",
};

function deepgramModelFor(language) {
  const code = String(language || "")
    .trim()
    .toLowerCase();
  if (!code || code === "multi") {
    return DEEPGRAM_DEFAULT_MODEL;
  }
  // Match the base language so a regional variant (ar-EG) lands on the same
  // model as its base (ar).
  const base = code.split("-")[0];
  return DEEPGRAM_MODEL_BY_LANGUAGE[base] || DEEPGRAM_DEFAULT_MODEL;
}

async function transcribeWithDeepgram(wavPath, language = "multi") {
  const apiKey = (process.env.DEEPGRAM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY in Cloud Run environment");
  }

  const params = new URLSearchParams({
    model: deepgramModelFor(language),
    punctuate: "true",
    smart_format: "true",
  });
  if (language && language !== "multi") {
    params.set("language", language);
  } else {
    // Auto-detect stays on nova-2 with detect_language, exactly as before.
    params.set("detect_language", "true");
  }

  const audio = await fs.readFile(wavPath);
  const resp = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: audio,
    },
  );

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Deepgram failed (${resp.status}): ${typeof body === "object" ? JSON.stringify(body) : String(body)}`,
    );
  }

  const words = body?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  const cues = cuesFromDeepgramWords(words);
  if (cues.length > 0) return cues;

  const transcript = String(
    body?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "",
  ).trim();
  if (!transcript) return [];
  return [{ start: 0, end: 3, text: transcript }];
}

async function processSubtitlesJob({ videoUrl, language }) {
  if (!videoUrl) throw new Error("videoUrl is required");
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "marvedge-subtitles-"),
  );
  const inputPath = path.join(tempDir, "input.webm");
  const wavPath = path.join(tempDir, "audio.wav");
  const startedAt = Date.now();
  try {
    const dlStart = Date.now();
    if (typeof videoUrl === "string" && videoUrl.startsWith("gs://")) {
      await downloadFromGsUri({
        uri: String(videoUrl),
        destinationPath: inputPath,
      });
    } else {
      await downloadFromUrl({
        url: String(videoUrl),
        destinationPath: inputPath,
      });
    }
    const dlMs = Date.now() - dlStart;

    const exStart = Date.now();
    await extractAudioWav16kMono(inputPath, wavPath);
    const extractMs = Date.now() - exStart;

    const dgStart = Date.now();
    const cues = await transcribeWithDeepgram(
      wavPath,
      String(language || "multi"),
    );
    const deepgramMs = Date.now() - dgStart;

    // PRD §7 sets the target PER UNIT OF VIDEO ("< 60s for a 10-minute video"),
    // so the elapsed times alone cannot be checked against it — you need to know
    // how long the input was. Derived from the WAV rather than probed: the
    // extract above pins the format at 16 kHz mono PCM s16le, so the byte count
    // divided by 32000 IS the duration, exactly, for the cost of one stat.
    let durationS = 0;
    let sourceBytes = 0;
    try {
      const [wavStat, srcStat] = await Promise.all([
        fs.stat(wavPath),
        fs.stat(inputPath),
      ]);
      durationS = Math.max(0, (wavStat.size - 44) / 32000);
      sourceBytes = srcStat.size;
    } catch {
      // Instrumentation must never fail a job that has already produced cues.
    }
    const totalMs = Date.now() - startedAt;
    // `ratio` is the number to compare against the target: seconds of wall clock
    // per second of video. The PRD's "10 minutes in under 60s" is ratio < 0.1.
    const ratio = durationS > 0 ? (totalMs / 1000 / durationS).toFixed(3) : "n/a";

    console.log(
      `[subtitles] Timing download_ms=${dlMs} extract_ms=${extractMs} deepgram_ms=${deepgramMs} total_ms=${totalMs} cues=${cues.length} duration_s=${durationS.toFixed(1)} source_bytes=${sourceBytes} ratio=${ratio}`,
    );
    return cues;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function uploadProcessedChunkToGcs({
  bucketName,
  objectName,
  sourcePath,
}) {
  await storage.bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType: "video/mp4",
    resumable: false,
  });
}

// --- AVS voiceover (Deepgram Aura TTS) -------------------------------------

/** Clamp an arbitrary voice id to an allowed Aura model, defaulting safely. */
function normalizeVoiceId(voiceId) {
  const v = String(voiceId || "").trim();
  return AVS_ALLOWED_VOICES.has(v) ? v : AVS_DEFAULT_VOICE;
}

/**
 * Apply the pronunciation dictionary before TTS: each rule's `term` is swapped
 * for its `phonetic` spelling (case-insensitive, whole-word). Longer terms are
 * applied first so multi-word terms win over their constituent words.
 */
function applyPronunciation(text, rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return text;
  }
  let out = String(text || "");
  const sorted = [...rules]
    .filter((r) => r && typeof r.term === "string" && typeof r.phonetic === "string")
    .sort((a, b) => b.term.length - a.term.length);
  for (const rule of sorted) {
    const term = rule.term.trim();
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    // Function replacer so a `$` in the phonetic spelling isn't treated as a
    // special replacement pattern (e.g. `$&`).
    out = out.replace(re, () => rule.phonetic);
  }
  return out;
}

/**
 * Split text into chunks no longer than `limit`, preferring sentence
 * boundaries. A single over-length sentence is hard-split on whitespace so we
 * never exceed the Aura request cap.
 */
function splitTextForAura(text, limit = AURA_CHAR_LIMIT) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const sentences = trimmed.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [trimmed];
  const chunks = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > limit) {
      flush();
      let word = "";
      for (const w of sentence.split(/\s+/)) {
        if ((`${word} ${w}`).trim().length > limit) {
          if (word) chunks.push(word);
          word = w;
        } else {
          word = (`${word} ${w}`).trim();
        }
      }
      if (word) chunks.push(word);
      continue;
    }

    if ((`${current} ${sentence}`).trim().length > limit) {
      flush();
      current = sentence;
    } else {
      current = (`${current} ${sentence}`).trim();
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [trimmed];
}

/** Synthesize one text chunk to an MP3 file via Deepgram Aura `/v1/speak`. */
async function synthesizeAuraChunk(text, voiceId, outputPath) {
  const apiKey = (process.env.DEEPGRAM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY in Cloud Run environment");
  }
  const params = new URLSearchParams({ model: voiceId, encoding: "mp3" });
  const resp = await fetch(`https://api.deepgram.com/v1/speak?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Deepgram Aura failed (${resp.status}): ${errBody}`);
  }
  const bytes = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(outputPath, bytes);
}

/** Probe an audio file's duration (seconds) via ffprobe. */
async function probeDurationSeconds(filePath) {
  const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const d = Number(String(stdout).trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** Concatenate MP3 files into one via the ffmpeg concat demuxer (stream copy). */
async function concatMp3(inputPaths, outputPath, workDir, tag) {
  if (inputPaths.length === 1) {
    await fs.copyFile(inputPaths[0], outputPath);
    return;
  }
  const listPath = path.join(workDir, `concat-${tag}.txt`);
  const listContent = inputPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, listContent);
  await execFileAsync("/usr/bin/ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outputPath,
  ]);
}

async function uploadVoiceoverToGcs({ bucketName, objectName, sourcePath }) {
  await storage.bucket(bucketName).upload(sourcePath, {
    destination: objectName,
    contentType: "audio/mpeg",
    resumable: false,
  });
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Turn a per-step script into ONE continuous MP3 voiceover:
 *  - apply the pronunciation dictionary, then Aura TTS each step (splitting long
 *    text at sentence boundaries and synthesizing chunks in parallel);
 *  - concat each step's chunks, probe its duration, and accumulate stepTimings;
 *  - concat all step MP3s into one file, upload to GCS, and return the result.
 * Steps with empty narration are skipped. Falls back to one segment when the
 * caller sends a single line (the no-steps case).
 */
async function processVoiceoverJob({ lines, voiceId, pronunciation }) {
  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const model = normalizeVoiceId(voiceId);

  const cleanLines = (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      stepId: String((l && l.stepId) || "").trim(),
      text: String((l && l.text) || "").trim(),
    }))
    .filter((l) => l.stepId && l.text);

  if (cleanLines.length === 0) {
    throw new Error("No script lines to synthesize");
  }

  const startedAt = Date.now();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-avs-voice-"));
  try {
    const stepMp3Paths = [];
    const stepTimings = [];
    let cursor = 0;

    for (let s = 0; s < cleanLines.length; s++) {
      const { stepId, text } = cleanLines[s];
      const spoken = applyPronunciation(text, pronunciation);
      const chunks = splitTextForAura(spoken);
      if (chunks.length === 0) continue;

      const chunkPaths = await Promise.all(
        chunks.map(async (chunkText, ci) => {
          const p = path.join(workDir, `step-${s}-chunk-${ci}.mp3`);
          await synthesizeAuraChunk(chunkText, model, p);
          return p;
        }),
      );

      const stepPath = path.join(workDir, `step-${s}.mp3`);
      await concatMp3(chunkPaths, stepPath, workDir, `step-${s}`);
      const dur = await probeDurationSeconds(stepPath);

      stepMp3Paths.push(stepPath);
      stepTimings.push({
        stepId,
        start: round3(cursor),
        end: round3(cursor + dur),
      });
      cursor += dur;
    }

    if (stepMp3Paths.length === 0) {
      throw new Error("No audio was produced for the script");
    }

    const finalPath = path.join(workDir, "voiceover.mp3");
    await concatMp3(stepMp3Paths, finalPath, workDir, "final");
    const probed = await probeDurationSeconds(finalPath);
    const duration = probed > 0 ? round3(probed) : round3(cursor);

    const objectName = `${AVS_VOICEOVER_PREFIX}${randomUUID()}.mp3`;
    await uploadVoiceoverToGcs({
      bucketName: processedBucket,
      objectName,
      sourcePath: finalPath,
    });

    const fileRef = storage.bucket(processedBucket).file(objectName);
    try {
      await fileRef.makePublic();
    } catch (e) {
      /* Ignore if UBLA is enforced; a signed/authorized URL still works. */
    }
    const audioUrl = `https://storage.googleapis.com/${processedBucket}/${objectName}`;

    console.log(
      `[avs-voiceover] steps=${stepTimings.length} duration=${duration}s ` +
        `voice=${model} total_ms=${Date.now() - startedAt}`,
    );

    return { audioUrl, duration, stepTimings };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- AVS time-alignment (freeze-frame / silence) ---------------------------

/** Sanitize + time-sort the incoming steps, dropping ones with an invalid span. */
function normalizeSyncSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map((s) => ({
      id: String((s && s.id) || "").trim(),
      startTime: Number(s && s.startTime),
      endTime: Number(s && s.endTime),
    }))
    .filter(
      (s) =>
        s.id &&
        Number.isFinite(s.startTime) &&
        Number.isFinite(s.endTime) &&
        s.endTime > s.startTime,
    )
    .sort((a, b) => a.startTime - b.startTime);
}

/** Build a stepId -> {start,end} lookup from the voiceover stepTimings. */
function buildTimingMap(stepTimings) {
  const map = new Map();
  for (const t of Array.isArray(stepTimings) ? stepTimings : []) {
    const stepId = String((t && t.stepId) || "").trim();
    const start = Number(t && t.start);
    const end = Number(t && t.end);
    if (stepId && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      map.set(stepId, { start, end });
    }
  }
  return map;
}

/**
 * Build one step's ALIGNED VIDEO segment (video-only, re-encoded to a uniform
 * H.264 so segments concat with -c copy). The [start, start+videoDur] slice of
 * the source is extended by `freeze` seconds of the cloned last frame (tpad) so
 * the segment lasts exactly max(T_video, T_audio).
 */
async function buildAlignedVideoSegment({ sourcePath, start, videoDur, freeze, outputPath }) {
  const filters = [`fps=${AVS_SYNC_FPS}`, "format=yuv420p", "setsar=1"];
  if (freeze > 0.001) {
    filters.push(`tpad=stop_mode=clone:stop_duration=${round3(freeze)}`);
  }
  await execFileAsync("/usr/bin/ffmpeg", [
    "-y",
    "-ss",
    String(round3(start)),
    "-t",
    String(round3(videoDur)),
    "-i",
    sourcePath,
    "-an",
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(AVS_SYNC_FPS),
    "-video_track_timescale",
    "15360",
    outputPath,
  ]);
}

/**
 * Build one step's ALIGNED AUDIO segment as a PCM WAV of length `totalDur`.
 * When the step has voiceover, its [audioStart, audioStart+audioDur] slice is
 * padded with trailing silence (apad) up to totalDur; otherwise the whole
 * segment is silence. PCM avoids the per-boundary priming drift that repeated
 * AAC concat would introduce, so A/V stay in sync across many steps.
 */
async function buildAlignedAudioSegment({ voicePath, audioStart, audioDur, totalDur, outputPath }) {
  if (voicePath && audioDur > 0.001) {
    await execFileAsync("/usr/bin/ffmpeg", [
      "-y",
      "-ss",
      String(round3(audioStart)),
      "-t",
      String(round3(audioDur)),
      "-i",
      voicePath,
      "-af",
      `aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${round3(totalDur)}`,
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);
    return;
  }
  await execFileAsync("/usr/bin/ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-t",
    String(round3(totalDur)),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

/** Concatenate media files of identical codecs via the ffmpeg concat demuxer (stream copy). */
async function concatByDemuxer(inputPaths, outputPath, workDir, tag) {
  if (inputPaths.length === 1) {
    await fs.copyFile(inputPaths[0], outputPath);
    return;
  }
  const listPath = path.join(workDir, `concat-${tag}.txt`);
  const listContent = inputPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(listPath, listContent);
  await execFileAsync("/usr/bin/ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outputPath,
  ]);
}

async function downloadToPath(url, destinationPath) {
  if (String(url).startsWith("gs://")) {
    await downloadFromGsUri({ uri: String(url), destinationPath });
  } else {
    await downloadFromUrl({ url: String(url), destinationPath });
  }
}

/**
 * Time-align the continuous voiceover to the video per step (AVS-2.4):
 *  - T_audio > T_video → freeze the step's last frame for the overflow;
 *  - T_video > T_audio → pad the step's voiceover with trailing silence;
 * so each step lasts max(T_video, T_audio) and audio/video stay in sync
 * end-to-end. Video segments (with freeze) and audio segments (with silence)
 * are concatenated separately, then the continuous aligned audio is muxed onto
 * the continuous video → ONE aligned MP4 (the source the normal export then
 * processes). Returns { alignedVideoUrl, duration }. FALLBACK: no voiceover /
 * steps → the original source is returned unchanged.
 */
async function processSyncJob({ videoUrl, audioUrl, steps, stepTimings }) {
  if (!videoUrl) throw new Error("videoUrl is required");

  const stepList = normalizeSyncSteps(steps);
  const timingMap = buildTimingMap(stepTimings);

  // Fallback: nothing to align → hand back the original source untouched.
  if (!audioUrl || stepList.length === 0 || timingMap.size === 0) {
    return { alignedVideoUrl: videoUrl, duration: 0 };
  }

  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const startedAt = Date.now();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-avs-sync-"));
  try {
    const sourcePath = path.join(workDir, "source.mp4");
    await downloadToPath(videoUrl, sourcePath);
    const voicePath = path.join(workDir, "voiceover.mp3");
    await downloadToPath(audioUrl, voicePath);

    const videoSegments = [];
    const audioSegments = [];
    let frozen = 0;
    let padded = 0;

    for (let i = 0; i < stepList.length; i++) {
      const step = stepList[i];
      const tVideo = round3(step.endTime - step.startTime);
      if (tVideo <= 0) continue;

      const timing = timingMap.get(step.id);
      const tAudio = timing ? round3(timing.end - timing.start) : 0;
      const total = Math.max(tVideo, tAudio);
      const freeze = Math.max(0, round3(tAudio - tVideo));
      if (freeze > 0) frozen++;
      if (tVideo > tAudio) padded++;

      const vSeg = path.join(workDir, `vseg-${i}.mp4`);
      await buildAlignedVideoSegment({
        sourcePath,
        start: step.startTime,
        videoDur: tVideo,
        freeze,
        outputPath: vSeg,
      });
      videoSegments.push(vSeg);

      const aSeg = path.join(workDir, `aseg-${i}.wav`);
      await buildAlignedAudioSegment({
        voicePath,
        audioStart: timing ? timing.start : 0,
        audioDur: tAudio,
        totalDur: total,
        outputPath: aSeg,
      });
      audioSegments.push(aSeg);
    }

    if (videoSegments.length === 0) {
      throw new Error("No alignable steps were produced");
    }

    const videoPath = path.join(workDir, "aligned-video.mp4");
    await concatByDemuxer(videoSegments, videoPath, workDir, "video");
    const audioPath = path.join(workDir, "aligned-audio.wav");
    await concatByDemuxer(audioSegments, audioPath, workDir, "audio");

    const alignedPath = path.join(workDir, "aligned.mp4");
    await execFileAsync("/usr/bin/ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      alignedPath,
    ]);

    const duration = round3(await probeDurationSeconds(alignedPath));

    const objectName = `${AVS_ALIGNED_PREFIX}${randomUUID()}.mp4`;
    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName,
      sourcePath: alignedPath,
    });
    const fileRef = storage.bucket(processedBucket).file(objectName);
    try {
      await fileRef.makePublic();
    } catch (e) {
      /* Ignore if UBLA is enforced; a signed/authorized URL still works. */
    }
    const alignedVideoUrl = `https://storage.googleapis.com/${processedBucket}/${objectName}`;

    console.log(
      `[avs-sync] steps=${videoSegments.length} frozen=${frozen} padded=${padded} ` +
        `duration=${duration}s total_ms=${Date.now() - startedAt}`,
    );

    return { alignedVideoUrl, duration };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- WTM webcam bubble compositing (WTM-6.4) -------------------------------

function clampRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** x264 needs even dimensions on both axes for yuv420p chroma subsampling. */
function evenDimension(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Probe the first video stream's pixel dimensions via ffprobe. */
async function probeVideoDimensions(filePath) {
  const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const [width, height] = String(stdout)
    .trim()
    .split(/\s+/)
    .map((n) => Number(n));
  return {
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
  };
}

/**
 * Overlay x:y expressions per corner (W/H = source, w/h = bubble, m = margin).
 * Mirrors `watermarkOverlayXY` in render.js; the default here is bottom-LEFT so
 * the bubble keeps clear of the bottom-right watermark.
 */
function bubbleOverlayXY(position, margin) {
  switch (position) {
    case "br":
      return `W-w-${margin}:H-h-${margin}`;
    case "tr":
      return `W-w-${margin}:${margin}`;
    case "tl":
      return `${margin}:${margin}`;
    case "bl":
    default:
      return `${margin}:H-h-${margin}`;
  }
}

/**
 * Composite the webcam clip onto the source as a circular corner bubble
 * (WTM-6.4) — a PRE-PASS producing ONE MP4 that the normal chunked export then
 * processes, exactly like /avs-sync. The filter chain:
 *   - `fps` on BOTH inputs first, so a 60 FPS capture + a 24 FPS webcam can't
 *     drift apart;
 *   - a dynamic bounding crop to the largest centered square (`min(iw,ih)`)
 *     before scaling, so a non-16:9 webcam is cropped rather than squished;
 *   - a `geq` luma mask (255 inside the inscribed circle, 0 outside) merged in
 *     as the alpha channel, giving a clean circular cutout;
 *   - `overlay` at the requested corner.
 * The ORIGINAL SOURCE AUDIO is mapped through untouched and the webcam's audio
 * is never mapped — the screen recording already carries mic/tab audio, so
 * muxing the webcam too would double it. Returns { compositedVideoUrl,
 * duration }. FALLBACK: no webcam → the source is returned unchanged.
 */
async function processCompositeJob({ videoUrl, webcamUrl, position, size, shape }) {
  if (!videoUrl) throw new Error("videoUrl is required");

  // Fallback: nothing to composite → hand the source straight back, no ffmpeg.
  if (!webcamUrl) {
    return { compositedVideoUrl: videoUrl, duration: 0 };
  }

  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const startedAt = Date.now();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-wtm-composite-"));
  try {
    const sourcePath = path.join(workDir, "source.mp4");
    await downloadToPath(videoUrl, sourcePath);
    const webcamPath = path.join(workDir, "webcam.mp4");
    await downloadToPath(webcamUrl, webcamPath);

    // The bubble is sized against the SOURCE height, so it lands at the same
    // relative size the editor preview shows regardless of the webcam's own
    // resolution. A failed probe falls back to 1080p.
    const { height: probedHeight } = await probeVideoDimensions(sourcePath);
    const sourceHeight = probedHeight > 0 ? probedHeight : 1080;
    const fraction = clampRange(
      size,
      WTM_BUBBLE_SIZE_MIN,
      WTM_BUBBLE_SIZE_MAX,
      WTM_BUBBLE_SIZE_DEFAULT,
    );
    const diameter = evenDimension(Math.min(sourceHeight, fraction * sourceHeight));
    const corner = WTM_POSITIONS.includes(position) ? position : "bl";
    const margin = Math.max(1, Math.round((sourceHeight * WTM_BUBBLE_MARGIN_PX) / 1080));
    // v1 is circle-only (PRD §6.4). An unknown shape degrades to a circle
    // rather than failing the export; the field stays for future shapes.
    const bubbleShape = "circle";
    if (shape && shape !== bubbleShape) {
      console.warn(`[wtm-composite] unsupported shape "${shape}", using circle`);
    }

    // `split` is required because the squared webcam feeds BOTH the mask
    // generator and alphamerge — a filtergraph label can only be consumed once.
    const filterComplex = [
      `[1:v]fps=${WTM_COMPOSITE_FPS},crop='min(iw,ih)':'min(iw,ih)',` +
        `scale=${diameter}:${diameter},setsar=1,split=2[sqa][sqb]`,
      `[sqb]geq='st(3,pow(X-(W/2),2)+pow(Y-(H/2),2));` +
        `if(lte(ld(3),pow(min(W/2,H/2),2)),255,0)':128:128,format=gray[mask]`,
      `[sqa]format=yuva420p[camsrc]`,
      `[camsrc][mask]alphamerge[cam]`,
      `[0:v]fps=${WTM_COMPOSITE_FPS}[base]`,
      // eof_action=pass is load-bearing: overlay's DEFAULT (repeat) keeps the
      // graph alive until BOTH inputs end, so a webcam clip even slightly
      // longer than the screen capture would extend the output past the source
      // (freezing its last frame) and leave the audio ending early. With
      // `pass`, the output always ends with the source and the bubble simply
      // stops if the webcam runs out first.
      `[base][cam]overlay=${bubbleOverlayXY(corner, margin)}:format=auto:eof_action=pass[out]`,
    ].join(";");

    const compositedPath = path.join(workDir, "composited.mp4");
    await execFileAsync(
      "/usr/bin/ffmpeg",
      [
        "-y",
        "-i",
        sourcePath,
        "-i",
        webcamPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[out]",
        // Source audio only, and optional so a silent screen capture still
        // succeeds. The webcam input's audio is never mapped (see above).
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(WTM_COMPOSITE_FPS),
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        compositedPath,
      ],
      // geq runs per pixel per frame, so a long source produces a lot of
      // ffmpeg stderr; give the buffer headroom.
      { maxBuffer: 32 * 1024 * 1024 },
    );

    const duration = round3(await probeDurationSeconds(compositedPath));

    const objectName = `${WTM_COMPOSITE_PREFIX}${randomUUID()}.mp4`;
    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName,
      sourcePath: compositedPath,
    });
    const fileRef = storage.bucket(processedBucket).file(objectName);
    try {
      await fileRef.makePublic();
    } catch (e) {
      /* Ignore if UBLA is enforced; a signed/authorized URL still works. */
    }
    const compositedVideoUrl = `https://storage.googleapis.com/${processedBucket}/${objectName}`;

    console.log(
      `[wtm-composite] shape=${bubbleShape} corner=${corner} d=${diameter}px ` +
        `margin=${margin}px fps=${WTM_COMPOSITE_FPS} duration=${duration}s ` +
        `total_ms=${Date.now() - startedAt}`,
    );

    return { compositedVideoUrl, duration };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- HLS packaging: R2 ------------------------------------------------------
//
// The renditions go to Cloudflare R2, not to the GCS processed bucket the rest
// of this worker writes to, because R2 is where app/lib/r2.ts's `r2://` scheme
// and public host live and the player has to be able to fetch segments from a
// public CDN edge. R2 is S3-compatible, so this is @aws-sdk/client-s3 pointed at
// the account endpoint — the same client construction as app/lib/r2.ts.

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_HLS_BUCKET = process.env.R2_HLS_BUCKET || process.env.R2_PROCESSED_BUCKET || "";

let r2Client = null;

function getR2Client() {
  if (r2Client) {
    return r2Client;
  }
  must("R2_ACCOUNT_ID", R2_ACCOUNT_ID);
  must("R2_ACCESS_KEY_ID", R2_ACCESS_KEY_ID);
  must("R2_SECRET_ACCESS_KEY", R2_SECRET_ACCESS_KEY);
  const { S3Client } = require("@aws-sdk/client-s3");
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

/**
 * Content types for the files a packaging run produces.
 *
 * NOT COSMETIC. A playlist served as application/octet-stream is refused by
 * hls.js's loader and by Safari's native player, and the demo then fails to play
 * with nothing in the console that points back here. R2 stores whatever it is
 * told and serves it back verbatim, so the type has to be right at upload time.
 */
function hlsContentType(fileName) {
  if (fileName.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (fileName.endsWith(".m4s") || fileName.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (fileName.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

async function r2PutFile({ bucket, key, sourcePath, contentType }) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const body = await fs.readFile(sourcePath);
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
    }),
  );
}

async function r2PutText({ bucket, key, text, contentType }) {
  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const body = Buffer.from(text, "utf8");
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
    }),
  );
}

/** Read a small object back as text, or null when it is not there. */
async function r2GetText({ bucket, key }) {
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) {
      return null;
    }
    return await result.Body.transformToString();
  } catch (e) {
    return null;
  }
}

/**
 * sha256 of the source file, streamed so a large export is never held in memory.
 *
 * THE IDEMPOTENCY KEY, together with the demo id: the packager records this
 * beside the renditions and skips the whole encode when a later run hashes the
 * source to the same value. Content-addressed rather than URL- or mtime-based
 * because the export path reuses object names, so a URL that has not changed is
 * no evidence that the bytes behind it have not.
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Does the source carry an audio stream?
 *
 * LOAD-BEARING FOR -var_stream_map. That option names the output streams for
 * each variant by index, so a map of `v:0,a:0` against a source with no audio
 * refers to an output stream that does not exist and ffmpeg fails the whole run.
 * A silent screen capture is not exotic — a demo recorded with the mic off is
 * one — so the map is built from what the source actually has.
 */
async function probeHasAudio(filePath) {
  try {
    const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    return String(stdout).trim() === "audio";
  } catch (e) {
    // A failed probe is treated as "no audio": packaging a silent ladder is
    // recoverable, and a var_stream_map naming a stream that is not there is not.
    return false;
  }
}

/**
 * The rungs worth encoding for a source of this height.
 *
 * Never upscales: a 720p source gets 720p and 480p, not a 1080p rendition that
 * spends 5 Mbps carrying the same detail. A source shorter than the bottom rung
 * still gets exactly one rendition, because a master playlist with no variants
 * is not a playable thing.
 */
function ladderForSource(sourceHeight) {
  const height = sourceHeight > 0 ? sourceHeight : 1080;
  const rungs = HLS_LADDER.filter((rung) => rung.height <= height);
  return rungs.length > 0 ? rungs : [HLS_LADDER[HLS_LADDER.length - 1]];
}

/** Every file under `dir`, as paths relative to it. */
async function listFilesRecursive(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

/**
 * Package one source into an adaptive-bitrate HLS ladder (#302 section 2.4).
 *
 * ============================================================================
 * ALIGNED KEYFRAMES ARE THE WHOLE GAME
 * ============================================================================
 * A player switching rendition can only cut at a segment boundary, and a segment
 * can only start on a keyframe. If the renditions place their keyframes at
 * different timestamps their segments cover different spans of the video, and
 * every quality switch repeats or skips a fraction of a second — the classic
 * stutter on every switch. Four settings enforce alignment here and all four are
 * needed:
 *
 *   -r HLS_FPS         every rendition runs at the SAME constant frame rate, so
 *                      a GOP of N frames is the same number of seconds in each.
 *   -g / -keyint_min   a fixed GOP of exactly HLS_SEGMENT_SECONDS worth of
 *                      frames, with the minimum equal to the maximum so the
 *                      encoder cannot decide to shorten one.
 *   -force_key_frames  an explicit keyframe at every multiple of the segment
 *                      length, expressed in TIME. Belt to the braces: -g counts
 *                      frames and a dropped or duplicated frame drifts that
 *                      count, while the expression is anchored to the timeline.
 *   -sc_threshold 0    scene-change detection inserts a keyframe wherever a cut
 *                      happens, which lands in a different place per rendition
 *                      as soon as the encoders disagree about what a cut is.
 *                      This is the setting people forget, and it silently undoes
 *                      the other three.
 *
 * ONE ffmpeg INVOCATION, not one per rung: the source is decoded once and split
 * in the filtergraph, which is faster and is the only way every scaler sees
 * identical input frames.
 *
 * Output is fMP4 (`-hls_segment_type fmp4`) — an init segment plus .m4s media
 * segments — rather than MPEG-TS. fMP4 is what current players want, shares a
 * container with the MP4 the rest of the pipeline produces, and avoids the TS
 * muxer's audio-priming quirks.
 *
 * Returns { playlistUri, sourceHash, renditions, duration, skipped }.
 */
async function packageHlsJob({ demoId, videoUrl, sourceHash: knownSourceHash, force }) {
  if (!demoId) throw new Error("demoId is required");
  if (!videoUrl) throw new Error("videoUrl is required");
  // The demo id becomes an object-key prefix, so a `..` segment or a slash would
  // escape it. Mirrors isSafeDemoId() in app/lib/overlays/hls.ts.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(demoId))) {
    throw new Error("Invalid demoId");
  }

  const bucket = must("R2_HLS_BUCKET", R2_HLS_BUCKET);
  const prefix = `${HLS_PREFIX}${demoId}/`;
  const masterKey = `${prefix}master.m3u8`;
  const manifestKey = `${prefix}manifest.json`;
  const playlistUri = `r2://${bucket}/${masterKey}`;
  const startedAt = Date.now();

  /** The recorded state of the last successful run, or null. */
  const readManifest = async () => {
    const raw = await r2GetText({ bucket, key: manifestKey });
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  // FAST PATH: the caller already knows the hash it recorded last time, so an
  // unchanged source costs one small GET and no download at all. This is the
  // path the export trigger takes when a re-save did not actually re-encode.
  if (!force && knownSourceHash) {
    const manifest = await readManifest();
    if (manifest && manifest.sourceHash === knownSourceHash) {
      console.log(
        `[package-hls] demo=${demoId} skipped=manifest total_ms=${Date.now() - startedAt}`,
      );
      return {
        playlistUri,
        sourceHash: manifest.sourceHash,
        renditions: manifest.renditions || [],
        duration: manifest.duration || 0,
        skipped: true,
      };
    }
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-hls-"));
  try {
    const downloadStartedAt = Date.now();
    const sourcePath = path.join(workDir, "source.mp4");
    await downloadToPath(videoUrl, sourcePath);
    const downloadMs = Date.now() - downloadStartedAt;

    const hashStartedAt = Date.now();
    const sourceHash = await hashFile(sourcePath);
    const hashMs = Date.now() - hashStartedAt;

    // SLOW-PATH IDEMPOTENCY: we had to download to learn the hash, but the
    // encode — the expensive part by two orders of magnitude — is still skipped
    // when the bytes have not changed.
    if (!force) {
      const manifest = await readManifest();
      if (manifest && manifest.sourceHash === sourceHash) {
        console.log(
          `[package-hls] demo=${demoId} skipped=hash download_ms=${downloadMs} ` +
            `hash_ms=${hashMs} total_ms=${Date.now() - startedAt}`,
        );
        return {
          playlistUri,
          sourceHash,
          renditions: manifest.renditions || [],
          duration: manifest.duration || 0,
          skipped: true,
        };
      }
    }

    const { height: probedHeight } = await probeVideoDimensions(sourcePath);
    const ladder = ladderForSource(probedHeight);
    const hasAudio = await probeHasAudio(sourcePath);
    const gopFrames = Math.max(1, Math.round(HLS_SEGMENT_SECONDS * HLS_FPS));

    // ONE FLAT DIRECTORY, and %v only ever in a FILENAME — never as a directory
    // component. ffmpeg derives the master playlist's path from the dirname of
    // the output playlist argument, so an output of `out/%v/index.m3u8` asks it
    // to write the master into a directory literally called "%v". Flat filenames
    // (`out/%v.m3u8`) leave the dirname free of %v, which is the shape ffmpeg's
    // own multi-variant example uses.
    const outDir = path.join(workDir, "out");
    await fs.mkdir(outDir, { recursive: true });

    // Split the decoded video once per rung and scale each branch. Width comes
    // from -2 so the aspect ratio is preserved and the result stays even, which
    // yuv420p requires.
    const filterComplex = [
      `[0:v]split=${ladder.length}${ladder.map((_, i) => `[v${i}in]`).join("")}`,
      ...ladder.map(
        (rung, i) =>
          `[v${i}in]scale=-2:${rung.height}:force_original_aspect_ratio=decrease,setsar=1[v${i}]`,
      ),
    ].join(";");

    const args = ["-y", "-i", sourcePath, "-filter_complex", filterComplex];

    ladder.forEach((rung, i) => {
      args.push("-map", `[v${i}]`);
      args.push(
        `-c:v:${i}`,
        "libx264",
        `-preset:v:${i}`,
        "veryfast",
        `-profile:v:${i}`,
        "main",
        `-b:v:${i}`,
        `${rung.videoKbps}k`,
        `-maxrate:v:${i}`,
        `${rung.maxrateKbps}k`,
        `-bufsize:v:${i}`,
        `${rung.bufsizeKbps}k`,
      );
      // Only when the source HAS audio: -var_stream_map below names output
      // streams by index, and naming an audio stream that does not exist fails
      // the whole run rather than degrading to a silent ladder.
      if (hasAudio) {
        args.push("-map", "0:a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, `${rung.audioKbps}k`);
      }
    });

    args.push(
      // Constant frame rate, fixed GOP, forced keyframes on the timeline, no
      // scene-change keyframes. See the comment above this function: drop any
      // one of these and every quality switch stutters.
      "-r",
      String(HLS_FPS),
      "-g",
      String(gopFrames),
      "-keyint_min",
      String(gopFrames),
      "-sc_threshold",
      "0",
      "-force_key_frames",
      `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`,
      "-pix_fmt",
      "yuv420p",
      ...(hasAudio ? ["-ar", "48000", "-ac", "2"] : []),
      "-f",
      "hls",
      "-hls_time",
      String(HLS_SEGMENT_SECONDS),
      // 0 keeps every segment. A VOD playlist lists the whole video; the default
      // rolling window would produce a live-style playlist starting partway in.
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_type",
      "fmp4",
      // Declares that every segment can be decoded independently — true because
      // of the keyframe settings above, and what lets a player start on any
      // segment when it switches rendition.
      "-hls_flags",
      "independent_segments",
      // Relative, so ffmpeg resolves it against the variant playlist's own
      // directory — which is outDir for all three — and %v expands to the
      // `name:` from var_stream_map below. Gives 1080p_init.mp4 etc.
      "-hls_fmp4_init_filename",
      "%v_init.mp4",
      "-hls_segment_filename",
      path.join(outDir, "%v_%05d.m4s"),
      "-master_pl_name",
      "master.m3u8",
      "-var_stream_map",
      ladder
        .map((rung, i) => (hasAudio ? `v:${i},a:${i}` : `v:${i}`) + `,name:${rung.height}p`)
        .join(" "),
      path.join(outDir, "%v.m3u8"),
    );

    const encodeStartedAt = Date.now();
    await execFileAsync("/usr/bin/ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 });
    const encodeMs = Date.now() - encodeStartedAt;

    const duration = round3(await probeDurationSeconds(sourcePath));

    // Upload everything produced, preserving the relative layout the playlists
    // reference. Every URI inside a playlist — the master's variant references,
    // a variant's init and segment references — is a bare filename, so all of it
    // has to land under the one `hls/<demoId>/` prefix and nowhere else.
    const uploadStartedAt = Date.now();
    const files = await listFilesRecursive(outDir);
    for (const relativePath of files) {
      const key = `${prefix}${relativePath.split(path.sep).join("/")}`;
      await r2PutFile({
        bucket,
        key,
        sourcePath: path.join(outDir, relativePath),
        contentType: hlsContentType(relativePath),
      });
    }
    const uploadMs = Date.now() - uploadStartedAt;

    const renditions = ladder.map((rung) => ({
      height: rung.height,
      bitrateKbps: rung.videoKbps + rung.audioKbps,
    }));

    // The marker goes up LAST, deliberately. It is what a later run trusts in
    // order to skip the encode, so it must never be readable while the segments
    // it vouches for are still uploading. A crash halfway through leaves no
    // marker and the next run repackages, which is the recoverable direction.
    await r2PutText({
      bucket,
      key: manifestKey,
      text: JSON.stringify({
        demoId,
        sourceHash,
        renditions,
        duration,
        segmentSeconds: HLS_SEGMENT_SECONDS,
        packagedAt: new Date().toISOString(),
      }),
      contentType: "application/json",
    });

    console.log(
      `[package-hls] demo=${demoId} rungs=${ladder.map((r) => r.height).join("/")} ` +
        `files=${files.length} duration=${duration}s gop=${gopFrames}f ` +
        `audio=${hasAudio} ` +
        `download_ms=${downloadMs} hash_ms=${hashMs} encode_ms=${encodeMs} ` +
        `upload_ms=${uploadMs} total_ms=${Date.now() - startedAt}`,
    );

    return { playlistUri, sourceHash, renditions, duration, skipped: false };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getRecipeById(recipeId) {
  const snap = await firestore
    .collection(RECIPES_COLLECTION)
    .doc(recipeId)
    .get();
  if (!snap.exists) {
    throw new Error(`Recipe not found: ${recipeId}`);
  }
  return snap.data() || {};
}

async function updateChunkStatus(chunkId, patch) {
  await firestore
    .collection(CHUNKS_COLLECTION)
    .doc(chunkId)
    .set(
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function processChunkJob({
  chunkId,
  recipeId,
  rawObject,
  outputObject,
  recipe: inlineRecipe,
  videoUrl,
  startTime,
  duration,
}) {
  const totalStartMs = Date.now();
  const rawBucket = must("RAW_BUCKET", RAW_BUCKET);
  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const recipe = inlineRecipe || (await getRecipeById(recipeId));

  const sourceObject = rawObject || `${RAW_PREFIX}${chunkId}.webm`;
  const destObject = outputObject || `${PROCESSED_PREFIX}${chunkId}.mp4`;

  await updateChunkStatus(chunkId, {
    recipeId,
    status: "PROCESSING",
    rawBucket,
    rawObject: sourceObject,
    sourceUrl: videoUrl || null,
    error: FieldValue.delete(),
  });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "marvedge-gcp-"));
  let inputPath = path.join(workDir, "input.webm");
  const outputPath = path.join(workDir, "output.mp4");

  try {
    const dlStartMs = Date.now();
    let dlMs = 0;

    if (
      typeof startTime === "number" &&
      typeof duration === "number" &&
      videoUrl
    ) {
      // Logical splitting: Skip physical download, use URL directly as inputPath.
      // For gs:// sources, sign URL so ffmpeg can stream it.
      if (String(videoUrl).startsWith("gs://")) {
        inputPath = await getSignedHttpUrlForGsUri(String(videoUrl));
      } else {
        inputPath = String(videoUrl);
      }
    } else if (videoUrl) {
      if (String(videoUrl).startsWith("gs://")) {
        await downloadFromGsUri({
          uri: String(videoUrl),
          destinationPath: inputPath,
        });
      } else {
        await downloadFromUrl({
          url: String(videoUrl),
          destinationPath: inputPath,
        });
      }
      dlMs = Date.now() - dlStartMs;
    } else {
      await downloadRawChunkFromGcs({
        bucketName: rawBucket,
        objectName: sourceObject,
        destinationPath: inputPath,
      });
      dlMs = Date.now() - dlStartMs;
    }

    let inputBytes = 0;
    try {
      inputBytes = (await fs.stat(inputPath)).size;
    } catch {
      // Ignore stats failures.
    }

    const renderStartMs = Date.now();
    const renderResult = await renderChunkFromRecipe({
      inputPath,
      outputPath,
      chunkId,
      recipe,
      chunkDurationSecs: CHUNK_DURATION_SECS,
      startTime,
      duration,
    });
    const renderMs = Date.now() - renderStartMs;

    if (renderResult && renderResult.skipped) {
      console.log(`[${chunkId}] Chunk was skipped. Not uploading.`);
      await updateChunkStatus(chunkId, {
        recipeId,
        status: "SKIPPED",
        error: FieldValue.delete(),
      });
      return {
        chunkId,
        recipeId,
        status: "SKIPPED",
        skipped: true,
      };
    }

    let outputBytes = 0;
    try {
      outputBytes = (await fs.stat(outputPath)).size;
    } catch {
      // Ignore stats failures.
    }

    const uploadStartMs = Date.now();
    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName: destObject,
      sourcePath: outputPath,
    });
    const uploadMs = Date.now() - uploadStartMs;
    const totalMs = Date.now() - totalStartMs;

    console.log(
      `[${chunkId}] Timing download_ms=${dlMs} render_ms=${renderMs} upload_ms=${uploadMs} total_ms=${totalMs} ` +
        `input_mb=${(inputBytes / 1048576).toFixed(2)} output_mb=${(outputBytes / 1048576).toFixed(2)}`,
    );

    await updateChunkStatus(chunkId, {
      recipeId,
      status: "DONE",
      processedBucket,
      processedObject: destObject,
      error: FieldValue.delete(),
    });

    return {
      chunkId,
      recipeId,
      status: "DONE",
      processedBucket,
      processedObject: destObject,
    };
  } catch (err) {
    await updateChunkStatus(chunkId, {
      recipeId,
      status: "FAILED",
      error: err?.message || String(err),
    });
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

// shared secret so strangers cannot trigger pricey video jobs.
// while the secret is missing we only warn, so local runs keep working.
// once WORKER_SECRET is set on Cloud Run, requests without it get a 401.
const WORKER_SECRET = process.env.WORKER_SECRET || "";

function isBlockedWorkerHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!host || host === "localhost") {
    return true;
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare.includes(":")) {
    if (bare === "::1") {
      return true;
    }
    const first = bare.split(":")[0] === "" ? "0" : bare.split(":")[0];
    const value = parseInt(first, 16);
    if (Number.isFinite(value)) {
      if (value >= 0xfc00 && value <= 0xfdff) {
        return true;
      }
      if (value >= 0xfe80 && value <= 0xfebf) {
        return true;
      }
    }
    return false;
  }
  const octets = bare.split(".").map((part) => {
    if (/^0x[0-9a-f]+$/i.test(part)) {
      return parseInt(part, 16);
    }
    if (/^0[0-7]+$/.test(part)) {
      return parseInt(part, 8);
    }
    if (/^\d+$/.test(part)) {
      return parseInt(part, 10);
    }
    return NaN;
  });
  if (octets.length !== 4 || octets.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return !bare.includes(".");
  }
  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function requireWorkerAuth(req, res, next) {
  if (!WORKER_SECRET) {
    console.warn("[worker] WORKER_SECRET not set, auth skipped");
    return next();
  }
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token || token !== WORKER_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}

app.use(
  ["/process", "/subtitles", "/avs-voiceover", "/avs-sync", "/wtm-composite", "/package-hls", "/merge"],
  requireWorkerAuth
);

app.post("/process", async (req, res) => {
  const {
    chunkId,
    recipeId,
    rawObject,
    outputObject,
    recipe,
    videoUrl,
    startTime,
    duration,
  } = req.body || {};
  if (!chunkId || !recipeId) {
    return res.status(400).json({
      ok: false,
      error: "chunkId and recipeId are required",
    });
  }

  try {
    const result = await processChunkJob({
      chunkId,
      recipeId,
      rawObject,
      outputObject,
      recipe,
      videoUrl,
      startTime,
      duration,
    });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error("[worker] process failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/subtitles", async (req, res) => {
  const { videoUrl, language } = req.body || {};
  if (!videoUrl) {
    return res.status(400).json({ ok: false, error: "videoUrl is required" });
  }
  try {
    const cues = await processSubtitlesJob({ videoUrl, language });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "subtitles",
        cues,
      },
    });
  } catch (err) {
    console.error("[worker] subtitles failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/avs-voiceover", async (req, res) => {
  const { lines, voiceId, pronunciation } = req.body || {};
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ ok: false, error: "lines array is required" });
  }
  try {
    const result = await processVoiceoverJob({ lines, voiceId, pronunciation });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "avs-voiceover",
        ...result,
      },
    });
  } catch (err) {
    console.error("[worker] avs-voiceover failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/avs-sync", async (req, res) => {
  const { videoUrl, audioUrl, steps, stepTimings } = req.body || {};
  if (!videoUrl) {
    return res.status(400).json({ ok: false, error: "videoUrl is required" });
  }
  try {
    const result = await processSyncJob({ videoUrl, audioUrl, steps, stepTimings });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "avs-sync",
        ...result,
      },
    });
  } catch (err) {
    console.error("[worker] avs-sync failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/wtm-composite", async (req, res) => {
  const { videoUrl, webcamUrl, position, size, shape } = req.body || {};
  if (!videoUrl) {
    return res.status(400).json({ ok: false, error: "videoUrl is required" });
  }
  try {
    const result = await processCompositeJob({ videoUrl, webcamUrl, position, size, shape });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "wtm-composite",
        ...result,
      },
    });
  } catch (err) {
    console.error("[worker] wtm-composite failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/package-hls", async (req, res) => {
  const { demoId, videoUrl, sourceHash, force } = req.body || {};
  if (!demoId || !videoUrl) {
    return res.status(400).json({ ok: false, error: "demoId and videoUrl are required" });
  }
  try {
    const result = await packageHlsJob({ demoId, videoUrl, sourceHash, force });
    return res.status(200).json({
      ok: true,
      result: {
        recipeId: "package-hls",
        ...result,
      },
    });
  } catch (err) {
    console.error("[worker] package-hls failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "unknown_error",
    });
  }
});

app.post("/merge", async (req, res) => {
  const { recipeId, chunkFilenames } = req.body || {};
  if (
    !recipeId ||
    !Array.isArray(chunkFilenames) ||
    chunkFilenames.length === 0
  ) {
    return res.status(400).json({
      ok: false,
      error: "recipeId and chunkFilenames array are required",
    });
  }

  const processedBucket = must("PROCESSED_BUCKET", PROCESSED_BUCKET);
  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "marvedge-gcp-merge-"),
  );
  const finalFilename = `${recipeId}.mp4`;
  const finalPath = path.join(workDir, finalFilename);
  const concatTextPath = path.join(workDir, "concat.txt");

  try {
    let concatLines = "";
    for (let i = 0; i < chunkFilenames.length; i++) {
      const chunkName = chunkFilenames[i];
      const localChunkPath = path.join(workDir, chunkName);
      await downloadRawChunkFromGcs({
        bucketName: processedBucket,
        objectName: chunkName,
        destinationPath: localChunkPath,
      });
      concatLines += `file '${chunkName}'\n`;
    }

    await fs.writeFile(concatTextPath, concatLines);

    await new Promise((resolve, reject) => {
      require("fluent-ffmpeg")()
        .input(concatTextPath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions("-c copy")
        .output(finalPath)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    await uploadProcessedChunkToGcs({
      bucketName: processedBucket,
      objectName: finalFilename,
      sourcePath: finalPath,
    });

    const fileRef = storage.bucket(processedBucket).file(finalFilename);
    try {
      await fileRef.makePublic();
    } catch (e) {
      /* Ignore if UBLA is enforced */
    }

    const publicUrl = `https://storage.googleapis.com/${processedBucket}/${finalFilename}`;

    for (let i = 0; i < chunkFilenames.length; i++) {
      storage
        .bucket(processedBucket)
        .file(chunkFilenames[i])
        .delete()
        .catch(() => {});
    }

    return res.status(200).json({
      ok: true,
      result: {
        recipeId,
        mergedObject: finalFilename,
        exportedUrl: publicUrl,
      },
    });
  } catch (err) {
    console.error("[worker] merge failed:", err);
    return res
      .status(500)
      .json({ ok: false, error: err?.message || "unknown_error" });
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`Cloud Run worker listening on :${PORT}`);
});
