// Canonical ASS subtitle document generator and file writer (Task-00038).
//
// Responsibilities:
// 1. Assembles valid ASS v4.00+ documents with Script Info, V4+ Styles, and Events.
// 2. Reuses canonical toAssStyleLine and toAssOverrideTags from ./style.
// 3. Formats timestamps into ASS centisecond format (H:MM:SS.cs).
// 4. Safely escapes text (curly braces, newlines, RTL script formatting).
// 5. Provides cross-platform path escaping (escapeFfmpegFilterPath) compatible with
//    FFmpeg's filtergraph parser on Windows and Linux.
// 6. Writes .ass files for libass rendering by reframe-worker and export workers.

import fs from "fs";
import path from "path";
import { isRtlLanguage } from "./languages";
import { toAssOverrideTags, toAssStyleLine } from "./style";
import type { SubtitleCue, SubtitleStyle } from "./types";

/** U+202B RIGHT-TO-LEFT EMBEDDING … U+202C POP DIRECTIONAL FORMATTING. */
const RLE = "\u202B";
const PDF = "\u202C";

/**
 * Formats a duration in seconds into an ASS timestamp: `H:MM:SS.cs` (centisecond precision).
 *
 * Example: `62.345` -> `"0:01:02.34"`
 */
export function formatAssTime(seconds: number): string {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalCs = Math.round(s * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Escapes subtitle text for safe inclusion in an ASS Dialogue line.
 * - Converts newlines into `\N`.
 * - Converts `{` and `}` to parentheses to prevent override tag injection.
 */
export function escapeAssText(text: string): string {
  return String(text || "")
    .replace(/\r\n|\r|\n/g, "\\N")
    .replace(/{/g, "(")
    .replace(/}/g, ")");
}

/**
 * Wraps text with directional embedding characters for right-to-left scripts.
 */
export function applyRtlBidi(text: string): string {
  return `${RLE}${text}${PDF}`;
}

/**
 * Escapes a local file path so it can be safely passed to FFmpeg's `subtitles` filter.
 *
 * Why this exists:
 * - In FFmpeg filtergraphs, colons `:` delimit filter options.
 * - On Windows, drive letters (e.g. `C:\...`) contain colons and backslashes.
 * - Single quotes inside `-vf` do not protect colons in all FFmpeg option parsers.
 * - Normalizing backslashes to forward slashes and escaping `:` and spaces with `\`
 *   guarantees that FFmpeg parses the filename option correctly across Windows and Linux.
 */
export function escapeFfmpegFilterPath(filePath: string): string {
  if (!filePath) return "";
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\\\:")
    .replace(/ /g, "\\ ")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Generates the full string content of an Advanced SubStation Alpha (ASS v4.00+) document.
 *
 * Generates cue-level Dialogue events, preserving the visual layout, style, and
 * animations configured by the user.
 */
export function generateAssContent(
  cues: readonly SubtitleCue[],
  width: number,
  height: number,
  style?: SubtitleStyle,
  language?: string | null
): string {
  const w = Math.max(2, Math.round(Number(width) || 1920));
  const h = Math.max(2, Math.round(Number(height) || 1080));

  // Style line generation
  let styleLine: string;
  if (style) {
    styleLine = toAssStyleLine(style, w, h);
  } else {
    // Master's legacy default style line for unstyled exports
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

  const tags = style ? toAssOverrideTags(style, w, h) : "";
  const isRtl = isRtlLanguage(String(language || ""));

  const lines = (cues || [])
    .filter((c) => c && c.text && String(c.text).trim().length > 0)
    .map((c) => {
      const start = formatAssTime(c.start);
      const end = formatAssTime(c.end);
      const escaped = escapeAssText(c.text);
      const text = isRtl ? applyRtlBidi(escaped) : escaped;
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${tags}${text}`;
    });

  return `${header}\n${lines.join("\n")}\n`;
}

/**
 * Synchronously writes an ASS subtitle file to disk and returns its absolute path.
 */
export function writeAssFile(
  destDir: string,
  cues: readonly SubtitleCue[],
  width: number,
  height: number,
  style?: SubtitleStyle,
  language?: string | null,
  filename = "subtitles.ass"
): string {
  const content = generateAssContent(cues, width, height, style, language);
  const filePath = path.join(destDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}
