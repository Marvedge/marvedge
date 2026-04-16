"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");
const ffmpeg = require("fluent-ffmpeg");

ffmpeg.setFfmpegPath("/usr/bin/ffmpeg");
ffmpeg.setFfprobePath("/usr/bin/ffprobe");

const EPS = 0.001;

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    command
      .on("end", resolve)
      .on("error", (err, _stdout, stderr) => {
        console.error("FFmpeg Error:", err?.message || err);
        if (stderr) {
          console.error("FFmpeg stderr:", String(stderr).slice(-3000));
        }
        reject(err);
      })
      .run();
  });
}

function toSeconds(t) {
  if (typeof t === "number") {
    return t;
  }
  const s = String(t || "");
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }
  return Number.parseFloat(s);
}

function ensureEvenDimension(value) {
  const n = Math.max(2, Math.round(value));
  return n % 2 === 0 ? n : n - 1;
}

function parseAspectRatioRatio(aspectRatio, nativeRatio) {
  if (!aspectRatio || aspectRatio === "native") {
    return nativeRatio;
  }
  const map = {
    "16:9": 16 / 9,
    "1:1": 1,
    "4:5": 4 / 5,
    "9:16": 9 / 16,
    "3:4": 3 / 4,
  };
  return map[aspectRatio] || nativeRatio;
}

function computeTargetSizeForRatio(quality, ratio) {
  let longSide = quality === "1080p" ? 1920 : 1280;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  if (quality !== "1080p" && Math.abs(safeRatio - 1) < 0.001) {
    longSide = 960;
  }
  let width;
  let height;

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

function normalizeRemoveSegments(rawSegments, duration) {
  if (!rawSegments || rawSegments.length === 0) {
    return [];
  }

  const cleaned = rawSegments
    .map((s) => ({ start: toSeconds(s.start), end: toSeconds(s.end) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
    .map((s) => ({
      start: Math.max(0, Math.min(duration, Math.min(s.start, s.end))),
      end: Math.max(0, Math.min(duration, Math.max(s.start, s.end))),
    }))
    .filter((s) => s.end - s.start > EPS)
    .sort((a, b) => a.start - b.start);

  if (cleaned.length === 0) {
    return [];
  }

  const merged = [cleaned[0]];
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

function invertToKeepSegments(removeSegments, duration) {
  if (duration <= EPS) {
    return [];
  }
  if (removeSegments.length === 0) {
    return [{ start: 0, end: duration }];
  }

  const keep = [];
  let cursor = 0;
  for (const s of removeSegments) {
    if (cursor < s.start - EPS) {
      keep.push({ start: cursor, end: s.start });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < duration - EPS) {
    keep.push({ start: cursor, end: duration });
  }
  return keep.filter((s) => s.end - s.start > EPS);
}

function buildRemovedBefore(removeSegments) {
  return (time) => {
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

function remapZoomEffectsToTrimmedTimeline(rawZoomEffects, keepSegments, removeSegments) {
  if (!rawZoomEffects || rawZoomEffects.length === 0 || keepSegments.length === 0) {
    return [];
  }

  const removedBefore = buildRemovedBefore(removeSegments);
  const out = [];
  const sortedZooms = rawZoomEffects
    .map((z) => ({
      startTime: toSeconds(z.startTime),
      endTime: toSeconds(z.endTime),
      zoomLevel: Number(z.zoomLevel),
      x: Number(z.x),
      y: Number(z.y),
    }))
    .filter(
      (z) =>
        Number.isFinite(z.startTime) &&
        Number.isFinite(z.endTime) &&
        Number.isFinite(z.zoomLevel) &&
        Number.isFinite(z.x) &&
        Number.isFinite(z.y)
    )
    .map((z) => ({
      startTime: Math.min(z.startTime, z.endTime),
      endTime: Math.max(z.startTime, z.endTime),
      zoomLevel: Math.max(1.0, z.zoomLevel),
      x: Math.max(0, Math.min(1, z.x)),
      y: Math.max(0, Math.min(1, z.y)),
    }))
    .filter((z) => z.endTime - z.startTime > EPS)
    .sort((a, b) => a.startTime - b.startTime);

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

  return out.filter((z) => z.endTime - z.startTime > EPS).sort((a, b) => a.startTime - b.startTime);
}

function remapTextOverlaysToTrimmedTimeline(rawTextOverlays, keepSegments, removeSegments) {
  if (!rawTextOverlays || rawTextOverlays.length === 0 || keepSegments.length === 0) {
    return [];
  }

  const removedBefore = buildRemovedBefore(removeSegments);
  const out = [];
  const sorted = rawTextOverlays
    .map((t) => ({
      startTime: toSeconds(t.startTime),
      endTime: toSeconds(t.endTime),
      text: String(t.text ?? ""),
      x: Number(t.x),
      y: Number(t.y),
      fontSize: Number(t.fontSize),
      color: String(t.color ?? "#ffffff"),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.startTime) &&
        Number.isFinite(t.endTime) &&
        Number.isFinite(t.x) &&
        Number.isFinite(t.y) &&
        Number.isFinite(t.fontSize)
    )
    .map((t) => ({
      startTime: Math.min(t.startTime, t.endTime),
      endTime: Math.max(t.startTime, t.endTime),
      text: t.text,
      x: Math.max(0, Math.min(1, t.x)),
      y: Math.max(0, Math.min(1, t.y)),
      fontSize: Math.max(10, Math.min(160, Math.round(t.fontSize))),
      color: t.color,
    }))
    .filter((t) => t.text.trim().length > 0 && t.endTime - t.startTime > EPS)
    .sort((a, b) => a.startTime - b.startTime);

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

  return out.filter((t) => t.endTime - t.startTime > EPS).sort((a, b) => a.startTime - b.startTime);
}

function remapSubtitleCuesToTrimmedTimeline(rawCues, keepSegments, removeSegments) {
  if (!rawCues || rawCues.length === 0 || keepSegments.length === 0) {
    return [];
  }

  const removedBefore = buildRemovedBefore(removeSegments);
  const sorted = rawCues
    .map((c) => ({
      start: Number(c.start),
      end: Number(c.end),
      text: String(c.text ?? "").trim(),
    }))
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.length > 0)
    .map((c) => ({
      start: Math.min(c.start, c.end),
      end: Math.max(c.start, c.end),
      text: c.text,
    }))
    .filter((c) => c.end - c.start > EPS)
    .sort((a, b) => a.start - b.start);

  const out = [];
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

function ffmpegEscapeFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function normalizeHexColor(input, fallback = "white") {
  const s = String(input || "").trim();
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

function writeTextOverlayFiles(tempDir, overlays) {
  return overlays.map((overlay, idx) => {
    const p = path.join(tempDir, `text-${idx}.txt`);
    fs.writeFileSync(p, overlay.text, "utf8");
    return { path: p, overlay };
  });
}

function formatAssTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text) {
  return String(text || "")
    .replace(/\r\n|\r|\n/g, "\\N")
    .replace(/{/g, "(")
    .replace(/}/g, ")");
}

function writeAssSubtitles(tempDir, cues, w, h) {
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

function parseChunkIndex(chunkId) {
  const m = String(chunkId || "").match(/_chunk_(\d+)(?:\.\w+)?$/);
  return m ? Number.parseInt(m[1], 10) || 0 : 0;
}

function overlapSliceAbsolute(items, chunkStart, chunkEnd, mapItem) {
  const out = [];
  for (const item of items || []) {
    const normalized = mapItem(item);
    const start = Number(normalized.start);
    const end = Number(normalized.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    const os = Math.max(start, chunkStart);
    const oe = Math.min(end, chunkEnd);
    if (oe - os <= EPS) {
      continue;
    }
    out.push({ ...normalized, start: os - chunkStart, end: oe - chunkStart });
  }
  return out;
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === "https:" ? https : http;
    const req = transport.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      const ws = fs.createWriteStream(outputPath);
      res.pipe(ws);
      ws.on("finish", resolve);
      ws.on("error", reject);
    });
    req.on("error", reject);
  });
}

function pickCompression(recipe) {
  const qSettings = recipe.settings || {};
  let overrideCrf = "24";
  let overridePreset = "ultrafast";

  // Speed-first defaults:
  // - Web/default: CRF 24
  // - Medium:      CRF 22
  // - High:        CRF 20
  // - Ultra:       CRF 18
  if (qSettings.compression === "Medium") {
    overrideCrf = "22";
  }
  if (qSettings.compression === "High") {
    overrideCrf = "20";
  }
  if (qSettings.compression === "Ultra") {
    overrideCrf = "18";
  }

  const forcedCrf = (process.env.FFMPEG_X264_CRF || "").trim();
  if (forcedCrf) {
    overrideCrf = forcedCrf;
  }

  const forcedPreset = (process.env.FFMPEG_X264_PRESET || "").trim();
  if (forcedPreset) {
    overridePreset = forcedPreset;
  }

  return { overrideCrf, overridePreset };
}

async function renderChunkFromRecipe({
  inputPath,
  outputPath,
  chunkId,
  recipe,
  chunkDurationSecs,
  startTime,
  duration,
}) {
  const renderStartMs = Date.now();
  const tempDir = path.dirname(outputPath);
  const bgPath = path.join(tempDir, "background.png");
  const hasCustomBackground =
    recipe.selectedBackground === "custom" && Boolean(recipe.customBackgroundUrl);

  if (hasCustomBackground) {
    await downloadFile(recipe.customBackgroundUrl, bgPath);
  }

  const qSettings = recipe.settings || {
    quality: "720p",
    fps: "24 FPS",
    compression: "Web",
    speed: "Default",
  };
  const targetFps = qSettings.fps === "60 FPS" ? 60 : qSettings.fps === "30 FPS" ? 30 : 24;
  const { overrideCrf, overridePreset } = pickCompression(recipe);
  const filterThreadsEnv = Number.parseInt(process.env.FFMPEG_FILTER_THREADS || "", 10);
  const filterThreads =
    Number.isFinite(filterThreadsEnv) && filterThreadsEnv > 0 ? filterThreadsEnv : 2;

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

  const probe = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) {
        return reject(err);
      }
      const videoStream = meta.streams.find((s) => s.codec_type === "video");
      resolve({
        hasAudio: meta.streams.some((s) => s.codec_type === "audio"),
        videoDuration: Number(meta.format.duration || 0),
        sourceWidth: Number(videoStream?.width || 0),
        sourceHeight: Number(videoStream?.height || 0),
      });
    });
  });

  let chunkAbsStart = 0;
  let chunkAbsEnd = probe.videoDuration;
  let timelineDuration = probe.videoDuration;

  if (typeof startTime === "number" && typeof duration === "number") {
    chunkAbsStart = startTime;
    chunkAbsEnd = startTime + duration;
    timelineDuration = duration;
  } else {
    const chunkIndex = parseChunkIndex(chunkId);
    chunkAbsStart = chunkIndex * chunkDurationSecs;
    chunkAbsEnd = chunkAbsStart + (probe.videoDuration || chunkDurationSecs);
    timelineDuration = probe.videoDuration;
  }

  const slicedSegments = overlapSliceAbsolute(
    recipe.segments || [],
    chunkAbsStart,
    chunkAbsEnd,
    (s) => ({ start: toSeconds(s.start), end: toSeconds(s.end) })
  );

  const slicedZoom = overlapSliceAbsolute(
    recipe.zoomEffects || [],
    chunkAbsStart,
    chunkAbsEnd,
    (z) => ({
      start: toSeconds(z.startTime),
      end: toSeconds(z.endTime),
      zoomLevel: Number(z.zoomLevel),
      x: Number(z.x),
      y: Number(z.y),
    })
  ).map((z) => ({
    startTime: z.start,
    endTime: z.end,
    zoomLevel: z.zoomLevel,
    x: z.x,
    y: z.y,
  }));

  const slicedText = overlapSliceAbsolute(
    recipe.textOverlays || [],
    chunkAbsStart,
    chunkAbsEnd,
    (t) => ({
      start: toSeconds(t.startTime),
      end: toSeconds(t.endTime),
      text: String(t.text ?? ""),
      x: Number(t.x),
      y: Number(t.y),
      fontSize: Number(t.fontSize),
      color: String(t.color ?? "#ffffff"),
    })
  ).map((t) => ({
    startTime: t.start,
    endTime: t.end,
    text: t.text,
    x: t.x,
    y: t.y,
    fontSize: t.fontSize,
    color: t.color,
  }));

  const subtitleList = Array.isArray(recipe.subtitles)
    ? recipe.subtitles
    : Array.isArray(recipe.subtitles?.cues)
      ? recipe.subtitles.cues
      : [];
  const slicedSubs = overlapSliceAbsolute(subtitleList, chunkAbsStart, chunkAbsEnd, (s) => ({
    start: Number(s.start),
    end: Number(s.end),
    text: String(s.text || ""),
  }));

  const nativeRatio =
    probe.sourceWidth > 0 && probe.sourceHeight > 0
      ? probe.sourceWidth / probe.sourceHeight
      : 16 / 9;
  const selectedRatio = parseAspectRatioRatio(recipe.aspectRatio, nativeRatio);
  const computedTarget = computeTargetSizeForRatio(qSettings.quality, selectedRatio);
  let targetWidth = computedTarget.width;
  let targetHeight = computedTarget.height;

  const removeSegments = normalizeRemoveSegments(slicedSegments, timelineDuration);
  const keepSegments = invertToKeepSegments(removeSegments, timelineDuration);
  const trimmedDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  const hasTrimEdits =
    keepSegments.length > 0 &&
    !(
      keepSegments.length === 1 &&
      keepSegments[0].start <= EPS &&
      Math.abs(keepSegments[0].end - timelineDuration) <= EPS
    );
  if (keepSegments.length === 0) {
    throw new Error("All video content was trimmed out.");
  }

  console.log(
    `[${chunkId}] Window timeline_duration_s=${Math.max(0, timelineDuration).toFixed(3)} trimmed_duration_s=${Math.max(0, trimmedDuration).toFixed(3)}`
  );

  const remappedZoomEffects = remapZoomEffectsToTrimmedTimeline(
    slicedZoom,
    keepSegments,
    removeSegments
  );
  const remappedTextOverlays = remapTextOverlaysToTrimmedTimeline(
    slicedText,
    keepSegments,
    removeSegments
  );
  const remappedSubtitleCues = remapSubtitleCuesToTrimmedTimeline(
    slicedSubs,
    keepSegments,
    removeSegments
  );

  const filters = [];
  let videoOut = "[0:v]";
  let audioOut = probe.hasAudio ? "[0:a]" : null;

  if (hasTrimEdits) {
    const n = keepSegments.length;
    const vSplits = Array.from({ length: n }, (_, i) => `[tvs${i}]`).join("");
    filters.push(`${videoOut}split=${n}${vSplits}`);
    if (probe.hasAudio && audioOut) {
      const aSplits = Array.from({ length: n }, (_, i) => `[tas${i}]`).join("");
      filters.push(`${audioOut}asplit=${n}${aSplits}`);
    }

    let trimConcatIn = "";
    for (let i = 0; i < n; i++) {
      const seg = keepSegments[i];
      filters.push(
        `[tvs${i}]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[tvseg${i}]`
      );
      if (probe.hasAudio && audioOut) {
        filters.push(
          `[tas${i}]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[taseg${i}]`
        );
        trimConcatIn += `[tvseg${i}][taseg${i}]`;
      } else {
        trimConcatIn += `[tvseg${i}]`;
      }
    }

    const trimOut = probe.hasAudio && audioOut ? "[trimv][trima]" : "[trimv]";
    const trimAStr = probe.hasAudio && audioOut ? ":a=1" : ":a=0";
    filters.push(`${trimConcatIn}concat=n=${n}:v=1${trimAStr}${trimOut}`);
    videoOut = "[trimv]";
    if (probe.hasAudio && audioOut) {
      audioOut = "[trima]";
    }
  }

  filters.push(`${videoOut}fps=${targetFps}:round=near[fpsnorm]`);
  videoOut = "[fpsnorm]";

  const hasBackgroundCanvas =
    !!recipe.selectedBackground &&
    recipe.selectedBackground !== "hidden" &&
    recipe.selectedBackground !== "none" &&
    recipe.selectedBackground !== "transparent";
  const drawCardShadow = false;
  const drawCardBorder = Boolean(recipe.browserFrame?.drawBorder);
  const previewPadColor = hasBackgroundCanvas ? "0xF1ECFF" : "black";

  // Keep this exactly aligned with local video-worker behavior:
  // always normalize into target canvas first, preserving full source frame.
  filters.push(
    `${videoOut}scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:${previewPadColor},setsar=1[res]`
  );
  videoOut = "[res]";

  if (remappedZoomEffects.length > 0) {
    const sortedZooms = [...remappedZoomEffects].sort((a, b) => a.startTime - b.startTime);
    const zSegs = [];
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
        zSegs.push({
          start: segStart,
          end,
          zoom: { level: z.zoomLevel, x: z.x, y: z.y },
        });
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
          const level = 1 + (rawLevel - 1) * 0.8;
          const focusX = Math.max(0, Math.min(1, seg.zoom.x));
          const focusY = Math.max(0, Math.min(1, seg.zoom.y));
          const totalFrames = Math.max(2, Math.round(duration * targetFps));
          const rampFrames = Math.max(
            1,
            Math.min(Math.round(targetFps * 0.35), Math.floor(totalFrames / 2))
          );
          const holdEndFrame = Math.max(rampFrames, totalFrames - rampFrames);

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

  if (hasBackgroundCanvas) {
    let bgHex = "#f3f0fc";
    const palette = {
      "gradient:sunset": "#f5576c",
      "gradient:ocean": "#667eea",
      "gradient:mint": "#a8edea",
      "gradient:royal": "#764ba2",
      "gradient:steel": "#2c3e50",
      "gradient:candy": "#fa709a",
      bg1: "#eef1fb",
      bg2: "#f5efff",
      bg3: "#edf4ff",
      bg4: "#f8f0ea",
      bg5: "#fdf2e8",
      bg6: "#ecf7f3",
      bg7: "#fff1eb",
      bg8: "#f4effd",
    };
    if (String(recipe.selectedBackground || "").startsWith("color:")) {
      bgHex = String(recipe.selectedBackground).replace("color:", "");
    } else if (palette[recipe.selectedBackground]) {
      bgHex = palette[recipe.selectedBackground];
    }

    // Match local video-worker framing (inset card based on target frame directly).
    const cardW = Math.max(2, Math.floor((targetWidth * 0.9) / 2) * 2);
    const cardH = Math.max(2, Math.floor((targetHeight * 0.9) / 2) * 2);
    const borderFilter = drawCardBorder ? ",drawbox=x=0:y=0:w=iw:h=ih:color=white@0.95:t=9" : "";

    if (hasCustomBackground) {
      const customBgFilter =
        `[1:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase:flags=lanczos,` +
        `crop=${targetWidth}:${targetHeight},loop=loop=-1:size=1:start=0,fps=${targetFps},` +
        "setsar=1,format=yuv420p[bg]";
      const cardFilter = `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=yuv420p${borderFilter}[svid]`;

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
          "color=black@0.30:t=fill,boxblur=14:1," +
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
      const solidBgFilter = `color=c=${bgHex}:s=${targetWidth}x${targetHeight}:r=${targetFps}[bg]`;
      const cardFilter = `${videoOut}setsar=1,scale=${cardW}:${cardH}:flags=lanczos,format=yuv420p${borderFilter}[svid]`;

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
          "color=black@0.30:t=fill,boxblur=14:1," +
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
      const xExpr = `(w*${nx.toFixed(4)}-text_w/2)`;
      const yExpr = `(h*${ny.toFixed(4)}-text_h/2)`;

      filters.push(
        `${prev}drawtext=textfile=${safeFile}:reload=0:` +
          `fontsize=${size}:fontcolor=${safeColor}:` +
          `x='${xExpr}':y='${yExpr}':` +
          "shadowcolor=black@0.55:shadowx=1:shadowy=1:" +
          `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`
      );
      prev = next;
    });
    videoOut = prev;
  }

  if (remappedSubtitleCues.length > 0) {
    const assPath = writeAssSubtitles(tempDir, remappedSubtitleCues, targetWidth, targetHeight);
    const safeAss = ffmpegEscapeFilterValue(assPath);
    filters.push(`${videoOut}subtitles=${safeAss}[subv]`);
    videoOut = "[subv]";
  }

  if (speedFactor !== 1.0) {
    const pts = (1 / speedFactor).toFixed(4);
    filters.push(`${videoOut}setpts=${pts}*PTS[speedv]`);
    videoOut = "[speedv]";
    if (probe.hasAudio && audioOut) {
      filters.push(`${audioOut}atempo=${speedFactor}[speeda]`);
      audioOut = "[speeda]";
    }
  }

  const filterStr = filters.join(";");
  console.log(`[${chunkId}] Final filter:\n${filterStr}\n`);
  const toMapArg = (pad) => pad.replace(/^\[(\d+:[av])\]$/, "$1");
  const maps = [`-map ${toMapArg(videoOut)}`];
  if (probe.hasAudio && audioOut) {
    maps.push(`-map ${toMapArg(audioOut)}`);
  }

  const finalCmd = ffmpeg(inputPath);
  const hwDecode = (process.env.FFMPEG_HW_DECODE || "").trim();
  const inputOpts = [];
  if (hwDecode) {
    inputOpts.push(`-hwaccel ${hwDecode}`);
  }
  if (typeof startTime === "number" && typeof duration === "number") {
    inputOpts.push(`-ss ${startTime.toFixed(3)}`);
    inputOpts.push(`-t ${duration.toFixed(3)}`);
  }
  if (inputOpts.length > 0) {
    finalCmd.inputOptions(inputOpts);
  }
  if (hasCustomBackground) {
    finalCmd.input(bgPath);
  }

  finalCmd
    .on("start", (cmdLine) => console.log(`[${chunkId}] FFmpeg command: ${cmdLine}`))
    .complexFilter(filterStr)
    .videoCodec("libx264")
    .audioCodec("aac")
    .outputOptions([
      ...maps,
      "-filter_complex_threads 2",
      "-shortest",
      "-pix_fmt yuv420p",
      "-vsync cfr",
      `-g ${targetFps * 2}`,
      "-threads 0",
      `-t ${Math.max(0.1, trimmedDuration / speedFactor).toFixed(3)}`,
      "-preset ultrafast",
      "-crf 24",
      "-movflags +faststart",
    ])
    .output(outputPath);

  const ffmpegStartMs = Date.now();
  await runFfmpeg(finalCmd);
  const ffmpegMs = Date.now() - ffmpegStartMs;
  const totalRenderMs = Date.now() - renderStartMs;
  console.log(
    `[${chunkId}] Timing render_ms=${totalRenderMs} ffmpeg_ms=${ffmpegMs} ` +
      `trimmed_duration_s=${Math.max(0, trimmedDuration / speedFactor).toFixed(3)}`
  );
}

module.exports = {
  renderChunkFromRecipe,
};
