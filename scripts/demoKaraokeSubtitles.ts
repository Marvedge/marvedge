import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { loadEnvConfig } from "@next/env";
import {
  escapeFfmpegFilterPath,
  normalizeWhisperResponse,
  transcribeAudioWithWhisper,
} from "../app/lib/subtitles/index";
import { writeAssFile } from "../app/lib/subtitles/server";
import { realisticWhisperVerboseResponse } from "../app/lib/subtitles/fixtures/whisperSample";

/**
 * Resolves the input video path from CLI arguments, handling shell argument splitting on Windows.
 */
function resolveInputPath(rawArgs: string[]): string | undefined {
  const filtered = rawArgs.filter((arg) => arg !== "--" && arg.trim() !== "");
  if (filtered.length === 0) return undefined;

  // Check first argument directly
  const first = filtered[0].trim();
  if (fs.existsSync(first)) {
    return path.resolve(first);
  }

  // Check joined arguments in case shell split a path with spaces
  const joined = filtered.join(" ").trim();
  if (fs.existsSync(joined)) {
    return path.resolve(joined);
  }

  // Return resolved first argument so subsequent file validation reports exact missing path
  return path.resolve(first);
}

/**
 * Derives a safe, sanitized filename base without unusual characters for filesystem stability.
 */
function sanitizeBasename(filePath: string): string {
  const parsed = path.parse(filePath).name;
  return (
    parsed
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "video"
  );
}

async function runSyntheticDemo(outputDir: string): Promise<void> {
  let wordCount = 0;
  let cueCount = 0;
  const assFilename = "whisper-sample.ass";
  let assPath = "";

  try {
    const { transcript, cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);
    wordCount = transcript.words.length;
    cueCount = cues.length;

    assPath = writeAssFile(outputDir, cues, 1280, 720, undefined, null, assFilename, {
      karaoke: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Synthetic ASS generation failed: ${message}`);
    process.exit(1);
  }

  if (!fs.existsSync(assPath) || fs.statSync(assPath).size === 0) {
    console.error("Error: Synthetic ASS file does not exist or is empty.");
    process.exit(1);
  }

  const mp4Filename = "whisper-sample-karaoke.mp4";
  const mp4Path = path.join(outputDir, mp4Filename);
  if (fs.existsSync(mp4Path)) {
    try {
      fs.unlinkSync(mp4Path);
    } catch {
      // Ignore removal error
    }
  }

  const escapedAssPath = escapeFfmpegFilterPath(assPath);
  const ffmpegCmd = [
    "ffmpeg",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=1280x720:r=25:d=4",
    "-vf",
    `"subtitles=${escapedAssPath}"`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    `"${mp4Path}"`,
  ].join(" ");

  try {
    execSync(ffmpegCmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: FFmpeg synthetic video rendering failed: ${message}`);
    process.exit(1);
  }

  if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
    console.error("Error: Output MP4 video does not exist or is empty.");
    process.exit(1);
  }

  const probeCmd = `ffprobe -v error -show_entries stream=codec_name,width,height,duration -of json "${mp4Path}"`;
  let probeSuccess = false;

  try {
    const probeOutput = execSync(probeCmd, { encoding: "utf8" });
    const probeData = JSON.parse(probeOutput);
    if (
      probeData.streams &&
      probeData.streams.length > 0 &&
      probeData.streams[0].codec_name === "h264"
    ) {
      probeSuccess = true;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ffprobe inspection failed: ${message}`);
    process.exit(1);
  }

  if (!probeSuccess) {
    console.error("Error: ffprobe did not find a valid H.264 video stream in output MP4.");
    process.exit(1);
  }

  console.log(`Task-00067 Karaoke Demo
Mode: synthetic fixture

Whisper words: ${wordCount}
Subtitle cues: ${cueCount}

ASS:
  task-67-demo/${assFilename}

Video:
  task-67-demo/${mp4Filename}

FFmpeg: PASS
ffprobe: PASS

Open the MP4 to visually inspect karaoke timing.`);
}

async function runRealVideoDemo(inputVideoPath: string, outputDir: string): Promise<void> {
  // 1. Validate input file exists
  if (!fs.existsSync(inputVideoPath)) {
    console.error(`Error: Input file not found: "${inputVideoPath}"`);
    process.exit(1);
  }

  const fileStat = fs.statSync(inputVideoPath);
  if (!fileStat.isFile() || fileStat.size === 0) {
    console.error(`Error: Input path is not a valid or non-empty file: "${inputVideoPath}"`);
    process.exit(1);
  }

  // 2. Validate video and audio streams using ffprobe
  let videoWidth = 1280;
  let videoHeight = 720;

  try {
    const probeCmd = `ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,duration -of json "${inputVideoPath}"`;
    const probeOutput = execSync(probeCmd, { encoding: "utf8" });
    const probeData = JSON.parse(probeOutput);

    const videoStream = probeData?.streams?.find((s: Record<string, unknown>) => s.codec_type === "video");
    const audioStream = probeData?.streams?.find((s: Record<string, unknown>) => s.codec_type === "audio");

    if (!videoStream) {
      console.error(`Error: Input file does not contain a video stream: "${inputVideoPath}"`);
      process.exit(1);
    }
    if (!audioStream) {
      console.error(`Error: Input video does not contain an audio stream suitable for transcription: "${inputVideoPath}"`);
      process.exit(1);
    }

    if (typeof videoStream.width === "number" && typeof videoStream.height === "number") {
      videoWidth = videoStream.width;
      videoHeight = videoStream.height;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: FFmpeg/ffprobe failed to inspect input video: ${message}`);
    process.exit(1);
  }

  // 3. Load environment variables (.env.local, .env) following standard Next.js precedence
  loadEnvConfig(process.cwd());

  if (!process.env.OPENAI_API_KEY) {
    console.error("Transcription: FAIL");
    console.error("Error: Missing OPENAI_API_KEY for Whisper transcription. Please configure OPENAI_API_KEY in your environment or .env.local file.");
    process.exit(1);
  }

  // 4. Extract audio to isolated temporary directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task67-karaoke-"));
  const tempAudioPath = path.join(tempDir, "audio.mp3");

  let transcriptResult: {
    transcript: { words: unknown[]; language?: string };
    cues: ReturnType<typeof normalizeWhisperResponse>["cues"];
  };

  try {
    const extractCmd = `ffmpeg -y -i "${inputVideoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 "${tempAudioPath}"`;
    execSync(extractCmd, { stdio: ["ignore", "pipe", "pipe"] });

    if (!fs.existsSync(tempAudioPath) || fs.statSync(tempAudioPath).size === 0) {
      throw new Error("Extracted temporary audio file is missing or empty.");
    }

    // 5. Transcribe using canonical Whisper implementation with word-level timestamps
    const audioStream = fs.createReadStream(tempAudioPath);
    try {
      transcriptResult = await transcribeAudioWithWhisper(audioStream);
    } finally {
      audioStream.destroy();
    }
  } catch (err: unknown) {
    console.error("Transcription: FAIL");
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Whisper transcription failed: ${message}`);
    process.exitCode = 1;
    return;
  } finally {
    // Clean up temporary audio file and directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore temp cleanup error
    }
  }

  const { transcript, cues } = transcriptResult;
  const wordCount = transcript.words.length;
  const cueCount = cues.length;

  // 6. Generate and write ASS subtitle file
  const baseName = sanitizeBasename(inputVideoPath);
  const assFilename = `${baseName}.ass`;
  const mp4Filename = `${baseName}-karaoke.mp4`;

  let assPath = "";
  try {
    assPath = writeAssFile(
      outputDir,
      cues,
      videoWidth,
      videoHeight,
      undefined,
      transcript.language ?? null,
      assFilename,
      { karaoke: true }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ASS generation failed: ${message}`);
    process.exit(1);
  }

  if (!fs.existsSync(assPath) || fs.statSync(assPath).size === 0) {
    console.error("Error: Generated ASS file does not exist or is empty.");
    process.exit(1);
  }

  // 7. Burn ASS subtitles onto the original video using FFmpeg
  const mp4Path = path.join(outputDir, mp4Filename);
  if (fs.existsSync(mp4Path)) {
    try {
      fs.unlinkSync(mp4Path);
    } catch {
      // Ignore removal error
    }
  }

  const escapedAssPath = escapeFfmpegFilterPath(assPath);

  // Attempt stream-copy audio first; fallback to AAC if audio stream is incompatible
  let ffmpegCmd = [
    "ffmpeg",
    "-y",
    "-i",
    `"${inputVideoPath}"`,
    "-vf",
    `"subtitles=${escapedAssPath}"`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    `"${mp4Path}"`,
  ].join(" ");

  try {
    execSync(ffmpegCmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    ffmpegCmd = [
      "ffmpeg",
      "-y",
      "-i",
      `"${inputVideoPath}"`,
      "-vf",
      `"subtitles=${escapedAssPath}"`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      `"${mp4Path}"`,
    ].join(" ");

    try {
      execSync(ffmpegCmd, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: FFmpeg real video rendering failed: ${message}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(mp4Path) || fs.statSync(mp4Path).size === 0) {
    console.error("Error: Output MP4 video does not exist or is empty.");
    process.exit(1);
  }

  // 8. Verify output video using ffprobe
  const probeCmd = `ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,duration -of json "${mp4Path}"`;
  let probeSuccess = false;

  try {
    const probeOutput = execSync(probeCmd, { encoding: "utf8" });
    const probeData = JSON.parse(probeOutput);
    const vStream = probeData?.streams?.find((s: Record<string, unknown>) => s.codec_type === "video");

    if (vStream && vStream.codec_name === "h264") {
      probeSuccess = true;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ffprobe inspection of output video failed: ${message}`);
    process.exit(1);
  }

  if (!probeSuccess) {
    console.error("Error: ffprobe did not find a valid H.264 video stream in output MP4.");
    process.exit(1);
  }

  // 9. Print console output
  console.log(`Task-00067 Karaoke Demo
Mode: real video

Input:
  ${inputVideoPath}

Transcription:
  Whisper PASS

Whisper words: ${wordCount}
Subtitle cues: ${cueCount}

ASS:
  task-67-demo/${assFilename}

Video:
  task-67-demo/${mp4Filename}

FFmpeg: PASS
ffprobe: PASS

Open the MP4 to visually inspect karaoke timing.`);
}

async function main(): Promise<void> {
  // Verify FFmpeg and ffprobe availability
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    console.error("Error: ffmpeg is not available on PATH.");
    process.exit(1);
  }

  try {
    execSync("ffprobe -version", { stdio: "ignore" });
  } catch {
    console.error("Error: ffprobe is not available on PATH.");
    process.exit(1);
  }

  // Prepare output directory
  const outputDir = path.resolve(process.cwd(), "task-67-demo");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const inputArg = resolveInputPath(process.argv.slice(2));

  if (inputArg) {
    await runRealVideoDemo(inputArg, outputDir);
  } else {
    await runSyntheticDemo(outputDir);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
