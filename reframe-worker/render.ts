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
import dns from "node:dns";
import net from "node:net";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { buildFfmpegCropFilter, type CropTargetData } from "../app/types/editor/crop-target";
import cloudinary from "../app/lib/cloudinary";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface RenderReframedVideoOptions {
  timeoutMs?: number;
  crf?: number;
  preset?: string;
  jobId?: string;
  publicId?: string;
}

export interface RenderReframedVideoDeps {
  downloadVideo?: (url: string, destPath: string) => Promise<void>;
  runFfmpeg?: (
    inputPath: string,
    outputPath: string,
    cropFilter: string,
    options?: { timeoutMs?: number; crf?: number; preset?: string }
  ) => Promise<void>;
  uploadToCloudinary?: (
    filePath: string,
    options?: { publicId?: string }
  ) => Promise<{ secure_url: string }>;
}

export const MAX_DOWNLOAD_REDIRECTS = 5;
export const DOWNLOAD_TIMEOUT_MS = 60000;
export const DEFAULT_MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;

function parseIpv4(address: string): number[] | null {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  ) {
    return null;
  }
  return octets;
}

function isBlockedIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  const firstSegment = normalized.split(":")[0] || "0";
  const firstValue = Number.parseInt(firstSegment, 16);
  if (
    Number.isFinite(firstValue) &&
    ((firstValue >= 0xfc00 && firstValue <= 0xfdff) ||
      (firstValue >= 0xfe80 && firstValue <= 0xfebf) ||
      (firstValue >= 0xff00 && firstValue <= 0xffff))
  ) {
    return true;
  }
  const dottedIpv4 = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedIpv4) {
    return isBlockedIpv4(dottedIpv4[1]);
  }
  const mappedIpv4 = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedIpv4) {
    const high = Number.parseInt(mappedIpv4[1], 16);
    const low = Number.parseInt(mappedIpv4[2], 16);
    const ipv4Address = [(high >>> 8) & 255, high & 255, (low >>> 8) & 255, low & 255].join(".");
    return isBlockedIpv4(ipv4Address);
  }
  return false;
}

function isBlockedAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

function isBlockedHost(hostname: string): boolean {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    return isBlockedAddress(bare);
  }
  return !bare.includes(".");
}

/**
 * Validate a source URL before any request is made: only http(s), no embedded
 * credentials, no blocked hosts, and hostnames must not resolve to
 * private/link-local addresses. Exported for unit tests.
 */
export async function assertSafeDownloadUrl(
  rawUrl: string,
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string; family: number }>>
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error("Invalid source URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Refusing to fetch non-http(s) URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Refusing source URL containing credentials");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("Refusing to fetch blocked host");
  }
  const bareHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bareHostname)) {
    return parsed;
  }
  const lookup = lookupImpl ?? ((h: string) => dns.promises.lookup(h, { all: true, verbatim: true }) as Promise<Array<{ address: string; family: number }>>);
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(parsed.hostname);
  } catch {
    throw new Error("Unable to resolve source host");
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("Unable to resolve source host");
  }
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("Refusing to fetch host resolving to a private address");
  }
  return parsed;
}

export function maxDownloadBytes(): number {
  const raw = Number(process.env.REFRAME_DOWNLOAD_MAX_BYTES || "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_DOWNLOAD_BYTES;
}

/**
 * Downloads remote video stream over HTTP(S) into local destination path.
 *
 * The URL is validated pre-request (http(s) only, no private/file/gopher
 * targets), redirects are capped, the request has a timeout, and bodies over
 * the size limit abort mid-stream.
 */
export async function defaultDownloadVideo(url: string, destPath: string): Promise<void> {
  const safeUrl = await assertSafeDownloadUrl(url);
  const maxBytes = maxDownloadBytes();
  const writer = fs.createWriteStream(destPath);
  let response;
  try {
    response = await axios({
      url: safeUrl.toString(),
      method: "GET",
      responseType: "stream",
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      maxRedirects: MAX_DOWNLOAD_REDIRECTS,
    });
  } catch (err) {
    writer.destroy();
    throw err;
  }

  const contentLength = Number(response.headers?.["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    writer.destroy();
    throw new Error(
      `Refusing download: content-length ${contentLength} exceeds limit of ${maxBytes} bytes`
    );
  }

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    let received = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        response.data.destroy();
      } catch {
        // Ignore destroy errors; the rejection below carries the failure.
      }
      writer.destroy();
      reject(err);
    };
    response.data.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (!settled && received > maxBytes) {
        fail(new Error(`Download exceeds size limit of ${maxBytes} bytes`));
      }
    });
    response.data.on("error", (err: Error) => {
      fail(err);
    });
    writer.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    writer.on("error", (err: Error) => {
      fail(err);
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

    const cmd = ffmpeg(inputPath).videoCodec("libx264").audioCodec("aac");

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
      if (timer) {
        clearTimeout(timer);
      }
      resolve();
    });

    cmd.on("error", (err: Error, _stdout: string | null, stderr: string | null) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (killed) {
        return;
      }
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
  filePath: string,
  options?: { publicId?: string }
): Promise<{ secure_url: string }> {
  // Ensure Cloudinary is configured with latest env vars
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const uploadOptions: Record<string, unknown> = {
    resource_type: "video",
    folder: "reframed_exports",
    overwrite: true,
  };
  if (options?.publicId) {
    uploadOptions.public_id = options.publicId;
  }

  const result = await cloudinary.uploader.upload(filePath, uploadOptions);

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
    throw new Error("Cannot render reframed video: cropTargetData contains no crop_targets");
  }

  const cropFilter = buildFfmpegCropFilter(targets);
  if (!cropFilter) {
    throw new Error("Cannot render reframed video: buildFfmpegCropFilter returned null");
  }

  const downloadVideo = deps.downloadVideo ?? defaultDownloadVideo;
  const runFfmpeg = deps.runFfmpeg ?? defaultRunFfmpeg;
  const uploadToCloudinary = deps.uploadToCloudinary ?? defaultUploadToCloudinary;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `reframe-render-${Date.now()}-`));
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

    const resolvedPublicId =
      options.publicId ??
      (options.jobId
        ? `reframed_${options.jobId}`
        : cropTargetData.video_id
          ? `reframed_${cropTargetData.video_id}`
          : undefined);

    console.log(
      `[reframe-render] Uploading rendered MP4 to Cloudinary (publicId: ${resolvedPublicId || "auto"})...`
    );
    const uploadResult = await uploadToCloudinary(
      outputPath,
      resolvedPublicId ? { publicId: resolvedPublicId } : undefined
    );
    console.log(`[reframe-render] Rendered MP4 uploaded successfully: ${uploadResult.secure_url}`);

    return uploadResult.secure_url;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`[reframe-render] Failed to clean up temp dir ${tempDir}:`, cleanupErr);
    }
  }
}
