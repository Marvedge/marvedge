"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const https = require("node:https");
const ffmpeg = require("fluent-ffmpeg");
const FFMPEG_BIN =
  process.env.FFMPEG_PATH ||
  (() => {
    try {
      return require("ffmpeg-static");
    } catch {
      return "/usr/bin/ffmpeg";
    }
  })() ||
  "/usr/bin/ffmpeg";

const FFPROBE_BIN =
  process.env.FFPROBE_PATH ||
  (() => {
    try {
      return require("ffprobe-static").path;
    } catch {
      return "/usr/bin/ffprobe";
    }
  })() ||
  "/usr/bin/ffprobe";

ffmpeg.setFfmpegPath(FFMPEG_BIN);
ffmpeg.setFfprobePath(FFPROBE_BIN);

const EPS = 0.001;

// WTM (watermark): the bundled default Marvedge badge shipped in the image (see
// Dockerfile `COPY assets ./assets`). Resolved relative to this file so it works
// both in the container (/app/assets/...) and locally. Used when a chunk's
// recipe.watermark is enabled with no custom assetUrl.
const DEFAULT_WATERMARK_PATH = path.join(__dirname, "assets", "marvedge-watermark.png");
const WTM_POSITIONS = ["br", "bl", "tr", "tl"];

// Overlay x:y expressions per corner (W/H = canvas, w/h = watermark, m = margin).
function watermarkOverlayXY(position, margin) {
  switch (position) {
    case "bl":
      return `${margin}:H-h-${margin}`;
    case "tr":
      return `W-w-${margin}:${margin}`;
    case "tl":
      return `${margin}:${margin}`;
    case "br":
    default:
      return `W-w-${margin}:H-h-${margin}`;
  }
}

function clampRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

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
      fontFamily: String(t.fontFamily ?? "Arial"),
      w: t.w ? Number(t.w) : undefined,
      parentW: t.parentW ? Number(t.parentW) : undefined,
      parentH: t.parentH ? Number(t.parentH) : undefined,
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
      fontFamily: t.fontFamily,
      w: t.w,
      parentW: t.parentW,
      parentH: t.parentH,
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
        fontFamily: t.fontFamily,
        w: t.w,
        parentW: t.parentW,
        parentH: t.parentH,
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
  let str = String(value).replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(str)) {
    str = str[0] + "\\:" + str.slice(2);
  }
  return str;
}

function resolveFontForDrawtext(fontFamily) {
  const raw = String(fontFamily || "").trim();
  if (!raw) {
    return { kind: "none", value: "" };
  }

  // Prefer explicit font files for exact rendering fidelity.
  const candidates = {
    arial: [
      "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
    roboto: ["/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf"],
    inter: [
      "/app/fonts/Inter-Regular.ttf",
      "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
      "/usr/share/fonts/truetype/inter-vf/Inter.var.ttf",
    ],
    poppins: ["/app/fonts/Poppins-Regular.ttf"],
    caveat: ["/app/fonts/Caveat-Regular.ttf"],
    georgia: ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
  };

  const key = raw.toLowerCase();
  const paths = candidates[key] || [];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return { kind: "fontfile", value: p };
    }
  }

  // Fallback to family name if no file exists.
  return { kind: "font", value: raw };
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

function estimateTextWidth(text, fontSize, fontFamily) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === " ") {
      width += 0.28;
    } else if (/[A-Z]/.test(char)) {
      width += 0.65;
    } else if (/[mw]/i.test(char)) {
      width += 0.8;
    } else if (/[ijlt]/i.test(char)) {
      width += 0.25;
    } else if (/[0-9]/.test(char)) {
      width += 0.5;
    } else if (/[.,;:!']/.test(char)) {
      width += 0.22;
    } else {
      width += 0.52;
    }
  }
  return width * fontSize;
}

function wrapText(text, fontSize, maxWidth, fontFamily) {
  const paragraphs = text.split("\n");
  const wrappedParagraphs = paragraphs.map((paragraph) => {
    const words = paragraph.split(" ");
    if (words.length <= 1) {
      return paragraph;
    }

    let currentLine = "";
    const lines = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? currentLine + " " + word : word;
      const testWidth = estimateTextWidth(testLine, fontSize, fontFamily);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.join("\n");
  });

  return wrappedParagraphs.join("\n");
}

function writeTextOverlayFiles(tempDir, overlays, targetWidth) {
  return overlays.map((overlay, idx) => {
    const p = path.join(tempDir, `text-${idx}.txt`);

    const parentW = overlay.parentW || (targetWidth > 1000 ? 800 : 400);
    const scale = targetWidth / parentW;
    const scaledFontSize = Math.max(10, Math.min(160, Math.round(overlay.fontSize * scale)));
    const scaledBoxWidth = overlay.w ? overlay.w * scale : 240 * scale;

    const wrappedText = wrapText(overlay.text, scaledFontSize, scaledBoxWidth, overlay.fontFamily);

    fs.writeFileSync(p, wrappedText, "utf8");
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

// --- SUB: subtitle styling ---------------------------------------------------
// The mapping below is a faithful port of app/lib/subtitles/style.ts, which the
// editor's preview overlay also reads. That module is the source of truth: it
// cannot be imported here (this worker is a standalone package deployed from
// cloudrun-worker/ alone), so the two are pinned together by a test instead —
// app/lib/subtitles/workerParity.test.ts requires THIS FILE and asserts the two
// produce byte-identical ASS for a matrix of styles and frame heights. Change a
// rule here and that test fails until style.ts moves with it.
//
// Everything is driven off `recipe.subtitleStyle`. When it is absent — a demo
// that was never styled — writeAssSubtitles takes the untouched legacy branch
// below and the .ass file is byte-for-byte what it has always been.

const SUBTITLE_FONT_NAMES = {
  arial: "Arial",
  roboto: "Roboto",
  poppins: "Poppins",
  inter: "Inter",
};

const SUBTITLE_ASS_ALIGNMENT = { top: 8, middle: 5, bottom: 2 };

// Master's defaults, which are also DEFAULT_SUBTITLE_STYLE in style.ts.
const SUBTITLE_DEFAULT_FONT_PCT = 5;
const SUBTITLE_DEFAULT_OUTLINE_RATIO = 1 / 16;
const SUBTITLE_LEGACY_BACK_COLOUR = "&H64000000";
const SUBTITLE_LEGACY_SECONDARY_COLOUR = "&H000000FF";
const SUBTITLE_MARGIN_H_PX = 60;
const SUBTITLE_MARGIN_H_MIN_PX = 16;
const SUBTITLE_MARGIN_H_RATIO = 0.05;

function computeSubtitleMarginHPx(frameWidth) {
  const w = Number(frameWidth);
  if (!Number.isFinite(w) || w <= 0) {
    return SUBTITLE_MARGIN_H_PX;
  }
  return Math.max(
    SUBTITLE_MARGIN_H_MIN_PX,
    Math.min(SUBTITLE_MARGIN_H_PX, Math.round(w * SUBTITLE_MARGIN_H_RATIO))
  );
}

// PRD size range, as a percentage of frame height at a 1080p reference.
const SUBTITLE_FONT_PCT_MIN = (12 / 1080) * 100;
const SUBTITLE_FONT_PCT_MAX = (72 / 1080) * 100;

function subtitleClamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function subtitleHexPair(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

// ASS is &HAABBGGRR: the RGB bytes are REVERSED relative to CSS, and the alpha
// byte is INVERTED (00 = fully opaque).
function subtitleAssColour(hex, opacity) {
  const raw = String(hex || "").trim();
  const clean = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.slice(1) : "000000";
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const alpha = 255 - Math.round(subtitleClamp(opacity, 0, 1, 1) * 255);
  return `&H${subtitleHexPair(alpha)}${subtitleHexPair(b)}${subtitleHexPair(g)}${subtitleHexPair(r)}`;
}

const SUBTITLE_BOX_PADDING_BASE_RATIO = 0.15;
const SUBTITLE_BOX_PADDING_MIN_PX = 2;

function computeSubtitleBoxPaddingPx(fontPx, outlineWidth = 0) {
  const widthRatio = Number.isFinite(Number(outlineWidth)) ? Math.max(0, Number(outlineWidth)) : 0;
  return Math.max(
    SUBTITLE_BOX_PADDING_MIN_PX,
    Math.round(fontPx * (SUBTITLE_BOX_PADDING_BASE_RATIO + widthRatio))
  );
}

// The one place a style becomes pixels. The font clamp is master's [20, 58],
// scaled by the size the user asked for relative to the default — so the default
// clamps exactly as master does, while a deliberately large choice is not capped
// away. See the long note on subtitleMetrics() in style.ts.
function subtitleMetrics(style, h, w) {
  const height = Math.max(1, Number(h) || 0);
  const width =
    Number.isFinite(Number(w)) && Number(w) > 0 ? Number(w) : Math.round((height * 16) / 9);
  const pct = subtitleClamp(
    style && style.fontSizePct,
    SUBTITLE_FONT_PCT_MIN,
    SUBTITLE_FONT_PCT_MAX,
    SUBTITLE_DEFAULT_FONT_PCT
  );
  const sizeScale = pct / SUBTITLE_DEFAULT_FONT_PCT;
  const fontPx = Math.max(
    Math.round(20 * sizeScale),
    Math.min(Math.round(58 * sizeScale), Math.round(height * (pct / 100)))
  );
  const marginVPx = Math.max(20, Math.min(96, Math.round(height * 0.06)));
  const outlineWidth = subtitleClamp(
    style && style.outlineWidth,
    0,
    0.25,
    SUBTITLE_DEFAULT_OUTLINE_RATIO
  );
  const shadowDepth = subtitleClamp(style && style.shadowDepth, 0, 0.25, 0);
  const hasBox = typeof (style && style.backgroundColor) === "string" && style.backgroundColor.length > 0;
  return {
    fontPx,
    marginVPx,
    marginHPx: computeSubtitleMarginHPx(width),
    outlinePx: Math.round(fontPx * outlineWidth),
    shadowPx: Math.round(fontPx * shadowDepth),
    boxPaddingPx: hasBox ? computeSubtitleBoxPaddingPx(fontPx, outlineWidth) : 0,
  };
}

// A background box is BorderStyle 3 + BackColour, NOT Outline. With master's
// BorderStyle 1, BackColour is the (unused, Shadow: 0) shadow colour.
function subtitleAssStyleLine(style, w, h) {
  const s = style || {};
  const m = subtitleMetrics(s, h, w);
  const font = SUBTITLE_FONT_NAMES[String(s.fontFamily || "arial").toLowerCase()] || "Arial";
  const hasBox = typeof s.backgroundColor === "string" && s.backgroundColor.length > 0;
  const backColour = hasBox
    ? subtitleAssColour(
        s.backgroundColor,
        s.backgroundOpacity === undefined ? 0.6 : s.backgroundOpacity
      )
    : SUBTITLE_LEGACY_BACK_COLOUR;
  const outlinePx = hasBox ? m.boxPaddingPx : m.outlinePx;
  return [
    "Style: Default",
    font,
    m.fontPx,
    subtitleAssColour(s.color || "#FFFFFF", 1),
    SUBTITLE_LEGACY_SECONDARY_COLOUR,
    subtitleAssColour(s.outlineColor || "#000000", 1),
    backColour,
    0,
    0,
    0,
    0,
    100,
    100,
    0,
    0,
    hasBox ? 3 : 1,
    outlinePx,
    m.shadowPx,
    SUBTITLE_ASS_ALIGNMENT[s.alignment] || 2,
    m.marginHPx,
    m.marginHPx,
    m.marginVPx,
    1,
  ].join(",");
}

// Entrance animations, as ASS override tags prepended to the Dialogue text.
// \fad, \t and \move are all standard libass tags. \move positions the text
// absolutely and so overrides the style's margins — the anchor it lands on is
// therefore recomputed here from the same metrics the Style: line used.
function subtitleAssOverrideTags(style, w, h) {
  const animation = style && style.animation;
  if (animation === "fade") {
    return "{\\fad(200,200)}";
  }
  if (animation === "pop") {
    return "{\\t(0,150,\\fscx110\\fscy110)\\t(150,300,\\fscx100\\fscy100)}";
  }
  if (animation === "slide") {
    const m = subtitleMetrics(style, h, w);
    const x = Math.round(w / 2);
    const alignment = style && style.alignment;
    const y =
      alignment === "top"
        ? m.marginVPx
        : alignment === "middle"
          ? Math.round(h / 2)
          : h - m.marginVPx;
    const from = y + Math.round(m.fontPx * 0.8);
    return `{\\move(${x},${from},${x},${y},0,250)}`;
  }
  return "";
}

// SUB PR 5: right-to-left scripts. Mirrors `isRtlLanguage` in
// app/lib/subtitles/languages.ts (Arabic is the only RTL language of the seven
// the product offers; the others are listed so a future addition behaves).
//
// libass performs bidirectional reordering and Arabic shaping through FriBidi
// and HarfBuzz, but ONLY when the ffmpeg build it is linked into includes them.
// The container's build has not been inspected, so this path is implemented and
// left unreachable from the UI — RTL_RENDERING_VERIFIED in languages.ts holds
// every RTL language out of both pickers until someone confirms a real render.
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

function isRtlSubtitleLanguage(language) {
  const code = String(language || "")
    .trim()
    .toLowerCase()
    .split("-")[0];
  return RTL_LANGUAGES.has(code);
}

// U+202B RIGHT-TO-LEFT EMBEDDING … U+202C POP DIRECTIONAL FORMATTING.
//
// Wrapping each line states the paragraph direction explicitly rather than
// leaving libass to infer it from the first strong character — which gets a
// caption that opens with a Latin product name or a digit backwards.
const RLE = "‫";
const PDF = "‬";

function applyRtlBidi(text) {
  return `${RLE}${text}${PDF}`;
}

function writeAssSubtitles(tempDir, cues, w, h, style, language) {
  // No style config -> master's hardcoded line, verbatim. This branch is what
  // guarantees a demo that predates the style panel exports byte-identically;
  // it deliberately does not route through the mapping above.
  let styleLine;
  if (style) {
    styleLine = subtitleAssStyleLine(style, w, h);
  } else {
    const fontSize = Math.max(20, Math.min(58, Math.round(h * 0.05)));
    const marginV = Math.max(20, Math.min(96, Math.round(h * 0.06)));
    const outline = Math.max(1, Math.min(4, Math.round(fontSize / 16)));
    styleLine = `Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},0,2,60,60,${marginV},1`;
  }

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
    styleLine,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  // Empty string when there is no animation, so an unstyled export's Dialogue
  // lines are unchanged too.
  const tags = style ? subtitleAssOverrideTags(style, w, h) : "";

  // Absent language → untouched text, so every existing demo's Dialogue lines
  // are byte-for-byte what they were.
  const rtl = isRtlSubtitleLanguage(language);

  const lines = cues.map((c) => {
    const start = formatAssTime(c.start);
    const end = formatAssTime(c.end);
    const escaped = escapeAssText(c.text);
    const t = rtl ? applyRtlBidi(escaped) : escaped;
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${tags}${t}`;
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

  // WTM: plan is decided upstream in jobs/create — the worker only renders
  // recipe.watermark when present and enabled. A custom assetUrl is downloaded
  // like the custom background; otherwise the bundled default badge is used.
  // Absent/disabled → the filter chain and output are byte-for-byte unchanged.
  const watermarkConfig =
    recipe.watermark && recipe.watermark.enabled === true ? recipe.watermark : null;
  let watermarkPath = null;
  if (watermarkConfig) {
    if (watermarkConfig.assetUrl) {
      watermarkPath = path.join(tempDir, "watermark.png");
      await downloadFile(watermarkConfig.assetUrl, watermarkPath);
    } else if (fs.existsSync(DEFAULT_WATERMARK_PATH)) {
      watermarkPath = DEFAULT_WATERMARK_PATH;
    }
  }
  const hasWatermark = Boolean(watermarkPath);
  // Input index: source=0, custom background=1 (if any), watermark=next.
  const watermarkInputIndex = hasCustomBackground ? 2 : 1;

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
      fontFamily: String(t.fontFamily ?? "Arial"),
    })
  ).map((t) => ({
    startTime: t.start,
    endTime: t.end,
    text: t.text,
    x: t.x,
    y: t.y,
    fontSize: t.fontSize,
    color: t.color,
    fontFamily: t.fontFamily,
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
    console.log(`[${chunkId}] All video content was trimmed out. Skipping.`);
    return { skipped: true };
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
    const textFiles = writeTextOverlayFiles(tempDir, remappedTextOverlays, targetWidth);
    let prev = videoOut;
    textFiles.forEach(({ path: filePath, overlay }, idx) => {
      const next = `[txt${idx}]`;
      const safeFile = ffmpegEscapeFilterValue(filePath);
      const safeColor = normalizeHexColor(overlay.color, "white");
      const start = Math.max(0, overlay.startTime);
      const end = Math.max(start + EPS, overlay.endTime);

      const parentW = overlay.parentW || (targetWidth > 1000 ? 800 : 400);
      const scale = targetWidth / parentW;
      const size = Math.max(10, Math.min(160, Math.round(overlay.fontSize * scale)));
      const nx = Math.max(0, Math.min(1, overlay.x));
      const ny = Math.max(0, Math.min(1, overlay.y));
      const xExpr = `(w*${nx.toFixed(4)}-text_w/2)`;
      const yExpr = `(h*${ny.toFixed(4)}-text_h/2)`;

      let fontOpt = "";
      if (overlay.fontFamily) {
        const resolved = resolveFontForDrawtext(overlay.fontFamily);
        if (resolved.kind === "fontfile" && resolved.value) {
          const safeFontFile = ffmpegEscapeFilterValue(resolved.value);
          fontOpt = `fontfile='${safeFontFile}':`;
        } else if (resolved.kind === "font" && resolved.value) {
          fontOpt = `font='${resolved.value}':`;
        }
      }

      filters.push(
        `${prev}drawtext=textfile=${safeFile}:reload=0:` +
          `fontsize=${size}:fontcolor=${safeColor}:${fontOpt}` +
          `x='${xExpr}':y='${yExpr}':` +
          "shadowcolor=black@0.55:shadowx=1:shadowy=1:" +
          `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'${next}`
      );
      prev = next;
    });
    videoOut = prev;
  }

  if (remappedSubtitleCues.length > 0) {
    // SUB: recipe.subtitleStyle is already sanitized by /api/jobs/create — the
    // worker renders what it is handed and validates nothing itself, exactly as
    // it does for recipe.watermark. Absent -> master's hardcoded style.
    const subtitleStyle =
      recipe.subtitleStyle && typeof recipe.subtitleStyle === "object" ? recipe.subtitleStyle : null;
    const assPath = writeAssSubtitles(
      tempDir,
      remappedSubtitleCues,
      targetWidth,
      targetHeight,
      subtitleStyle,
      typeof recipe.subtitleLanguage === "string" ? recipe.subtitleLanguage : null
    );
    const safeAss = ffmpegEscapeFilterValue(assPath);
    // Inter and Poppins ship in the image at /app/fonts but are not in a
    // fontconfig search path, so libass cannot resolve them by family name
    // without being pointed at the directory. (drawtext takes a file path and so
    // never needed this — see resolveFontForDrawtext.) Only added when a style
    // is actually set, so an unstyled export's filter graph is unchanged.
    const fontsDir = path.join(__dirname, "fonts");
    const fontsOpt =
      subtitleStyle && fs.existsSync(fontsDir)
        ? `:fontsdir=${ffmpegEscapeFilterValue(fontsDir)}`
        : "";
    filters.push(`${videoOut}subtitles=${safeAss}${fontsOpt}[subv]`);
    videoOut = "[subv]";
  }

  // Watermark overlays LAST among the visual layers (after bg/zoom/text/subs) so
  // it sits on top of everything. Sized responsively via scale2ref against the
  // composed canvas (height ≈ canvas height * scale), made semi-transparent via
  // colorchannelmixer, and anchored to a corner (bottom-right default). The
  // canvas is identical across chunks, so the badge is uniform in the merged out.
  if (hasWatermark) {
    const opacity = clampRange(watermarkConfig.opacity, 0, 1, 0.55);
    const scale = clampRange(watermarkConfig.scale, 0.01, 0.5, 0.08);
    const position = WTM_POSITIONS.includes(watermarkConfig.position)
      ? watermarkConfig.position
      : "br";
    // ~15px at 1080p, scaled proportionally with the output height.
    const margin = Math.max(1, Math.round((targetHeight * 15) / 1080));
    const wmSrc = `[${watermarkInputIndex}:v]`;
    filters.push(`${wmSrc}format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[wmlogo]`);
    // scale2ref: scale the logo (1st) using the composed video (2nd) as reference;
    // it passes the reference through unchanged as [wmbase]. w=-2 keeps the
    // logo's aspect ratio and rounds to an even width.
    filters.push(
      `[wmlogo]${videoOut}scale2ref=w=-2:h=main_h*${scale.toFixed(4)}[wmscaled][wmbase]`
    );
    filters.push(
      `[wmbase][wmscaled]overlay=${watermarkOverlayXY(position, margin)}:format=auto[wmv]`
    );
    videoOut = "[wmv]";
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
  // Added after the optional custom background so the watermark's input index is
  // deterministic (hasCustomBackground ? 2 : 1), matching watermarkInputIndex.
  if (hasWatermark) {
    finalCmd.input(watermarkPath);
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
  // Exported for app/lib/subtitles/workerParity.test.ts, which asserts this
  // file's ASS mapping stays byte-identical to app/lib/subtitles/style.ts.
  writeAssSubtitles,
  subtitleAssStyleLine,
  subtitleAssOverrideTags,
  subtitleAssColour,
  isRtlSubtitleLanguage,
  // Exported for app/lib/subtitles/burnInInvariant.test.ts, which drives the
  // real chunk-slice -> trim-remap -> ASS path with cue lists an editing session
  // can actually produce. remapSubtitleCuesToTrimmedTimeline ASSUMES ITS INPUT
  // IS SORTED AND NON-OVERLAPPING; that test is what stops the assumption from
  // going unchecked now that a user can drag cues on top of each other.
  remapSubtitleCuesToTrimmedTimeline,
  overlapSliceAbsolute,
  normalizeRemoveSegments,
  invertToKeepSegments,
};
