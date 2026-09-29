import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  buildFfmpegCropFilter,
  simplifyCropTargets,
  validateCropTargetData,
  type CropTargetData,
} from "../app/types/editor/crop-target";
import {
  escapeFfmpegFilterPath,
  normalizeWhisperResponse,
  writeAssFile,
} from "../app/lib/subtitles/index";
import { realisticWhisperVerboseResponse } from "../app/lib/subtitles/fixtures/whisperSample";

/**
 * Resolves input argument paths from CLI args, accounting for Windows quoting.
 */
function resolveCliArg(index: number, fallback: string): string {
  const args = process.argv.slice(2).filter((a) => a !== "--" && a.trim() !== "");
  if (args[index] && args[index].trim()) {
    return path.resolve(args[index].trim());
  }
  return fallback;
}

/**
 * Computes responsive horizontal margin for 9:16 portrait subtitles.
 * Mirrors the canonical formula from cloudrun-worker/render.js and style.ts.
 */
function computeSubtitleMarginHPx(frameWidth: number): number {
  const w = Number(frameWidth);
  if (!Number.isFinite(w) || w <= 0) return 60;
  return Math.max(16, Math.min(60, Math.round(w * 0.05)));
}

interface ProbeResult {
  width: number;
  height: number;
  videoCodec: string;
  pixFmt: string;
  audioCodec: string;
  duration: number;
  rFrameRate: string;
}

function probeVideo(filePath: string): ProbeResult {
  const cmd = `ffprobe -v error -show_entries stream=codec_name,codec_type,width,height,pix_fmt,duration,r_frame_rate -show_entries format=duration -of json "${filePath}"`;
  const stdout = execSync(cmd, { encoding: "utf8" });
  const data = JSON.parse(stdout);

  const vStream = (data.streams || []).find((s: { codec_type: string }) => s.codec_type === "video");
  const aStream = (data.streams || []).find((s: { codec_type: string }) => s.codec_type === "audio");

  if (!vStream) {
    throw new Error(`Probe failed: No video stream found in ${filePath}`);
  }

  const formatDuration = parseFloat(data.format?.duration || "0");
  const streamDuration = parseFloat(vStream.duration || "0");

  return {
    width: vStream.width,
    height: vStream.height,
    videoCodec: vStream.codec_name,
    pixFmt: vStream.pix_fmt,
    audioCodec: aStream?.codec_name || "none",
    duration: streamDuration > 0 ? streamDuration : formatDuration,
    rFrameRate: vStream.r_frame_rate || "unknown",
  };
}

export async function runCaptionedCroppedDemo(): Promise<void> {
  // 1. Resolve paths
  const defaultVideo = process.env.DEMO_INPUT_VIDEO || "C:\\marvedge-task53-media\\02_single_speaker.avi";
  const defaultCropJson = process.env.DEMO_CROP_TARGETS || path.resolve("task53-results/case_b_response.json");
  const defaultOutDir = process.env.DEMO_OUTPUT_DIR || path.resolve("task-70-demo");

  const inputVideoPath = resolveCliArg(0, defaultVideo);
  const cropJsonPath = resolveCliArg(1, defaultCropJson);
  const outputDir = resolveCliArg(2, defaultOutDir);

  console.log("Task-00070 Captioned + Cropped Demo\n");
  console.log(`Input:\n  ${inputVideoPath}\n`);

  // 2. Validate input video
  if (!fs.existsSync(inputVideoPath)) {
    console.error(`Error: Input video not found at: ${inputVideoPath}`);
    process.exit(1);
  }

  // 3. Validate crop target JSON fixture
  if (!fs.existsSync(cropJsonPath)) {
    console.error(`Error: Crop target JSON fixture not found at: ${cropJsonPath}`);
    process.exit(1);
  }

  let cropTargetData: CropTargetData;
  try {
    const rawJsonStr = fs.readFileSync(cropJsonPath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(rawJsonStr);
    const targetPayload = parsed.crop_targets || parsed;
    validateCropTargetData(targetPayload);
    cropTargetData = targetPayload as CropTargetData;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Crop targets validation failed: ${msg}`);
    process.exit(1);
  }

  const cropTargets = cropTargetData.crop_targets;
  if (!cropTargets || cropTargets.length === 0) {
    console.error("Error: Crop target JSON contains no crop_targets.");
    process.exit(1);
  }
  console.log("Crop targets:\n  PASS\n");

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const cropWidth = Math.max(1, Math.round(cropTargets[0].crop.width));
  const cropHeight = Math.max(1, Math.round(cropTargets[0].crop.height));

  // 4. Build dynamic crop filter & run Step 1: Crop
  let cropFilter = buildFfmpegCropFilter(cropTargets);
  if (!cropFilter) {
    console.error("Error: Failed to build FFmpeg crop filter from crop targets.");
    process.exit(1);
  }

  // If filter expression exceeds Windows command line safe limit (~8000 chars),
  // adaptively simplify crop targets using simplifyCropTargets with increasing pixel tolerance.
  if (cropFilter.length > 8000) {
    let tolerance = 0.6;
    while (tolerance <= 2.0) {
      const simplified = simplifyCropTargets(cropTargets, tolerance);
      const candidate = buildFfmpegCropFilter(simplified);
      if (candidate && candidate.length <= 8000) {
        cropFilter = candidate;
        break;
      }
      tolerance += 0.2;
    }
  }

  const tempCroppedPath = path.join(outputDir, "temp_cropped_9x16.mp4");
  if (fs.existsSync(tempCroppedPath)) {
    try {
      fs.unlinkSync(tempCroppedPath);
    } catch {
      // Ignore
    }
  }

  try {
    const cropCmd = [
      "ffmpeg",
      "-y",
      "-i",
      `"${inputVideoPath}"`,
      "-vf",
      `"${cropFilter}"`,
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
      `"${tempCroppedPath}"`,
    ].join(" ");

    execSync(cropCmd, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: FFmpeg crop transcode failed: ${msg}`);
    process.exit(1);
  }

  if (!fs.existsSync(tempCroppedPath) || fs.statSync(tempCroppedPath).size === 0) {
    console.error("Error: Intermediate cropped video was not generated or is empty.");
    process.exit(1);
  }

  const croppedProbe = probeVideo(tempCroppedPath);
  console.log(`Crop:\n  PASS\n  Output: ${croppedProbe.width}x${croppedProbe.height}\n  Duration: ~${croppedProbe.duration.toFixed(2)}s\n`);

  // 5. Generate ASS Subtitles with Karaoke Timing
  let cueCount = 0;
  let wordCount = 0;
  const assFilename = "single_speaker_karaoke.ass";
  let assPath = "";

  try {
    const { transcript, cues } = normalizeWhisperResponse(realisticWhisperVerboseResponse);
    cueCount = cues.length;
    wordCount = transcript.words.length;

    assPath = writeAssFile(outputDir, cues, cropWidth, cropHeight, undefined, null, assFilename, {
      karaoke: true,
    });

    // Apply responsive horizontal margin (12px on 202w) and WrapStyle: 1 (word wrap)
    // so captions do not bleed off the edges of the narrow 9:16 portrait canvas.
    const responsiveMarginH = Math.max(10, Math.min(60, Math.round(cropWidth * 0.06)));
    const responsiveMarginV = Math.max(12, Math.min(60, Math.round(cropHeight * 0.05)));
    const responsiveFontSize = Math.max(12, Math.min(24, Math.round(cropHeight * 0.038)));

    let assContent = fs.readFileSync(assPath, "utf8");
    // Enable word-wrapping (WrapStyle: 1) instead of no-wrap (WrapStyle: 2)
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
    process.exit(1);
  }

  if (!fs.existsSync(assPath) || fs.statSync(assPath).size === 0) {
    console.error("Error: ASS subtitle file does not exist or is empty.");
    process.exit(1);
  }

  const assContent = fs.readFileSync(assPath, "utf8");
  if (!assContent.includes("{\\k")) {
    console.error("Error: Generated ASS file does not contain karaoke timing tags (\\k).");
    process.exit(1);
  }

  console.log(`ASS:\n  PASS\n  Cues: ${cueCount}\n  Words: ${wordCount}\n`);

  // 6. Burn ASS subtitles onto the 9:16 cropped video
  const finalVideoFilename = "single_speaker_captioned_cropped_9x16.mp4";
  const finalVideoPath = path.join(outputDir, finalVideoFilename);

  if (fs.existsSync(finalVideoPath)) {
    try {
      fs.unlinkSync(finalVideoPath);
    } catch {
      // Ignore
    }
  }

  try {
    const escapedAss = escapeFfmpegFilterPath(path.resolve(assPath));
    const burnCmd = [
      "ffmpeg",
      "-y",
      "-i",
      `"${tempCroppedPath}"`,
      "-vf",
      `"subtitles=${escapedAss}"`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy",
      `"${finalVideoPath}"`,
    ].join(" ");

    execSync(burnCmd, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: Subtitle burn-in failed: ${msg}`);
    process.exit(1);
  }

  if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
    console.error("Error: Final captioned + cropped MP4 does not exist or is empty.");
    process.exit(1);
  }

  console.log("Subtitle burn-in:\n  PASS\n");
  console.log(`Final video:\n  ${path.relative(process.cwd(), finalVideoPath).replace(/\\/g, "/")}\n`);

  // 7. Cleanup intermediate temp files
  try {
    if (fs.existsSync(tempCroppedPath)) fs.unlinkSync(tempCroppedPath);
  } catch {
    // Non-fatal
  }

  // 8. Probe & Validate Final Output
  const finalProbe = probeVideo(finalVideoPath);
  console.log("ffprobe:\n  PASS\n");
  console.log(`  Dimensions: ${finalProbe.width}x${finalProbe.height}`);
  console.log(`  Aspect Ratio: ${(finalProbe.width / finalProbe.height).toFixed(4)} (9:16 ~ ${(9 / 16).toFixed(4)})`);
  console.log(`  Duration: ${finalProbe.duration.toFixed(2)}s`);
  console.log(`  Video Codec: ${finalProbe.videoCodec} (${finalProbe.pixFmt})`);
  console.log(`  Audio Codec: ${finalProbe.audioCodec}`);
  console.log(`  Frame Rate: ${finalProbe.rFrameRate}`);
  console.log("\nTask-00070 demo complete.\nOpen the MP4 for visual inspection.\n");
}

if (require.main === module || process.argv[1]?.endsWith("demoCaptionedCroppedClip.ts")) {
  runCaptionedCroppedDemo().catch((err) => {
    console.error("Fatal demo error:", err);
    process.exit(1);
  });
}
