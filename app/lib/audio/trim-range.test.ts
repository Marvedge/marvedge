import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { trimAudioFile } from "./media";

describe("audio trim selected duration", () => {
  let directory: string;
  let inputPath: string;

  beforeAll(() => {
    if (!ffmpegStatic) {
      throw new Error("The npm-installed FFmpeg binary is unavailable");
    }

    ffmpeg.setFfmpegPath(ffmpegStatic);
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "audio-trim-range-"));
    inputPath = path.join(directory, "original.wav");

    execFileSync(
      ffmpegStatic,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=30",
        "-c:a",
        "pcm_s16le",
        inputPath,
      ],
      { timeout: 15_000 }
    );
  }, 20_000);

  afterAll(() => {
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    [5, 20],
    [10, 12],
    [0, 4],
  ])(
    "exports only the selected %s–%s second window",
    async (start, end) => {
      const outputPath = path.join(directory, `trim-${start}-${end}.wav`);

      await trimAudioFile(inputPath, outputPath, start, end);

      const measured = execFileSync(
        ffprobeStatic.path,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          outputPath,
        ],
        { encoding: "utf8", timeout: 10_000 }
      );

      const duration = Number(measured.trim());
      expect(Number.isFinite(duration)).toBe(true);
      expect(Math.abs(duration - (end - start))).toBeLessThan(0.2);
    },
    20_000
  );
});
