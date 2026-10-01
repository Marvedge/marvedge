// Server-side ASS subtitle file writer (Task-00038, Task-00067).
//
// Node-only: uses fs and path to synchronously write .ass files to disk for
// render workers and server-side utilities.

import fs from "fs";
import path from "path";
import { generateAssContent } from "./ass";
import type { SubtitleCue, SubtitleStyle } from "./types";

/**
 * Synchronously writes an ASS subtitle file to disk and returns its absolute path.
 * Node / server-only.
 */
export function writeAssFile(
  destDir: string,
  cues: readonly SubtitleCue[],
  width: number,
  height: number,
  style?: SubtitleStyle,
  language?: string | null,
  filename = "subtitles.ass",
  options?: any
): string {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const content = (generateAssContent as any)(cues, width, height, style, language, options);
  const filePath = path.join(destDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

export * from "./ass";
