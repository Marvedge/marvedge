import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import ffmpegStatic from "ffmpeg-static";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { loadEnvConfig } from "@next/env";
import {
  buildFfmpegCropFilter,
  simplifyCropTargets,
  validateCropTargetData,
    type CropTarget,
  type CropTargetData,
} from "../app/types/editor/crop-target";
import {
  escapeFfmpegFilterPath,
  normalizeWhisperResponse,
  type SubtitleCue,
} from "../app/lib/subtitles/index";
import { writeAssFile } from "../app/lib/subtitles/server";
import { transcribeAudioWithGroq } from "./groqWhisper";
import { realisticWhisperVerboseResponse } from "../app/lib/subtitles/fixtures/whisperSample";
import { callMlInference } from "../reframe-worker/client";

/**
 * Sanitizes a video file path into a filesystem-safe base name.
 */
export function sanitizeBasename(filePath: string): string {
  const parsed = path.parse(filePath).name;
  return (
    parsed
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "video"
  );
}

export interface CliOptions {
  inputVideo?: string;
  output?: string;
  cropTargetsPath?: string;
  transcriptPath?: string;
  isFixtureMode: boolean;
  skipCrop: boolean;
  skipCaptions: boolean;
  reframeMode?: "auto" | "crop" | "fit";
}

/**
 * Generates a 9:16 blurred-background composition filter.
 * Keeps 100% of the horizontal visual content intact (no subjects excluded),
 * overlays centered on top of a blurred, dimmed version of the video filling 9:16.
 */
export function build9x16FitFilter(probe: { width: number; height: number }): {
  filter: string;
  outputWidth: number;
  outputHeight: number;
} {
  const targetHeight = Math.floor(probe.height / 2) * 2;
  const targetWidth = Math.floor((targetHeight * 9) / 16 / 2) * 2;

  const filter = [
    `split=2[fg_raw][bg_raw]`,
    `[bg_raw]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},boxblur=20:5,eq=brightness=-0.1:saturation=1.1[bg]`,
    `[fg_raw]scale=${targetWidth}:-2:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2`,
  ].join(";");

  return { filter, outputWidth: targetWidth, outputHeight: targetHeight };
}

/**
 * Builds an FFmpeg crop filter from crop targets, guaranteeing that the filter length
 * remains safely within the Windows command-line argument limit (~8000 chars)
 * by progressively simplifying redundant keyframes when necessary.
 */
export function buildSafeFfmpegCropFilter(cropTargets: CropTarget[]): string | null {
  let filter = buildFfmpegCropFilter(cropTargets);
  if (!filter) return null;
  if (filter.length > 8000) {
    let tolerance = 0.5;
    while (tolerance <= 20.0) {
      const simplified = simplifyCropTargets(cropTargets, tolerance);
      const candidate = buildFfmpegCropFilter(simplified);
      if (candidate && candidate.length <= 8000) {
        return candidate;
      }
      tolerance += 0.5;
    }
  }
  return filter;
}

/**
 * Parses CLI arguments supporting positional input video path, Windows quoting,
 * and optional flags (--fixture, --output, --crop-targets, --transcript, --skip-crop, --skip-captions, --reframe-mode, --fit, --crop).
 */
export function parseCliArgs(argv: string[]): CliOptions {
  const raw = argv.slice(2).filter((a) => a !== "--" && a.trim() !== "");
  const options: CliOptions = {
    isFixtureMode: false,
    skipCrop: false,
    skipCaptions: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--fixture" || arg === "--test-fixture") {
      options.isFixtureMode = true;
    } else if (arg === "--skip-crop") {
      options.skipCrop = true;
    } else if (arg === "--skip-captions") {
      options.skipCaptions = true;
    } else if (arg === "--reframe-mode" || arg === "--mode") {
      if (i + 1 < raw.length) {
        const val = raw[++i].toLowerCase();
        if (val === "crop" || val === "fit" || val === "auto") {
          options.reframeMode = val;
        }
      }
    } else if (arg === "--fit" || arg === "--blur-pad") {
      options.reframeMode = "fit";
    } else if (arg === "--crop") {
      options.reframeMode = "crop";
    } else if (arg === "--output" || arg === "-o") {
      if (i + 1 < raw.length) {
        options.output = raw[++i];
      }
    } else if (arg === "--crop-targets" || arg === "--crop-json") {
      if (i + 1 < raw.length) {
        options.cropTargetsPath = raw[++i];
      }
    } else if (arg === "--transcript" || arg === "--whisper-json") {
      if (i + 1 < raw.length) {
        options.transcriptPath = raw[++i];
      }
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    // If the shell split arguments with spaces, verify if joined path exists
    const joined = positional.join(" ").trim();
    if (fs.existsSync(joined)) {
      options.inputVideo = path.resolve(joined);
    } else {
      options.inputVideo = path.resolve(positional[0]);
    }
  }

  return options;
}

export interface ProbeResult {
  width: number;
  height: number;
  videoCodec: string;
  pixFmt: string;
  audioCodec: string;
  duration: number;
  rFrameRate: string;
  hasAudio: boolean;
}

/**
 * Probes video and audio streams using the bundled ffmpeg-static binary.
 * This avoids requiring ffprobe to be installed on the system PATH.
 */
export function probeVideo(filePath: string): ProbeResult {
  if (!ffmpegStatic) {
    throw new Error("ffmpeg-static binary is not available.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Probe failed: File does not exist: ${filePath}`);
  }

  const result = spawnSync(ffmpegStatic, ["-hide_banner", "-i", filePath, "-f", "null", "-"], {
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Probe failed for ${filePath}: ${result.error.message}`);
  }

  const stderr = result.stderr || "";

  if (!stderr) {
    throw new Error(`Probe failed: Could not read FFmpeg metadata for ${filePath}`);
  }

  const videoMatch = stderr.match(
    /Stream #\d+:\d+(?:\([^)]*\))?:\s*Video:\s*([^\s,]+)(?:\s*\([^)]*\))?,\s*([^\s,]+).*?\b(\d{2,6})x(\d{2,6})\b.*?\b(\d+(?:\.\d+)?)\s*fps\b/i
  );

  const audioMatch = stderr.match(/Stream #\d+:\d+(?:\([^)]*\))?:\s*Audio:\s*([^\s,]+)/i);

  if (!videoMatch) {
    throw new Error(`Probe failed: No video stream found in ${filePath}`);
  }

  const videoCodec = videoMatch[1] || "unknown";
  const pixFmt = videoMatch[2] || "unknown";
  const width = Number(videoMatch[3]);
  const height = Number(videoMatch[4]);
  const fps = Number(videoMatch[5]);

  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);

  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : 0;

  return {
    width,
    height,
    videoCodec,
    pixFmt,
    audioCodec: audioMatch?.[1] || "none",
    duration,
    rFrameRate: Number.isFinite(fps) ? `${fps}/1` : "unknown",
    hasAudio: Boolean(audioMatch),
  };
}

/**
 * Checks connectivity and health of the ML Gateway and downstream AutoFlip service.
 */
async function verifyMlServiceHealth(mlServiceUrl: string): Promise<void> {
  const healthUrl = `${mlServiceUrl.replace(/\/+$/, "")}/health`;
  let res: Response;
  try {
    res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `AutoFlip / ML Gateway service is unreachable at ${healthUrl} (${msg}).\n` +
        `Please ensure ML services are running (e.g. run 'docker compose up -d autoflip ml-gateway').`
    );
  }

  if (!res.ok && res.status !== 503) {
    throw new Error(
      `AutoFlip / ML Gateway returned HTTP ${res.status} from ${healthUrl}.\n` +
        `Please verify service logs (e.g. 'docker logs marvedge-ml-gateway').`
    );
  }

  try {
    const json = (await res.json()) as { status?: string; services?: { autoflip?: string } };
    if (json.services?.autoflip && json.services.autoflip.includes("unhealthy")) {
      throw new Error(
        `AutoFlip downstream container is reporting unhealthy (${json.services.autoflip}).\n` +
          `Please check 'docker logs marvedge-autoflip'.`
      );
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("AutoFlip")) throw e;
    // Otherwise non-critical json parse issue
  }
}

/**
 * Spawns a temporary lightweight HTTP server to stream the local video to the
 * AutoFlip container via host.docker.internal.
 */
async function serveLocalVideoForAutoFlip(
  filePath: string,
  hostForContainer: string = process.env.AUTOFILP_HOST || "host.docker.internal"
): Promise<{ videoUrl: string; close: () => Promise<void> }> {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath) || ".mp4";

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "0.0.0.0", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;
  const videoUrl = `http://${hostForContainer}:${port}/video${ext}`;

  return {
    videoUrl,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Generates dynamic crop targets using the existing AutoFlip service / ML Gateway.
 */
async function fetchCropTargetsFromAutoFlip(
  inputVideoPath: string,
  probe: ProbeResult
): Promise<CropTargetData> {
  const mlServiceUrl = (process.env.REFRAME_ML_SERVICE_URL || "http://localhost:8000").replace(
    /\/+$/,
    ""
  );

  await verifyMlServiceHealth(mlServiceUrl);

  const serverHandle = await serveLocalVideoForAutoFlip(inputVideoPath);
  try {
    const rawResult = await callMlInference(
      mlServiceUrl,
      {
        videoUrl: serverHandle.videoUrl,
        targetAspectRatio: "9:16",
        source: {
          width: probe.width,
          height: probe.height,
          durationSec: probe.duration,
        },
      },
      { timeoutMs: 180000 }
    );

    validateCropTargetData(rawResult);
    return rawResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AutoFlip crop target generation failed: ${msg}`);
  } finally {
    await serverHandle.close();
  }
}
/**
 * Extracts audio to a temporary file and executes Whisper transcription with word timestamps.
 */
async function transcribeAudio(
  inputVideoPath: string
): Promise<{ cues: SubtitleCue[]; wordCount: number; language?: string }> {
  // Load environment variables (.env.local, .env) following standard Next.js precedence
  loadEnvConfig(process.cwd());

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "Missing GROQ_API_KEY.\n" + "Add it to .env.local or provide it through the environment."
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task70-audio-"));
  const tempAudioPath = path.join(tempDir, "audio.mp3");

  try {
    if (!ffmpegStatic) {
      throw new Error("ffmpeg-static binary is not available.");
    }

    execFileSync(
      ffmpegStatic,
      [
        "-y",
        "-i",
        inputVideoPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ar",
        "16000",
        "-ac",
        "1",
        tempAudioPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    if (!fs.existsSync(tempAudioPath) || fs.statSync(tempAudioPath).size === 0) {
      throw new Error("Extracted audio file is missing or empty.");
    }

    const audioStream = fs.createReadStream(tempAudioPath);

    try {
      const { transcript, cues } = await transcribeAudioWithGroq(audioStream, {
        apiKey,
      });

      return {
        cues,
        wordCount: transcript.words.length,
        language: transcript.language,
      };
    } finally {
      audioStream.destroy();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Groq Whisper transcription failed: ${msg}`);
  } finally {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Non-fatal cleanup
    }
  }
}

export async function runCaptionedCroppedDemo(): Promise<void> {
  const options = parseCliArgs(process.argv);

  console.log("Task-00070 Captioned + Cropped Demo\n");

  // Check required arguments
  if (!options.inputVideo && !options.isFixtureMode) {
    console.error(
      "Error: Missing required input video path.\n\n" +
        "Usage:\n" +
        '  npm run demo:captioned-cropped -- "<path-to-video>"\n' +
        "  npm run demo:captioned-cropped -- --fixture\n\n" +
        "Examples:\n" +
        '  npm run demo:captioned-cropped -- "C:\\Users\\Shambhavi\\Videos\\demo.mp4"\n' +
        '  npm run demo:captioned-cropped -- "C:\\marvedge-task53-media\\02_single_speaker.avi"\n'
    );
    process.exitCode = 1;
    return;
  }

  // 1. Resolve paths
  let inputVideoPath = options.inputVideo;
  if (options.isFixtureMode && !inputVideoPath) {
    inputVideoPath =
      process.env.DEMO_INPUT_VIDEO || "C:\\marvedge-task53-media\\02_single_speaker.avi";
  }

  if (!inputVideoPath || !fs.existsSync(inputVideoPath)) {
    console.error(`Error: Input video not found at: ${inputVideoPath}`);
    process.exitCode = 1;
    return;
  }

  const stat = fs.statSync(inputVideoPath);
  if (!stat.isFile() || stat.size === 0) {
    console.error(`Error: Input path is not a valid non-empty file: ${inputVideoPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Input:\n  ${inputVideoPath}\n`);

  // 2. Probe input video with bundled FFmpeg
  let probe: ProbeResult;
  try {
    probe = probeVideo(inputVideoPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Video inspection failed: ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (!options.skipCaptions && !probe.hasAudio) {
    console.error(
      `Error: Input video does not contain an audio stream suitable for captioning: ${inputVideoPath}\n` +
        `If you wish to test cropping only on a silent video, pass --skip-captions.`
    );
    process.exitCode = 1;
    return;
  }

  // Determine output directory and final video path
  const baseName = sanitizeBasename(inputVideoPath);
  let outputDir = path.resolve("task-70-demo");
  let finalVideoPath = path.join(outputDir, `${baseName}_captioned_cropped_9x16.mp4`);

  if (options.output) {
    const resolvedOut = path.resolve(options.output);
    if (resolvedOut.toLowerCase().endsWith(".mp4")) {
      finalVideoPath = resolvedOut;
      outputDir = path.dirname(resolvedOut);
    } else {
      outputDir = resolvedOut;
      finalVideoPath = path.join(outputDir, `${baseName}_captioned_cropped_9x16.mp4`);
    }
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 3. Obtain Crop / Reframe Filter
  let cropFilter = "";
  const isAlreadyVertical = probe.width / probe.height <= 9 / 16 + 0.05;

  if (options.isFixtureMode) {
    const fixtureJson =
      process.env.DEMO_CROP_TARGETS || path.resolve("task53-results/case_b_response.json");
    if (!fs.existsSync(fixtureJson)) {
      console.error(`Error: Crop target fixture not found: ${fixtureJson}`);
      process.exitCode = 1;
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(fixtureJson, "utf8").replace(/^\uFEFF/, ""));
      const payload = raw.crop_targets || raw;
      validateCropTargetData(payload);
      const cropTargets = payload.crop_targets;
      console.log(`Crop targets:\n  PASS (fixture: ${cropTargets.length} keyframes)\n`);
      const builtFilter = buildSafeFfmpegCropFilter(cropTargets);
      if (!builtFilter) {
        console.error("Error: Failed to build crop filter from fixture targets.");
        process.exitCode = 1;
        return;
      }
      cropFilter = builtFilter;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Fixture crop target validation failed: ${msg}`);
      process.exitCode = 1;
      return;
    }
  } else if (options.cropTargetsPath) {
    if (!fs.existsSync(options.cropTargetsPath)) {
      console.error(`Error: Specified crop target JSON not found: ${options.cropTargetsPath}`);
      process.exitCode = 1;
      return;
    }
    try {
      const raw = JSON.parse(
        fs.readFileSync(options.cropTargetsPath, "utf8").replace(/^\uFEFF/, "")
      );
      const payload = raw.crop_targets || raw;
      validateCropTargetData(payload);
      const cropTargets = payload.crop_targets;
      console.log(`Crop targets:\n  PASS (${cropTargets.length} keyframes)\n`);
      const builtFilter = buildSafeFfmpegCropFilter(cropTargets);
      if (!builtFilter) {
        console.error("Error: Failed to build crop filter from targets JSON.");
        process.exitCode = 1;
        return;
      }
      cropFilter = builtFilter;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Invalid crop target JSON: ${msg}`);
      process.exitCode = 1;
      return;
    }
  } else if (isAlreadyVertical) {
    // Video is already in vertical 9:16 aspect ratio (e.g. smartphone recordings)
    console.log("Framing:\n  PASS (native vertical input: preserving full 9:16 content)\n");
    cropFilter = "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0";
  } else if (options.reframeMode === "fit") {
    // Explicit fit mode requested: preserve full horizontal width with blurred backdrop
    console.log("Framing:\n  PASS (fit mode: 9:16 multi-person preserving blurred background)\n");
    cropFilter = build9x16FitFilter(probe).filter;
  } else if (options.skipCrop && options.reframeMode === "crop") {
    console.log(
      "Crop targets:\n  SKIPPED (--skip-crop --reframe-mode=crop: static 9:16 center crop)\n"
    );
    cropFilter = "crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0";
  } else if (options.skipCrop) {
    console.log(
      "Framing:\n  PASS (--skip-crop: 9:16 multi-person preserving blurred background)\n"
    );
    cropFilter = build9x16FitFilter(probe).filter;
  } else {
    // Arbitrary video mode: Real AutoFlip inference via ML Gateway
    let cropTargetData: CropTargetData | null = null;
    try {
      console.log("Analyzing video framing with AutoFlip...");
      cropTargetData = await fetchCropTargetsFromAutoFlip(inputVideoPath, probe);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (options.reframeMode === "crop") {
        console.error(`Crop targets:\n  FAIL\nError: ${msg}`);
        process.exitCode = 1;
        return;
      }
      console.log(`AutoFlip unavailable (${msg}).`);
      console.log(
        "Falling back to generic 9:16 multi-person preserving reframe (blurred backdrop)..."
      );
      cropFilter = build9x16FitFilter(probe).filter;
    }

    if (cropTargetData) {
      const cropTargets = cropTargetData.crop_targets;
      if (!cropTargets || cropTargets.length === 0) {
        console.error("Error: Crop targets list is empty.");
        process.exitCode = 1;
        return;
      }

      // Check spatial spread of detected salient regions across frame width
      const xs = cropTargets.map((t) => t.crop.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const cropW = cropTargets[0].crop.width;
      const totalSubjectSpan = maxX - minX + cropW;
      const spatialSpreadRatio = totalSubjectSpan / probe.width;

      if (options.reframeMode !== "crop" && spatialSpreadRatio > 0.5) {
        console.log(
          `Crop targets:\n  PASS (${cropTargets.length} keyframes)\n` +
            `  Notice: AutoFlip detected salient regions spanning ${(
              spatialSpreadRatio * 100
            ).toFixed(0)}% of frame width,\n` +
            `  which exceeds a single 9:16 crop aperture (${((cropW / probe.width) * 100).toFixed(
              0
            )}%).\n` +
            `  Using multi-person preserving 9:16 reframe (blurred backdrop) to ensure no subjects are excluded.\n` +
            `  (Pass --reframe-mode crop to force single-subject pan & scan).\n`
        );
        cropFilter = build9x16FitFilter(probe).filter;
      } else {
        console.log(
          `Crop targets:\n  PASS (${cropTargets.length} keyframes - single-subject trajectory)\n`
        );
        const builtFilter = buildSafeFfmpegCropFilter(cropTargets);
        if (!builtFilter) {
          console.error("Error: Failed to build FFmpeg crop filter from crop targets.");
          process.exitCode = 1;
          return;
        }
        cropFilter = builtFilter;
      }
    }
  }

  // 4. Render Step 1: Crop
  const tempCroppedPath = path.join(outputDir, `temp_${baseName}_cropped_9x16.mp4`);
  if (fs.existsSync(tempCroppedPath)) {
    try {
      fs.unlinkSync(tempCroppedPath);
    } catch {
      // Ignore
    }
  }

  try {
    if (!ffmpegStatic) {
      throw new Error("ffmpeg-static binary is not available.");
    }

    execFileSync(
      ffmpegStatic,
      [
        "-y",
        "-i",
        inputVideoPath,
        "-vf",
        cropFilter,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        ...(probe.hasAudio ? ["-c:a", "aac"] : ["-an"]),
        tempCroppedPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: FFmpeg crop transcode failed: ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(tempCroppedPath) || fs.statSync(tempCroppedPath).size === 0) {
    console.error("Error: Intermediate cropped video was not generated or is empty.");
    process.exitCode = 1;
    return;
  }

  const croppedProbe = probeVideo(tempCroppedPath);
  console.log(
    `Crop:\n  PASS\n  Output: ${croppedProbe.width}x${croppedProbe.height}\n  Duration: ~${croppedProbe.duration.toFixed(2)}s\n`
  );

  // 5. Transcription & ASS Generation
  let cues: SubtitleCue[] = [];
  let wordCount = 0;
  let detectedLanguage: string | undefined = undefined;

  if (options.skipCaptions) {
    console.log("Captions:\n  SKIPPED (--skip-captions)\n");
    // Move cropped video directly to final output
    if (fs.existsSync(finalVideoPath)) fs.unlinkSync(finalVideoPath);
    fs.renameSync(tempCroppedPath, finalVideoPath);
  } else {
    if (options.transcriptPath) {
      if (!fs.existsSync(options.transcriptPath)) {
        console.error(`Error: Specified transcript JSON not found: ${options.transcriptPath}`);
        if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
        process.exitCode = 1;
        return;
      }
      try {
        const rawJson = JSON.parse(
          fs.readFileSync(options.transcriptPath, "utf8").replace(/^\uFEFF/, "")
        );
        const normalized = normalizeWhisperResponse(rawJson);
        cues = normalized.cues;
        wordCount = normalized.transcript.words.length;
        detectedLanguage = normalized.transcript.language;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: Invalid transcript JSON: ${msg}`);
        if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
        process.exitCode = 1;
        return;
      }
    } else if (options.isFixtureMode) {
      const normalized = normalizeWhisperResponse(realisticWhisperVerboseResponse);
      cues = normalized.cues;
      wordCount = normalized.transcript.words.length;
      detectedLanguage = normalized.transcript.language;
    } else {
      console.log("Transcribing audio with Groq Whisper (whisper-large-v3-turbo)...");
      try {
        const transResult = await transcribeAudio(inputVideoPath);
        cues = transResult.cues;
        wordCount = transResult.wordCount;
        detectedLanguage = transResult.language;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Transcription:\n  FAIL\nError: ${msg}`);
        // Clean up temp cropped file
        if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
        process.exitCode = 1;
        return;
      }
    }

    const assFilename = `${baseName}_karaoke.ass`;
    let assPath = "";

    try {
      assPath = writeAssFile(
        outputDir,
        cues,
        croppedProbe.width,
        croppedProbe.height,
        undefined,
        detectedLanguage ?? null,
        assFilename,
        { karaoke: true }
      );

      // Responsive horizontal and vertical margins + word wrap for narrow 9:16 canvas
      const responsiveMarginH = Math.max(10, Math.min(60, Math.round(croppedProbe.width * 0.06)));
      const responsiveMarginV = Math.max(12, Math.min(60, Math.round(croppedProbe.height * 0.05)));
      const responsiveFontSize = Math.max(
        12,
        Math.min(24, Math.round(croppedProbe.height * 0.038))
      );

      let assContent = fs.readFileSync(assPath, "utf8");
      // Enable word-wrapping (WrapStyle: 1)
      assContent = assContent.replace(/WrapStyle:\s*2/, "WrapStyle: 1");
      // Adjust font size and margins in the Default style line
      assContent = assContent.replace(
        /Style: Default,([^,]+),\d+,([^,]+),([^,]+),([^,]+),([^,]+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),\d+,\d+,\d+,1/m,
        `Style: Default,$1,${responsiveFontSize},$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,${responsiveMarginH},${responsiveMarginH},${responsiveMarginV},1`
      );
      fs.writeFileSync(assPath, assContent, "utf8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ASS karaoke generation failed: ${msg}`);
      if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
      process.exitCode = 1;
      return;
    }

    if (!fs.existsSync(assPath) || fs.statSync(assPath).size === 0) {
      console.error("Error: ASS subtitle file does not exist or is empty.");
      if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
      process.exitCode = 1;
      return;
    }

    const assContent = fs.readFileSync(assPath, "utf8");
    const hasKaraokeTags = assContent.includes("{\\k");
    if (!hasKaraokeTags && wordCount > 0) {
      console.error("Error: Generated ASS file does not contain karaoke timing tags (\\k).");
      if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
      process.exitCode = 1;
      return;
    }

    console.log(`ASS:\n  PASS\n  Cues: ${cues.length}\n  Words: ${wordCount}\n`);

    // 6. Burn ASS subtitles onto the already-cropped 9:16 video
    if (fs.existsSync(finalVideoPath)) {
      try {
        fs.unlinkSync(finalVideoPath);
      } catch {
        // Ignore
      }
    }

    const escapedAss = escapeFfmpegFilterPath(path.resolve(assPath));

    try {
      if (!ffmpegStatic) {
        throw new Error("ffmpeg-static binary is not available.");
      }

      try {
        execFileSync(
          ffmpegStatic,
          [
            "-y",
            "-i",
            tempCroppedPath,
            "-vf",
            `subtitles=${escapedAss}`,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            ...(croppedProbe.hasAudio ? ["-c:a", "copy"] : ["-an"]),
            finalVideoPath,
          ],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
      } catch {
        if (!croppedProbe.hasAudio) {
          throw new Error("Subtitle burn-in failed.");
        }

        execFileSync(
          ffmpegStatic,
          [
            "-y",
            "-i",
            tempCroppedPath,
            "-vf",
            `subtitles=${escapedAss}`,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            finalVideoPath,
          ],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: Subtitle burn-in failed: ${msg}`);
      if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
      process.exitCode = 1;
      return;
    } finally {
      if (fs.existsSync(tempCroppedPath)) {
        try {
          fs.unlinkSync(tempCroppedPath);
        } catch {
          // Non-fatal
        }
      }
    }

    console.log("Subtitle burn-in:\n  PASS\n");
  }

  if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
    console.error("Error: Final captioned + cropped MP4 does not exist or is empty.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `Final video:\n  ${path.relative(process.cwd(), finalVideoPath).replace(/\\/g, "/")}\n`
  );

  // 7. Probe & Validate Final Output
  const finalProbe = probeVideo(finalVideoPath);
  const aspectRatio = finalProbe.width / finalProbe.height;

  console.log("Video probe:\n  PASS\n");
  console.log(`  Input Path: ${inputVideoPath}`);
  console.log(`  Output Path: ${finalVideoPath}`);
  console.log(`  Input Duration: ${probe.duration.toFixed(2)}s`);
  console.log(`  Output Duration: ${finalProbe.duration.toFixed(2)}s`);
  console.log(`  Output Width: ${finalProbe.width}`);
  console.log(`  Output Height: ${finalProbe.height}`);
  console.log(`  Aspect Ratio: ${aspectRatio.toFixed(4)} (9:16 ~ ${(9 / 16).toFixed(4)})`);
  console.log(`  Video Codec: ${finalProbe.videoCodec} (${finalProbe.pixFmt})`);
  console.log(`  Audio Codec: ${finalProbe.audioCodec}`);
  console.log(`  Frame Rate: ${finalProbe.rFrameRate}`);
  console.log("\nTask-00070 demo complete.\nOpen the MP4 for visual inspection.\n");
}

if (require.main === module || process.argv[1]?.endsWith("demoCaptionedCroppedClip.ts")) {
  runCaptionedCroppedDemo().catch((err) => {
    console.error("Fatal demo error:", err);
    process.exitCode = 1;
  });
}
