/* eslint-disable @typescript-eslint/no-explicit-any */
import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { v2 as cloudinary } from "cloudinary";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import "dotenv/config";

// ── Setup ──────────────────────────────────────────────────────────────────────
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
      selectedBackground,
      customBackgroundUrl,
      settings,
      aspectRatio,
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
    let overridePreset = "fast";
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

    let speedFactor = 1.0;
    if (qSettings.speed === "1.25") {
      speedFactor = 1.25;
    }
    if (qSettings.speed === "1.5") {
      speedFactor = 1.5;
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

      await job.updateProgress(50);
      await prisma.videoJob.update({ where: { id: jobId }, data: { progress: 50 } });
      console.log(
        `[${jobId}] Trim ranges remove=${removeSegments.length} keep=${keepSegments.length} ` +
          `trimmedDuration=${trimmedDuration.toFixed(3)}s zoom=${remappedZoomEffects.length}`
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

      // Background overlay with rounded video card (static mask; avoids costly per-frame geq ops).
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
        const cornerRadius = Math.max(12, Math.round(Math.min(cardW, cardH) * 0.04));
        writeRoundedMaskPgm(roundedMaskPath, cardW, cardH, cornerRadius);
        const roundedMaskInputIdx = hasCustomBackground ? 2 : 1;
        const roundedMaskFilter =
          `[${roundedMaskInputIdx}:v]scale=${cardW}:${cardH}:flags=neighbor,format=gray,` +
          `loop=loop=-1:size=1:start=0,fps=${targetFps}[roundmask]`;

        if (hasCustomBackground) {
          const customBgFilter =
            `[1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase:flags=lanczos,` +
            `crop=${targetWidth}:${targetHeight},loop=loop=-1:size=1:start=0,fps=${targetFps},` +
            "setsar=1,format=yuv420p[bg]";
          const cardFilter =
            `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=rgba[svidbase]`;

          filters.push(
            `${customBgFilter};${cardFilter};${roundedMaskFilter};` +
              "[svidbase][roundmask]alphamerge[svid];" +
              "[bg][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
          );
        } else {
          const solidBgFilter =
            `color=c=${bgHex}:s=${targetWidth}x${targetHeight}:r=${targetFps}[bg]`;
          const cardFilter =
            `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=rgba[svidbase]`;

          filters.push(
            `${solidBgFilter};${cardFilter};${roundedMaskFilter};` +
              "[svidbase][roundmask]alphamerge[svid];" +
              "[bg][svid]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[bgout]"
          );
        }
        videoOut = "[bgout]";
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
      if (hasCustomBackground) {
        finalCmd.input(bgPath);
      }
      if (hasBackgroundCanvas) {
        finalCmd.input(roundedMaskPath);
      }
      finalCmd
        .on("start", (cmdLine) => {
          console.log(`[${jobId}] FFmpeg command: ${cmdLine}`);
        })
        .complexFilter(filterStr)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions([
          ...maps,
          "-shortest",
          "-pix_fmt yuv420p",
          "-vsync cfr",
          `-g ${targetFps * 2}`,
          "-threads 0",
          `-t ${Math.max(0.1, trimmedDuration / speedFactor).toFixed(3)}`,
          `-preset ${overridePreset}`,
          `-crf ${overrideCrf}`,
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
