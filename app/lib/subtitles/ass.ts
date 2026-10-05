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

export interface GenerateAssOptions {
  /**
   * Whether to format dialogue text with ASS karaoke override tags (`{\k...}`).
   * When true, cues with valid `words` use word-level timing, while cues
   * without `words` fall back to standard text.
   * Defaults to false.
   */
  karaoke?: boolean;
}

export type AssKaraokeOptions = GenerateAssOptions;

/**
 * Formats a single subtitle cue's text with ASS karaoke override tags (`{\k...}`),
 * using word-level timestamps from `cue.words`.
 *
 * Rules:
 * 1. If `cue.words` is absent, empty, or has no valid words, falls back to plain escaped text.
 * 2. Converts word start/end timestamps into ASS centiseconds using endpoint rounding
 *    to prevent cumulative drift.
 * 3. Emits a leading silence tag (`{\k<lead>}`) if the first word starts after `cue.start`.
 * 4. Preserves inter-word speech pauses by emitting gap tags (`{\k<gap>} `).
 * 5. Escapes all word text via `escapeAssText()` so user/Whisper input cannot inject ASS tags.
 * 6. Preserves punctuation attached to words and newline line breaks (`\N`).
 * 7. Applies right-to-left directional embedding (`applyRtlBidi`) when `isRtl` or RTL language is specified.
 */
export function formatAssKaraokeText(
  cue: SubtitleCue,
  isRtlOrLanguage?: boolean | string | null
): string {
  if (!cue) return "";
  const isRtl =
    typeof isRtlOrLanguage === "boolean"
      ? isRtlOrLanguage
      : isRtlLanguage(String(isRtlOrLanguage || ""));

  const fallbackText = escapeAssText(cue.text || "");
  const words = cue.words;

  if (!Array.isArray(words) || words.length === 0) {
    return isRtl ? applyRtlBidi(fallbackText) : fallbackText;
  }

  // Filter valid words: must have a non-empty string, finite non-negative numbers, end > start
  const validWords = words.filter((w) => {
    if (!w || typeof w !== "object") return false;
    if (typeof w.word !== "string" || w.word.trim().length === 0) return false;
    const start = Number(w.start);
    const end = Number(w.end);
    return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
  });

  if (validWords.length === 0) {
    return isRtl ? applyRtlBidi(fallbackText) : fallbackText;
  }

  // Ensure deterministic chronological ordering
  const sorted = [...validWords].sort((a, b) => a.start - b.start);

  const cueStart = Math.max(0, Number.isFinite(cue.start) ? cue.start : 0);
  const cueStartCs = Math.round(cueStart * 100);

  // Helper to round second timestamps to centiseconds
  const toCs = (sec: number) => Math.max(0, Math.round(sec * 100));

  let result = "";

  // 1. Leading silence: gap between cue.start and firstWord.start
  const firstWordStartCs = toCs(sorted[0].start);
  const leadCs = Math.max(0, firstWordStartCs - cueStartCs);
  if (leadCs > 0) {
    result += `{\\k${leadCs}}`;
  }

  // Scan raw cue text to preserve newlines (\n -> \N) between words
  const rawText = String(cue.text || "");
  let textCursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const wStartCs = toCs(current.start);
    const wEndCs = toCs(current.end);
    const wDurCs = Math.max(0, wEndCs - wStartCs);

    // Escape word text to prevent ASS injection
    const escapedWord = escapeAssText(current.word.trim());
    result += `{\\k${wDurCs}}${escapedWord}`;

    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const nextStartCs = toCs(next.start);
      const gapCs = Math.max(0, nextStartCs - wEndCs);

      // Determine separator: check if raw text contained a newline between these words
      let separator = " ";
      let isNewline = false;
      const currentPos = rawText.indexOf(current.word, textCursor);
      if (currentPos !== -1) {
        textCursor = currentPos + current.word.length;
        const nextPos = rawText.indexOf(next.word, textCursor);
        if (nextPos !== -1) {
          const between = rawText.slice(textCursor, nextPos);
          if (/\r|\n/.test(between)) {
            isNewline = true;
          } else if (between.length === 0) {
            separator = "";
          }
          textCursor = nextPos;
        }
      }

      if (isNewline) {
        // Line break with optional gap duration
        if (gapCs > 0) {
          result += `\\N{\\k${gapCs}}`;
        } else {
          result += "\\N";
        }
      } else if (separator === "") {
        if (gapCs > 0) {
          result += `{\\k${gapCs}}`;
        }
      } else {
        // Space with optional gap duration
        if (gapCs > 0) {
          result += `{\\k${gapCs}} `;
        } else {
          result += " ";
        }
      }
    }
  }

  return isRtl ? applyRtlBidi(result) : result;
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
  language?: string | null,
  options?: GenerateAssOptions
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
    `WrapStyle: ${language ? 1 : 2}`,
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
      let text: string;
      if (options?.karaoke) {
        text = formatAssKaraokeText(c, isRtl);
      } else {
        const escaped = escapeAssText(c.text);
        text = isRtl ? applyRtlBidi(escaped) : escaped;
      }
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
  filename = "subtitles.ass",
  options?: GenerateAssOptions
): string {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const content = generateAssContent(cues, width, height, style, language, options);
  const filePath = path.join(destDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}
