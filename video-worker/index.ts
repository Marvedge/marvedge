/* eslint-disable @typescript-eslint/no-explicit-any */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { v2 as cloudinary } from "cloudinary";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import axios from "axios";

// ── Setup ──────────────────────────────────────────────────────────────────────
// Load env from common locations (video-worker/.env and parent app .env).
// Note: environment variables are read once at process start; restart the worker after editing .env.
(() => {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(__dirname, ".env"),
    path.resolve(__dirname, "../.env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
    }
  }
})();

if (!ffmpegStatic) {
  throw new Error("ffmpeg-static not found");
}
ffmpeg.setFfmpegPath(ffmpegStatic);

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const workerConcurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || "1", 10) || 1);
const prisma = new PrismaClient({
  datasourceUrl: (process.env.DATABASE_URL || "").replace(
    "?sslmode=require",
    "?sslmode=require&connect_timeout=30"
  ),
});

console.log(
  `🧩 Env check: DEEPGRAM_API_KEY=${process.env.DEEPGRAM_API_KEY ? "set" : "missing"}`
);

// Retry wrapper for Neon cold-start (free tier suspends after 5 min inactivity)
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const isConnErr =
        e?.message?.includes("Can't reach database") || e?.message?.includes("connect");
      if (isConnErr && i < retries - 1) {
        console.warn(
          `[DB] Connection failed (attempt ${i + 1}/${retries}), retrying in ${delayMs}ms...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw e;
      }
    }
  }
  throw new Error("DB retry limit exceeded");
}

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function listEncoders(): Set<string> {
  try {
    const out = execFileSync(ffmpegStatic as string, ["-hide_banner", "-encoders"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const enc = new Set<string>();
    for (const line of out.split("\n")) {
      // Typical format: " V....D h264_videotoolbox VideoToolbox H.264 Encoder"
      const m = line.match(/^\s*[A-Z\.]{6}\s+([^\s]+)\s+/);
      if (m?.[1]) {
        enc.add(m[1]);
      }
    }
    return enc;
  } catch {
    return new Set<string>();
  }
}

const AVAILABLE_ENCODERS = listEncoders();

function pickVideoEncoder(preferred: string | null | undefined) {
  const forced = (preferred || "").trim();
  if (forced) {
    return { encoder: forced, available: AVAILABLE_ENCODERS.has(forced) };
  }

  // Auto-pick best available.
  if (process.platform === "darwin" && AVAILABLE_ENCODERS.has("h264_videotoolbox")) {
    return { encoder: "h264_videotoolbox", available: true };
  }
  if (AVAILABLE_ENCODERS.has("h264_nvenc")) {
    return { encoder: "h264_nvenc", available: true };
  }
  return { encoder: "libx264", available: true };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toSeconds(t: string | number): number {
  if (typeof t === "number") {
    return t;
  }
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  return parseFloat(t);
}

type TimeRange = { start: number; end: number };
type ZoomRange = { startTime: number; endTime: number; zoomLevel: number; x: number; y: number };
type TextRange = {
  startTime: number;
  endTime: number;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
};

const EPS = 0.001;

function normalizeRemoveSegments(rawSegments: any[], duration: number): TimeRange[] {
  if (!rawSegments || rawSegments.length === 0) {
    return [];
  }

  const cleaned = rawSegments
    .map((s: any) => ({ start: toSeconds(s.start), end: toSeconds(s.end) }))
    .filter((s: TimeRange) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s: TimeRange) => ({
      start: Math.max(0, Math.min(duration, Math.min(s.start, s.end))),
      end: Math.max(0, Math.min(duration, Math.max(s.start, s.end))),
    }))
    .filter((s: TimeRange) => s.end - s.start > EPS)
    .sort((a: TimeRange, b: TimeRange) => a.start - b.start);

  if (cleaned.length === 0) {
    return [];
  }

  const merged: TimeRange[] = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i++) {
    const curr = cleaned[i];
    const last = merged[merged.length - 1];
    if (curr.start <= last.end + EPS) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function invertToKeepSegments(removeSegments: TimeRange[], duration: number): TimeRange[] {
  if (duration <= EPS) {
    return [];
  }
  if (removeSegments.length === 0) {
    return [{ start: 0, end: duration }];
  }

  const keepSegments: TimeRange[] = [];
  let cursor = 0;
  for (const s of removeSegments) {
    if (cursor < s.start - EPS) {
      keepSegments.push({ start: cursor, end: s.start });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration - EPS) {
    keepSegments.push({ start: cursor, end: duration });
  }
  return keepSegments.filter((s: TimeRange) => s.end - s.start > EPS);
}

function buildRemovedBefore(removeSegments: TimeRange[]) {
  return (time: number): number => {
    let removed = 0;
    for (const seg of removeSegments) {
      if (seg.start >= time) {
        break;
      }
      removed += Math.max(0, Math.min(time, seg.end) - seg.start);
    }
    return removed;
  };
}

function remapZoomEffectsToTrimmedTimeline(
  rawZoomEffects: any[],
  keepSegments: TimeRange[],
  removeSegments: TimeRange[]
): ZoomRange[] {
  if (!rawZoomEffects || rawZoomEffects.length === 0 || keepSegments.length === 0) {
    return [];
  }

  const removedBefore = buildRemovedBefore(removeSegments);
  const out: ZoomRange[] = [];
  const sortedZooms = rawZoomEffects
    .map((z: any) => ({
      startTime: toSeconds(z.startTime),
      endTime: toSeconds(z.endTime),
      zoomLevel: Number(z.zoomLevel),
      x: Number(z.x),
      y: Number(z.y),
    }))
    .filter(
      (z: ZoomRange) =>
        Number.isFinite(z.startTime) &&
        Number.isFinite(z.endTime) &&
        Number.isFinite(z.zoomLevel) &&
        Number.isFinite(z.x) &&
        Number.isFinite(z.y)
    )
    .map((z: ZoomRange) => ({
      startTime: Math.min(z.startTime, z.endTime),
      endTime: Math.max(z.startTime, z.endTime),
      zoomLevel: Math.max(1.0, z.zoomLevel),
      x: Math.max(0, Math.min(1, z.x)),
      y: Math.max(0, Math.min(1, z.y)),
    }))
    .filter((z: ZoomRange) => z.endTime - z.startTime > EPS)
    .sort((a: ZoomRange, b: ZoomRange) => a.startTime - b.startTime);

  for (const z of sortedZooms) {
    for (const keep of keepSegments) {
      const overlapStart = Math.max(z.startTime, keep.start);
      const overlapEnd = Math.min(z.endTime, keep.end);
      if (overlapEnd - overlapStart <= EPS) {
        continue;
      }
      out.push({
        startTime: overlapStart - removedBefore(overlapStart),
        endTime: overlapEnd - removedBefore(overlapEnd),
        zoomLevel: z.zoomLevel,
        x: z.x,
        y: z.y,
      });
    }
  }

  return out
    .filter((z: ZoomRange) => z.endTime - z.startTime > EPS)
    .sort((a: ZoomRange, b: ZoomRange) => a.startTime - b.startTime);
}

function remapTextOverlaysToTrimmedTimeline(
  rawTextOverlays: any[],
  keepSegments: TimeRange[],
  removeSegments: TimeRange[]
): TextRange[] {
  if (!rawTextOverlays || rawTextOverlays.length === 0 || keepSegments.length === 0) {
    return [];
  }

  const removedBefore = buildRemovedBefore(removeSegments);
  const out: TextRange[] = [];
  const sorted = rawTextOverlays
    .map((t: any) => ({
      startTime: toSeconds(t.startTime),
      endTime: toSeconds(t.endTime),
      text: String(t.text ?? ""),
      x: Number(t.x),
      y: Number(t.y),
      fontSize: Number(t.fontSize),
      color: String(t.color ?? "#ffffff"),
    }))
    .filter(
      (t: TextRange) =>
        Number.isFinite(t.startTime) &&
        Number.isFinite(t.endTime) &&
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        Number.isFinite(t.fontSize)
    )
    .map((t: TextRange) => ({
      startTime: Math.min(t.startTime, t.endTime),
      endTime: Math.max(t.startTime, t.endTime),
      text: t.text,
      x: Math.max(0, Math.min(1, t.x)),
      y: Math.max(0, Math.min(1, t.y)),
      fontSize: Math.max(10, Math.min(160, Math.round(t.fontSize))),
      color: t.color,
    }))
    .filter((t: TextRange) => t.text.trim().length > 0 && t.endTime - t.startTime > EPS)
    .sort((a: TextRange, b: TextRange) => a.startTime - b.startTime);

  for (const t of sorted) {
    for (const keep of keepSegments) {
      const overlapStart = Math.max(t.startTime, keep.start);
      const overlapEnd = Math.min(t.endTime, keep.end);
      if (overlapEnd - overlapStart <= EPS) {
        continue;
      }
      out.push({
        startTime: overlapStart - removedBefore(overlapStart),
        endTime: overlapEnd - removedBefore(overlapEnd),
        text: t.text,
        x: t.x,
        y: t.y,
        fontSize: t.fontSize,
        color: t.color,
      });
    }
  }

  return out
    .filter((t: TextRange) => t.endTime - t.startTime > EPS)
    .sort((a: TextRange, b: TextRange) => a.startTime - b.startTime);
}

function ffmpegEscapeFilterValue(value: string): string {
  // FFmpeg filter args are ':'-separated; escape colons and backslashes.
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function normalizeHexColor(input: string, fallback = "white"): string {
  const s = (input || "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
    const hex = s.startsWith("#") ? s.slice(1) : s;
    return `#${hex.toLowerCase()}`;
  }
  if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
    const raw = s.startsWith("#") ? s.slice(1) : s;
    const expanded = raw
      .split("")
      .map((c) => `${c}${c}`)
      .join("");
    return `#${expanded.toLowerCase()}`;
  }
  return fallback;
}

function writeTextOverlayFiles(tempDir: string, overlays: TextRange[]): { path: string; overlay: TextRange }[] {
  return overlays.map((overlay, idx) => {
    const p = path.join(tempDir, `text-${idx}.txt`);
    // Keep it UTF-8; FFmpeg drawtext textfile supports it.
    fs.writeFileSync(p, overlay.text, "utf8");
    return { path: p, overlay };
  });
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({ url, method: "GET", responseType: "stream" });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({ url, method: "GET", responseType: "stream" });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function writeRoundedMaskPgm(
  outputPath: string,
  width: number,
  height: number,
  radius: number
): void {
  const w = Math.max(2, Math.floor(width));
  const h = Math.max(2, Math.floor(height));
  const r = Math.max(0, Math.min(Math.floor(radius), Math.floor(Math.min(w, h) / 2)));

  const header = Buffer.from(`P5\n${w} ${h}\n255\n`, "ascii");
  const pixels = Buffer.alloc(w * h);

  const halfW = w / 2;
  const halfH = h / 2;
  const innerHalfW = Math.max(0, halfW - r);
  const innerHalfH = Math.max(0, halfH - r);
  const r2 = r * r;

  let idx = 0;
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    const dy = Math.max(0, Math.abs(py - halfH) - innerHalfH);

    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const dx = Math.max(0, Math.abs(px - halfW) - innerHalfW);
      pixels[idx++] = dx * dx + dy * dy <= r2 ? 255 : 0;
    }
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, pixels]));
}

function runFfmpeg(command: any): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on("end", resolve)
      .on("error", (err: any, _stdout: any, stderr: any) => {
        console.error("FFmpeg Error:", err.message);
        if (stderr) {
          console.error("FFmpeg stderr:", stderr.slice(-3000));
        }
        reject(err);
      })
      .run();
  });
}

type SubtitleCue = { start: number; end: number; text: string };

function remapSubtitleCuesToTrimmedTimeline(
  rawCues: any[],
  keepSegments: TimeRange[],
  removeSegments: TimeRange[]
): SubtitleCue[] {
  if (!rawCues || rawCues.length === 0 || keepSegments.length === 0) {
    return [];
  }
  const removedBefore = buildRemovedBefore(removeSegments);
  const sorted = rawCues
    .map((c: any) => ({
      start: Number(c.start),
      end: Number(c.end),
      text: String(c.text ?? "").trim(),
    }))
    .filter((c: SubtitleCue) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.length > 0)
    .map((c: SubtitleCue) => ({
      start: Math.min(c.start, c.end),
      end: Math.max(c.start, c.end),
      text: c.text,
    }))
    .filter((c: SubtitleCue) => c.end - c.start > EPS)
    .sort((a: SubtitleCue, b: SubtitleCue) => a.start - b.start);

  const out: SubtitleCue[] = [];
  for (const cue of sorted) {
    for (const keep of keepSegments) {
      const overlapStart = Math.max(cue.start, keep.start);
      const overlapEnd = Math.min(cue.end, keep.end);
      if (overlapEnd - overlapStart <= EPS) {
        continue;
      }
      out.push({
        start: overlapStart - removedBefore(overlapStart),
        end: overlapEnd - removedBefore(overlapEnd),
        text: cue.text,
      });
    }
  }

  return out
    .map((c) => ({
      start: Math.max(0, c.start),
      end: Math.max(c.start + 0.04, c.end),
      text: c.text,
    }))
    .filter((c) => c.text.trim().length > 0 && c.end - c.start > 0.01)
    .sort((a, b) => a.start - b.start);
}

function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100); // centiseconds
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  // Basic ASS escaping. Keep it simple and deterministic.
  return String(text || "")
    .replace(/\r\n|\r|\n/g, "\\N")
    .replace(/{/g, "(")
    .replace(/}/g, ")");
}

function writeAssSubtitles(tempDir: string, cues: SubtitleCue[], w: number, h: number): string {
  const fontSize = Math.max(20, Math.min(58, Math.round(h * 0.05)));
  const marginV = Math.max(20, Math.min(96, Math.round(h * 0.06)));
  const outline = Math.max(1, Math.min(4, Math.round(fontSize / 16)));

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BackColour alpha included, but we keep BorderStyle=1 (outline) for speed; background box is optional.
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},0,2,60,60,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const lines = cues.map((c) => {
    const start = formatAssTime(c.start);
    const end = formatAssTime(c.end);
    const t = escapeAssText(c.text);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${t}`;
  });

  const assPath = path.join(tempDir, "subtitles.ass");
  fs.writeFileSync(assPath, `${header}\n${lines.join("\n")}\n`, "utf8");
  return assPath;
}

function pickBestMicAudioStreamIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any
): number | null {
  const audioStreams = (meta?.streams || []).filter((s: any) => s.codec_type === "audio");
  if (audioStreams.length === 0) {
    return null;
  }
  if (audioStreams.length === 1) {
    return Number(audioStreams[0].index);
  }

  // Best-effort mic selection: prefer streams whose tags mention mic/microphone.
  const micLike = audioStreams.find((s: any) => {
    const tags = s?.tags || {};
    const hay = `${tags.title || ""} ${tags.handler_name || ""} ${tags.language || ""}`.toLowerCase();
    return hay.includes("mic") || hay.includes("microphone");
  });
  return Number((micLike || audioStreams[0]).index);
}

async function extractAudioWav16kMono(
  inputPath: string,
  outputPath: string,
  audioStreamIndex: number | null
): Promise<void> {
  const cmd = ffmpeg(inputPath);
  const map = audioStreamIndex != null ? [`-map 0:${audioStreamIndex}`] : ["-map 0:a:0"];
  cmd
    .noVideo()
    .audioChannels(1)
    .audioFrequency(16000)
    .audioCodec("pcm_s16le")
    .outputOptions([...map])
    .output(outputPath);
  await runFfmpeg(cmd);
}

function buildSubtitleCuesFromDeepgramWords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  words: any[]
): SubtitleCue[] {
  if (!Array.isArray(words) || words.length === 0) {
    return [];
  }

  const cues: SubtitleCue[] = [];
  let buf: string[] = [];
  let cueStart = Number(words[0]?.start ?? 0);
  let cueEnd = Number(words[0]?.end ?? 0);

  const flush = () => {
    const text = buf.join(" ").trim();
    if (text) {
      cues.push({ start: cueStart, end: cueEnd, text });
    }
    buf = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordText = String(w?.punctuated_word ?? w?.word ?? "").trim();
    if (!wordText) {
      continue;
    }
    const start = Number(w?.start ?? cueEnd);
    const end = Number(w?.end ?? start);

    if (buf.length === 0) {
      cueStart = Number.isFinite(start) ? start : 0;
    }
    cueEnd = Number.isFinite(end) ? end : cueEnd;
    buf.push(wordText);

    const next = words[i + 1];
    const gap = next ? Number(next.start ?? cueEnd) - cueEnd : 0;
    const textLen = buf.join(" ").length;
    const endsSentence = /[.!?]$/.test(wordText);

    // Reasonable default grouping for "YouTube-like" captions.
    if (endsSentence || gap > 0.85 || textLen >= 48) {
      flush();
    }
  }
  flush();

  // Clamp super-short cues.
  return cues
    .map((c) => ({
      ...c,
      start: Math.max(0, c.start),
      end: Math.max(c.start + 0.04, c.end),
    }))
    .filter((c) => c.text.trim().length > 0 && c.end - c.start > 0.01);
}

async function transcribeWithDeepgram(wavPath: string, language: string): Promise<SubtitleCue[]> {
  const apiKey = (process.env.DEEPGRAM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing DEEPGRAM_API_KEY");
  }

  const audio = fs.readFileSync(wavPath);
  // NOTE: Deepgram "language=multi" is primarily documented for streaming/websocket.
  // For prerecorded REST transcription, use detect_language=true as the closest equivalent.
  const params = new URLSearchParams();
  params.set("model", "nova-2");
  params.set("smart_format", "true");
  params.set("punctuate", "true");
  const lang = String(language || "").trim().toLowerCase();
  if (lang && lang !== "multi") {
    params.set("language", lang);
  } else {
    params.set("detect_language", "true");
  }
  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

  const resp = await axios.post(url, audio, {
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "audio/wav",
    },
    timeout: 120000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = resp.data;
  const words =
    data?.results?.channels?.[0]?.alternatives?.[0]?.words ||
    data?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs?.flatMap((p: any) => p.words) ||
    [];

  return buildSubtitleCuesFromDeepgramWords(words);
}

function parseAspectRatioRatio(aspectRatio: string | null | undefined, fallback: number): number {
  if (!aspectRatio || aspectRatio === "native") {
    return fallback;
  }

  const [wStr, hStr] = aspectRatio.includes(":")
    ? aspectRatio.split(":")
    : aspectRatio.split("/");
  const w = Number(wStr);
  const h = Number(hStr);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return fallback;
  }

  return w / h;
}

function ensureEvenDimension(value: number): number {
  const v = Math.max(2, Math.round(value));
  return v % 2 === 0 ? v : v + 1;
}

function computeTargetSizeForRatio(quality: string, ratio: number): { width: number; height: number } {
  const longSide = quality === "720p" ? 1280 : 1920;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;

  let width: number;
  let height: number;
  if (safeRatio >= 1) {
    width = longSide;
    height = longSide / safeRatio;
  } else {
    width = longSide * safeRatio;
    height = longSide;
  }

  return {
    width: ensureEvenDimension(width),
    height: ensureEvenDimension(height),
  };
}

// ── Worker ─────────────────────────────────────────────────────────────────────
const worker = new Worker(
  "video-processing",
  async (job: Job) => {
    const jobStartTs = Date.now();
    const {
      jobId,
      videoUrl,
      segments,
      zoomEffects,
      textOverlays,
      subtitles,
      selectedBackground,
      customBackgroundUrl,
      settings,
      aspectRatio,
      demoId,
      browserFrame,
    } = job.data;

    const qSettings = settings || {
      quality: "720p",
      fps: "30 FPS",
      compression: "Web",
      speed: "Default",
    };
    let targetWidth = qSettings.quality === "720p" ? 1280 : 1920;
    let targetHeight = qSettings.quality === "720p" ? 720 : 1080;
    const targetFps = qSettings.fps === "60 FPS" ? 60 : 30;

    let overrideCrf = "18";
    // Keep CRF constant for quality parity, but use a faster default preset.
    // Preset trades compression for speed (quality target stays CRF-based).
    let overridePreset = "veryfast";
    if (qSettings.compression === "Ultra") {
      overrideCrf = "12";
      overridePreset = "slow";
    }
    if (qSettings.compression === "High") {
      overrideCrf = "14";
      overridePreset = "medium";
    }
    if (qSettings.compression === "Medium") {
      overrideCrf = "16";
      overridePreset = "medium";
    }

    // Extra safety: allow forcing the preset via env for benchmarking.
    const forcedPreset = process.env.FFMPEG_X264_PRESET?.trim();
    if (forcedPreset) {
      overridePreset = forcedPreset;
    }

    const picked = pickVideoEncoder(process.env.FFMPEG_VIDEO_CODEC);
    const videoEncoder =
      picked.available ? picked.encoder : process.platform === "darwin" ? "libx264" : "libx264";
    console.log(
      `[${jobId}] Encoder selection: requested=${process.env.FFMPEG_VIDEO_CODEC || "auto"} ` +
        `picked=${picked.encoder} available=${picked.available} using=${videoEncoder}`
    );

    // Parallelize filter evaluation (especially helps with zoompan + overlays).
    const filterThreadsEnv = parseInt(process.env.FFMPEG_FILTER_THREADS || "", 10);
    const filterThreads = Number.isFinite(filterThreadsEnv) && filterThreadsEnv > 0
      ? filterThreadsEnv
      : Math.max(1, Math.min(8, os.cpus().length || 4));

    let speedFactor = 1.0;
    if (qSettings.speed === "0.75") {
      speedFactor = 0.75;
    }
    if (qSettings.speed === "1.25") {
      speedFactor = 1.25;
    }
    if (qSettings.speed === "1.5") {
      speedFactor = 1.5;
    }
    if (qSettings.speed === "1.75") {
      speedFactor = 1.75;
    }
    if (qSettings.speed === "2") {
      speedFactor = 2.0;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vj-${jobId}-`));
    const inputPath = path.join(tempDir, "input.webm");
    const bgPath = path.join(tempDir, "background.png");
    const outputPath = path.join(tempDir, "output.mp4");
    const roundedMaskPath = path.join(tempDir, "rounded-mask.pgm");
    const hasCustomBackground = selectedBackground === "custom" && !!customBackgroundUrl;

    try {
      await withRetry(() =>
        prisma.videoJob.update({
          where: { id: jobId },
          data: { status: "PROCESSING", progress: 5 },
        })
      );
      await job.updateProgress(5);

      // ── 1. Download ──────────────────────────────────────────────────────────
      console.log(`[${jobId}] Downloading...`);
      const downloadStartTs = Date.now();
      await downloadVideo(videoUrl, inputPath);
      if (hasCustomBackground) {
        console.log(`[${jobId}] Downloading custom background...`);
        await downloadFile(customBackgroundUrl, bgPath);
      }
      console.log(`[${jobId}] Download completed in ${Date.now() - downloadStartTs}ms`);
      await job.updateProgress(20);
      await withRetry(() =>
        prisma.videoJob.update({ where: { id: jobId }, data: { progress: 20 } })
      );

      // ── 2. Probe ─────────────────────────────────────────────────────────────
      const probeStartTs = Date.now();
      const { hasAudio, videoDuration, sourceWidth, sourceHeight } = await new Promise<{
        hasAudio: boolean;
        videoDuration: number;
        sourceWidth: number;
        sourceHeight: number;
      }>((res, rej) => {
        ffmpeg.ffprobe(inputPath, (err, meta) => {
          if (err) {
            return rej(err);
          }
          const videoStream = meta.streams.find((s) => s.codec_type === "video");
          res({
            hasAudio: meta.streams.some((s) => s.codec_type === "audio"),
            videoDuration: meta.format.duration || 0,
            sourceWidth: Number(videoStream?.width || 0),
            sourceHeight: Number(videoStream?.height || 0),
          });
        });
      });
      const nativeRatio =
        sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
      const selectedRatio = parseAspectRatioRatio(aspectRatio, nativeRatio);
      const computedTarget = computeTargetSizeForRatio(qSettings.quality, selectedRatio);
      targetWidth = computedTarget.width;
      targetHeight = computedTarget.height;

      console.log(
        `[${jobId}] Duration=${videoDuration}s hasAudio=${hasAudio} source=${sourceWidth}x${sourceHeight} ` +
        `aspect=${aspectRatio || "native"} target=${targetWidth}x${targetHeight}`
      );
      console.log(`[${jobId}] Probe completed in ${Date.now() - probeStartTs}ms`);

      // ── 3. Build edit timeline (deterministic trim + remapped zoom) ──────────
      // segments = array of REMOVE regions from timeline
      const removeSegments = normalizeRemoveSegments(segments || [], videoDuration);
      const keepSegments = invertToKeepSegments(removeSegments, videoDuration);
      const trimmedDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
      const hasTrimEdits =
        keepSegments.length > 0 &&
        !(
          keepSegments.length === 1 &&
          keepSegments[0].start <= EPS &&
          Math.abs(keepSegments[0].end - videoDuration) <= EPS
        );

      if (keepSegments.length === 0) {
        throw new Error("All video content was trimmed out. Keep at least a small range.");
      }

      const remappedZoomEffects = remapZoomEffectsToTrimmedTimeline(
        zoomEffects || [],
        keepSegments,
        removeSegments
      );
      const remappedTextOverlays = remapTextOverlaysToTrimmedTimeline(
        textOverlays || [],
        keepSegments,
        removeSegments
      );
      let rawSubtitleCues: SubtitleCue[] = [];
      if (Array.isArray(subtitles)) {
        rawSubtitleCues = subtitles as SubtitleCue[];
      } else if (subtitles && Array.isArray((subtitles as any).cues)) {
        rawSubtitleCues = (subtitles as any).cues as SubtitleCue[];
      } else if (demoId) {
        try {
          const demo = await prisma.demo.findUnique({
            where: { id: String(demoId) },
            select: { subtitles: true },
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s: any = demo?.subtitles;
          if (s && Array.isArray(s.cues)) {
            rawSubtitleCues = s.cues as SubtitleCue[];
          }
        } catch {
          // Ignore subtitle lookup failures; export should still proceed.
        }
      }
      const remappedSubtitleCues = remapSubtitleCuesToTrimmedTimeline(
        rawSubtitleCues || [],
        keepSegments,
        removeSegments
      );

      await job.updateProgress(50);
      await prisma.videoJob.update({ where: { id: jobId }, data: { progress: 50 } });
      console.log(
        `[${jobId}] Trim ranges remove=${removeSegments.length} keep=${keepSegments.length} ` +
          `trimmedDuration=${trimmedDuration.toFixed(3)}s zoom=${remappedZoomEffects.length} text=${remappedTextOverlays.length} subtitles=${remappedSubtitleCues.length}`
      );

      // ── 4. Final encode pass: trim + zoom + background + speed ───────────────
      const filters: string[] = [];
      let videoOut = "[0:v]";
      let audioOut = hasAudio ? "[0:a]" : null;

      if (hasTrimEdits) {
        const n = keepSegments.length;
        const vSplits = Array.from({ length: n }, (_, i) => `[tvs${i}]`).join("");
        filters.push(`${videoOut}split=${n}${vSplits}`);
        if (hasAudio && audioOut) {
          const aSplits = Array.from({ length: n }, (_, i) => `[tas${i}]`).join("");
          filters.push(`${audioOut}asplit=${n}${aSplits}`);
        }

        let trimConcatIn = "";
        for (let i = 0; i < n; i++) {
          const seg = keepSegments[i];
          filters.push(
            `[tvs${i}]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[tvseg${i}]`
          );
          if (hasAudio && audioOut) {
            filters.push(
              `[tas${i}]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[taseg${i}]`
            );
            trimConcatIn += `[tvseg${i}][taseg${i}]`;
          } else {
            trimConcatIn += `[tvseg${i}]`;
          }
        }

        const trimOut = hasAudio && audioOut ? "[trimv][trima]" : "[trimv]";
        const trimAStr = hasAudio && audioOut ? ":a=1" : ":a=0";
        filters.push(`${trimConcatIn}concat=n=${n}:v=1${trimAStr}${trimOut}`);
        videoOut = "[trimv]";
        if (hasAudio && audioOut) {
          audioOut = "[trima]";
        }
      }

      // Normalize FPS once in filter graph for deterministic timing
      filters.push(`${videoOut}fps=${targetFps}:round=near[fpsnorm]`);
      videoOut = "[fpsnorm]";

      const hasBackgroundCanvas =
        !!selectedBackground &&
        selectedBackground !== "hidden" &&
        selectedBackground !== "none" &&
        selectedBackground !== "transparent";
      const drawCardShadow = Boolean(browserFrame?.drawShadow);
      const drawCardBorder = Boolean(browserFrame?.drawBorder);
      const previewPadColor = hasBackgroundCanvas ? "0xF1ECFF" : "black";

      // Preserve full source frame for all aspect ratios.
      // This avoids hidden crop when converting landscape recordings to portrait outputs.
      filters.push(
        `${videoOut}scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos,` +
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:${previewPadColor},setsar=1[res]`
      );
      videoOut = "[res]";

      // Zoom: split → per-segment trim+crop → concat
      if (remappedZoomEffects.length > 0) {
        const sortedZooms = [...remappedZoomEffects].sort(
          (a: any, b: any) => a.startTime - b.startTime
        );

        type ZSeg = { start: number; end: number; zoom?: { level: number; x: number; y: number } };
        const zSegs: ZSeg[] = [];
        let zCur = 0;
        for (const z of sortedZooms) {
          const start = Math.max(0, Math.min(trimmedDuration, z.startTime));
          const end = Math.max(0, Math.min(trimmedDuration, z.endTime));
          if (end - start <= EPS) {
            continue;
          }
          if (zCur < start - EPS) {
            zSegs.push({ start: zCur, end: start });
          }
          const segStart = Math.max(zCur, start);
          if (end - segStart > EPS) {
            zSegs.push({ start: segStart, end, zoom: { level: z.zoomLevel, x: z.x, y: z.y } });
            zCur = end;
          }
        }
        if (zCur < trimmedDuration - EPS) {
          zSegs.push({ start: zCur, end: trimmedDuration });
        }

        const n = zSegs.length;
        if (n > 0) {
          const vSplits = Array.from({ length: n }, (_, i) => `[vs${i}]`).join("");
          filters.push(`${videoOut}split=${n}${vSplits}`);

          let concatIn = "";
          for (let i = 0; i < n; i++) {
            const seg = zSegs[i];

            if (seg.zoom) {
              const duration = Math.max(EPS, seg.end - seg.start);
              const rawLevel = Math.max(1.0, seg.zoom.level);
              // Frontend scale feels softer than raw crop-zoom; compress range for parity.
              const level = 1 + (rawLevel - 1) * 0.8;
              const focusX = Math.max(0, Math.min(1, seg.zoom.x));
              const focusY = Math.max(0, Math.min(1, seg.zoom.y));
              const totalFrames = Math.max(2, Math.round(duration * targetFps));
              const rampFrames = Math.max(
                1,
                Math.min(Math.round(targetFps * 0.35), Math.floor(totalFrames / 2))
              );
              const holdEndFrame = Math.max(rampFrames, totalFrames - rampFrames);

              // Smooth zoom profile (ease in -> hold -> ease out), clamped to avoid overshoot.
              const easeInExpr = `pow(min(1,max(0,on/${rampFrames})),2)*(3-2*min(1,max(0,on/${rampFrames})))`;
              const easeOutExpr = `pow(min(1,max(0,(${totalFrames}-on)/${rampFrames})),2)*(3-2*min(1,max(0,(${totalFrames}-on)/${rampFrames})))`;
              const zExpr =
                `if(lte(on,${rampFrames}),` +
                `1+(${(level - 1).toFixed(4)})*(${easeInExpr}),` +
                `if(lte(on,${holdEndFrame}),` +
                `${level.toFixed(4)},` +
                `1+(${(level - 1).toFixed(4)})*(${easeOutExpr})` +
                ")" +
                ")";
              const xExpr = `min(max(iw*${focusX.toFixed(4)}-iw/zoom/2,0),iw-iw/zoom)`;
              const yExpr = `min(max(ih*${focusY.toFixed(4)}-ih/zoom/2,0),ih-ih/zoom)`;

              filters.push(
                `[vs${i}]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS,` +
                  `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:` +
                  `s=${targetWidth}x${targetHeight}:fps=${targetFps}[zseg${i}]`
              );
            } else {
              filters.push(
                `[vs${i}]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[zseg${i}]`
              );
            }
            concatIn += `[zseg${i}]`;
          }

          filters.push(`${concatIn}concat=n=${n}:v=1:a=0[zoomv]`);
          videoOut = "[zoomv]";
        }
      }

      // Background overlay (square video card for speed).
      // Rounded corners were intentionally disabled to reduce filter/alpha overhead.
      if (hasBackgroundCanvas) {
        let bgHex = "#f3f0fc";
        const palette: Record<string, string> = {
          "gradient:sunset": "#f5576c",
          "gradient:ocean": "#667eea",
          "gradient:mint": "#a8edea",
          "gradient:royal": "#764ba2",
          "gradient:steel": "#2c3e50",
          "gradient:candy": "#fa709a",
          // Light approximations of frontend decorative backgrounds.
          bg1: "#eef1fb",
          bg2: "#f5efff",
          bg3: "#edf4ff",
          bg4: "#f8f0ea",
          bg5: "#fdf2e8",
          bg6: "#ecf7f3",
          bg7: "#fff1eb",
          bg8: "#f4effd",
        };
        if (selectedBackground?.startsWith("color:")) {
          bgHex = selectedBackground.replace("color:", "");
        } else if (palette[selectedBackground]) {
          bgHex = palette[selectedBackground];
        }

        // Match frontend framing with an inset card over canvas.
        const cardW = Math.max(2, Math.floor((targetWidth * 0.9) / 2) * 2);
        const cardH = Math.max(2, Math.floor((targetHeight * 0.9) / 2) * 2);
        const borderFilter = drawCardBorder
          ? ",drawbox=x=0:y=0:w=iw:h=ih:color=white@0.95:t=9"
          : "";

        if (hasCustomBackground) {
          const customBgFilter =
            `[1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase:flags=lanczos,` +
            `crop=${targetWidth}:${targetHeight},loop=loop=-1:size=1:start=0,fps=${targetFps},` +
            "setsar=1,format=yuv420p[bg]";
          const cardFilter =
            `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=yuv420p${borderFilter}[svid]`;

          if (drawCardShadow) {
            // Build a proper soft drop shadow (no hard black bars):
            // draw a smaller filled rect on a transparent canvas, blur it at low-res, then scale up.
            const spread = Math.max(10, Math.round(Math.min(cardW, cardH) * 0.02));
            const baseW = 320;
            const baseH = Math.max(180, Math.round((baseW * cardH) / Math.max(1, cardW)));
            const baseSpread = 20;
            // Important: keep an alpha channel through the shadow pipeline.
            // If we stay in yuv420p, the "@0.0" alpha is lost and the shadow becomes a solid dark plate.
            const shadowSrc =
              `color=c=black@0.0:s=${baseW + baseSpread * 2}x${baseH + baseSpread * 2}:r=${targetFps},` +
              "format=rgba[sh0]";
            const shadowFx =
              `[sh0]drawbox=x=${baseSpread}:y=${baseSpread}:w=${baseW}:h=${baseH}:` +
              `color=black@0.30:t=fill,boxblur=14:1,` +
              `scale=${cardW + spread * 2}:${cardH + spread * 2}:flags=bicubic,format=rgba[sh]`;
            filters.push(
              `${customBgFilter};${shadowSrc};${shadowFx};${cardFilter};` +
                "[bg][sh]overlay=(W-w)/2+6:(H-h)/2+10:format=auto[bgsh];" +
                "[bgsh][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
            );
          } else {
            filters.push(
              `${customBgFilter};${cardFilter};` +
                "[bg][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
            );
          }
        } else {
          const solidBgFilter =
            `color=c=${bgHex}:s=${targetWidth}x${targetHeight}:r=${targetFps}[bg]`;
          const cardFilter =
            `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=yuv420p${borderFilter}[svid]`;

          if (drawCardShadow) {
            const spread = Math.max(10, Math.round(Math.min(cardW, cardH) * 0.02));
            const baseW = 320;
            const baseH = Math.max(180, Math.round((baseW * cardH) / Math.max(1, cardW)));
            const baseSpread = 20;
            const shadowSrc =
              `color=c=black@0.0:s=${baseW + baseSpread * 2}x${baseH + baseSpread * 2}:r=${targetFps},` +
              "format=rgba[sh0]";
            const shadowFx =
              `[sh0]drawbox=x=${baseSpread}:y=${baseSpread}:w=${baseW}:h=${baseH}:` +
              `color=black@0.30:t=fill,boxblur=14:1,` +
              `scale=${cardW + spread * 2}:${cardH + spread * 2}:flags=bicubic,format=rgba[sh]`;
            filters.push(
              `${solidBgFilter};${shadowSrc};${shadowFx};${cardFilter};` +
                "[bg][sh]overlay=(W-w)/2+6:(H-h)/2+10:format=auto[bgsh];" +
                "[bgsh][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
            );
          } else {
            filters.push(
              `${solidBgFilter};${cardFilter};` +
                "[bg][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
            );
          }
        }
        videoOut = "[bgout]";
      }

      // Text overlays (single-pass, only during enable windows).
      if (remappedTextOverlays.length > 0) {
        const textFiles = writeTextOverlayFiles(tempDir, remappedTextOverlays);
        let prev = videoOut;
        textFiles.forEach(({ path: filePath, overlay }, idx) => {
          const next = `[txt${idx}]`;
          const safeFile = ffmpegEscapeFilterValue(filePath);
          const safeColor = normalizeHexColor(overlay.color, "white");
          const start = Math.max(0, overlay.startTime);
          const end = Math.max(start + EPS, overlay.endTime);
          const size = Math.max(10, Math.min(160, Math.round(overlay.fontSize)));
          const nx = Math.max(0, Math.min(1, overlay.x));
          const ny = Math.max(0, Math.min(1, overlay.y));

          // Position is normalized; keep it centered on the point like the editor.
          const xExpr = `(w*${nx.toFixed(4)}-text_w/2)`;
          const yExpr = `(h*${ny.toFixed(4)}-text_h/2)`;

          filters.push(
            `${prev}drawtext=textfile=${safeFile}:reload=0:` +
              `fontsize=${size}:fontcolor=${safeColor}:` +
              `x='${xExpr}':y='${yExpr}':` +
              `shadowcolor=black@0.55:shadowx=1:shadowy=1:` +
              `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`
          );
          prev = next;
        });
        videoOut = prev;
      }

      // Subtitles (burn-in) using an ASS file for fast, high-quality rendering.
      if (remappedSubtitleCues.length > 0) {
        const assPath = writeAssSubtitles(tempDir, remappedSubtitleCues, targetWidth, targetHeight);
        const safeAss = ffmpegEscapeFilterValue(assPath);
        filters.push(`${videoOut}subtitles=${safeAss}[subv]`);
        videoOut = "[subv]";
      }

      // Speed adjustment
      if (speedFactor !== 1.0) {
        const pts = (1 / speedFactor).toFixed(4);
        filters.push(`${videoOut}setpts=${pts}*PTS[speedv]`);
        videoOut = "[speedv]";
        if (hasAudio && audioOut) {
          filters.push(`${audioOut}atempo=${speedFactor}[speeda]`);
          audioOut = "[speeda]";
        }
      }

      const filterStr = filters.join(";");
      console.log(`[${jobId}] Final filter:\n${filterStr}\n`);

      // For -map: named pads keep brackets, raw stream specifiers (e.g. [0:a]) strip them
      const toMapArg = (pad: string) => pad.replace(/^\[(\d+:[av])\]$/, "$1");

      const maps = [`-map ${toMapArg(videoOut)}`];
      if (hasAudio && audioOut) {
        maps.push(`-map ${toMapArg(audioOut)}`);
      }

      const finalCmd = ffmpeg(inputPath);
      // Hardware-accelerated decode can help on M1 for long clips.
      // Safe: if unsupported, FFmpeg will fail; keep it opt-in via env.
      const hwDecode = (process.env.FFMPEG_HW_DECODE || "").trim();
      if (hwDecode) {
        finalCmd.inputOptions([`-hwaccel ${hwDecode}`]);
      }
      if (hasCustomBackground) {
        finalCmd.input(bgPath);
      }
      finalCmd
        .on("start", (cmdLine) => {
          console.log(`[${jobId}] FFmpeg command: ${cmdLine}`);
        })
        .complexFilter(filterStr)
        .videoCodec(videoEncoder)
        .audioCodec("aac")
        .outputOptions([
          ...maps,
          `-filter_complex_threads ${filterThreads}`,
          "-shortest",
          "-pix_fmt yuv420p",
          "-vsync cfr",
          `-g ${targetFps * 2}`,
          "-threads 0",
          `-t ${Math.max(0.1, trimmedDuration / speedFactor).toFixed(3)}`,
          // Encoder tuning:
          // - For libx264: CRF-based quality (no behavioral change vs today).
          // - For hardware encoders: use a high-quality constant-quality style where supported.
          ...(videoEncoder === "libx264"
            ? [`-preset ${overridePreset}`, `-crf ${overrideCrf}`]
            : videoEncoder === "h264_videotoolbox"
              ? [
                  // VideoToolbox does not support CRF; use a conservative quality scale.
                  // Lower is better; 50 is visually high quality for 720p.
                  "-q:v 50",
                  "-profile:v high",
                ]
              : videoEncoder === "h264_nvenc"
                ? [
                    // NVENC: prefer constant-quality (CQ) style.
                    // CQ lower = higher quality. 19 approximates CRF~18 for many sources.
                    "-rc vbr_hq",
                    "-cq 19",
                    "-b:v 0",
                    "-profile:v high",
                    "-preset p5",
                  ]
                : []),
          "-movflags +faststart",
        ])
        .output(outputPath)
        .on("progress", (p) => {
          const pct = Math.min(Math.floor(50 + (p.percent || 0) * 0.45), 95);
          job.updateProgress(pct).catch(() => {});
          prisma.videoJob.update({ where: { id: jobId }, data: { progress: pct } }).catch(() => {});
        });

      const encodeStartTs = Date.now();
      await runFfmpeg(finalCmd);
      console.log(`[${jobId}] Encode completed in ${Date.now() - encodeStartTs}ms`);
      console.log(`[${jobId}] Encode done. Uploading to Cloudinary...`);

      await job.updateProgress(90);
      await prisma.videoJob.update({ where: { id: jobId }, data: { progress: 90 } });

      // ── 5. Upload ─────────────────────────────────────────────────────────────
      const uploadStartTs = Date.now();
      const uploadResult = await cloudinary.uploader.upload(outputPath, {
        resource_type: "video",
        folder: "processed_exports",
      });
      console.log(`[${jobId}] Upload completed in ${Date.now() - uploadStartTs}ms`);
      const exportedUrl = uploadResult.secure_url;

      await job.updateProgress(100);
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: "COMPLETED", progress: 100, exportedUrl },
      });

      console.log(`[${jobId}] ✅ Done: ${exportedUrl}`);
      console.log(`[${jobId}] Total job time: ${Date.now() - jobStartTs}ms`);
    } catch (error: any) {
      console.error(`[${jobId}] ❌ Failed:`, error.message);
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: error.message },
      });
      throw error;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
  {
    connection: connection as any,
    concurrency: workerConcurrency,
  }
);

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed: ${err.message}`);
});

console.log(`🎬 Video Worker running and waiting for jobs (concurrency=${workerConcurrency})...`);

// ── Subtitle Worker (Deepgram) ────────────────────────────────────────────────
const subtitleConcurrency = Math.max(
  1,
  parseInt(process.env.SUBTITLE_WORKER_CONCURRENCY || "1", 10) || 1
);

const subtitleWorker = new Worker(
  "subtitle-processing",
  async (job: Job) => {
    const { jobId, videoUrl, demoId, language } = job.data;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `stt-${jobId}-`));
    const inputPath = path.join(tempDir, "input.webm");
    const wavPath = path.join(tempDir, "audio.wav");

    try {
      await withRetry(() =>
        prisma.videoJob.update({
          where: { id: jobId },
          data: { status: "PROCESSING", progress: 5 },
        })
      );
      await job.updateProgress(5);

      await downloadVideo(videoUrl, inputPath);
      await job.updateProgress(25);
      await withRetry(() => prisma.videoJob.update({ where: { id: jobId }, data: { progress: 25 } }));

      // Probe for best-effort mic stream selection.
      const meta = await new Promise<any>((res, rej) => {
        ffmpeg.ffprobe(inputPath, (err, m) => (err ? rej(err) : res(m)));
      });
      const micIdx = pickBestMicAudioStreamIndex(meta);

      await extractAudioWav16kMono(inputPath, wavPath, micIdx);
      await job.updateProgress(55);
      await withRetry(() => prisma.videoJob.update({ where: { id: jobId }, data: { progress: 55 } }));

      const cues = await transcribeWithDeepgram(wavPath, String(language || "multi"));

      if (demoId) {
        await prisma.demo.update({
          where: { id: demoId },
          data: {
            subtitles: {
              provider: "deepgram",
              language: String(language || "multi"),
              cues,
            },
          },
        });
      }

      await prisma.videoJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          jobData: {
            kind: "SUBTITLES",
            provider: "deepgram",
            language: String(language || "multi"),
            subtitles: cues,
          },
        },
      });
      await job.updateProgress(100);
    } catch (error: any) {
      console.error(`[${jobId}] ❌ Subtitle job failed:`, error?.message || error);
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: error?.message || "Subtitle generation failed" },
      });
      throw error;
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
  {
    connection: connection as any,
    concurrency: subtitleConcurrency,
  }
);

subtitleWorker.on("failed", (job, err) => {
  console.log(`Subtitle job ${job?.id} failed: ${err.message}`);
});

console.log(`📝 Subtitle Worker ready (concurrency=${subtitleConcurrency})...`);
