// Self-contained video rendering and Cloudinary export helper for Reframe Worker (Task-00032).
//
// Responsibilities:
// 1. Download source video over HTTP(S) to a temporary directory.
// 2. Call buildFfmpegCropFilter() to construct dynamic piecewise FFmpeg crop trajectory.
// 3. Execute FFmpeg with libx264, aac, yuv420p, +faststart to produce reframed MP4.
// 4. Upload resulting MP4 to Cloudinary folder "reframed_exports" and return secure_url.
// 5. Always clean up temporary files in a finally block.
//
// ZERO Prisma / Postgres / Redis imports.

import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import {
  buildFfmpegCropFilter,
  type CropTargetData,
} from "../app/types/editor/crop-target";
import cloudinary from "../app/lib/cloudinary";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface RenderReframedVideoOptions {
  timeoutMs?: number;
  crf?: number;
  preset?: string;
}

export interface RenderReframedVideoDeps {
  downloadVideo?: (url: string, destPath: string) => Promise<void>;
  runFfmpeg?: (
    inputPath: string,
    outputPath: string,
    cropFilter: string,
    options?: { timeoutMs?: number; crf?: number; preset?: string }
  ) => Promise<void>;
  uploadToCloudinary?: (filePath: string) => Promise<{ secure_url: string }>;
}

/**
 * Downloads remote video stream over HTTP(S) into local destination path.
 */
async function defaultDownloadVideo(url: string, destPath: string): Promise<void> {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 60000,
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", (err) => {
      writer.close();
      reject(err);
    });
  });
}

/**
 * Executes fluent-ffmpeg with dynamic crop filter, libx264, aac, yuv420p, and +faststart.
 */
function defaultRunFfmpeg(
  inputPath: string,
  outputPath: string,
  cropFilter: string,
  options: { timeoutMs?: number; crf?: number; preset?: string } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 180000;
  const crf = options.crf ?? 23;
  const preset = options.preset ?? "fast";

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let killed = false;

    const outputOptions = [
      `-preset ${preset}`,
      `-crf ${crf}`,
      "-pix_fmt yuv420p",
      "-movflags +faststart",
    ];

    const cmd: any = ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac");

    if (cropFilter.length > 8000) {
      const scriptPath = path.join(path.dirname(outputPath), "filter_script.txt");
      fs.writeFileSync(scriptPath, cropFilter, "utf-8");
      outputOptions.push("-filter_script:v", scriptPath);
    } else {
      cmd.videoFilters(cropFilter);
    }

    cmd.outputOptions(outputOptions).output(outputPath);

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        killed = true;
        try {
          cmd.kill("SIGKILL");
        } catch {
          // ignore kill error
        }
        reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    cmd.on("end", () => {
      if (timer) clearTimeout(timer);
      resolve();
    });

    cmd.on("error", (err: Error, _stdout: string, stderr: string) => {
      if (timer) clearTimeout(timer);
      if (killed) return;
      const detail = stderr ? stderr.slice(-1000) : err.message;
      reject(new Error(`FFmpeg rendering failed: ${err.message} (${detail})`));
    });

    cmd.run();
  });
}

/**
 * Uploads local rendered video to Cloudinary under the reframed_exports folder.
 */
async function defaultUploadToCloudinary(
  filePath: string
): Promise<{ secure_url: string }> {
  // Ensure Cloudinary is configured with latest env vars
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "video",
    folder: "reframed_exports",
  });

  if (!result || !result.secure_url) {
    throw new Error("Cloudinary upload succeeded but returned no secure_url");
  }

  return { secure_url: result.secure_url };
}

/**
 * Renders a reframed MP4 using crop targets from AutoFlip and uploads to Cloudinary.
 * Returns the public secure_url of the rendered video.
 */
export async function renderReframedVideo(
  videoUrl: string,
  cropTargetData: CropTargetData,
  options: RenderReframedVideoOptions = {},
  deps: RenderReframedVideoDeps = {}
): Promise<string> {
  if (!videoUrl || typeof videoUrl !== "string") {
    throw new Error("Cannot render reframed video: missing videoUrl");
  }

  const targets = cropTargetData?.crop_targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error(
      "Cannot render reframed video: cropTargetData contains no crop_targets"
    );
  }

  const cropFilter = buildFfmpegCropFilter(targets);
  if (!cropFilter) {
    throw new Error(
      "Cannot render reframed video: buildFfmpegCropFilter returned null"
    );
  }

  const downloadVideo = deps.downloadVideo ?? defaultDownloadVideo;
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;
  const uploadToCloudinary = deps.uploadToCloudinary ?? defaultUploadToCloudinary;

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `reframe-render-${Date.now()}-`)
  );
  const inputExt = path.extname(new URL(videoUrl, "http://localhost").pathname) || ".mp4";
  const inputPath = path.join(tempDir, `input${inputExt}`);
  const outputPath = path.join(tempDir, "output.mp4");

  try {
    console.log(`[reframe-render] Downloading source video from: ${videoUrl}`);
    await downloadVideo(videoUrl, inputPath);

    console.log(`[reframe-render] Applying FFmpeg filter: ${cropFilter}`);
    await runFfmpeg(inputPath, outputPath, cropFilter, options);

    if (!fs.existsSync(outputPath)) {
      throw new Error("FFmpeg completed but output file was not created");
    }

    console.log(`[reframe-render] Uploading rendered MP4 to Cloudinary...`);
    const uploadResult = await uploadToCloudinary(outputPath);
    console.log(
      `[reframe-render] Rendered MP4 uploaded successfully: ${uploadResult.secure_url}`
    );

    return uploadResult.secure_url;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(
        `[reframe-render] Failed to clean up temp dir ${tempDir}:`,
        cleanupErr
      );
    }
  }
}
