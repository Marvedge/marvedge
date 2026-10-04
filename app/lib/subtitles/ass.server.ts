import fs from "fs";
import path from "path";
import { generateAssContent } from "./ass";
import type { SubtitleCue, SubtitleStyle } from "./types";

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
