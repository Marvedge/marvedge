// Background dubbing processor for AVS dub-sync alignment (Task-00059).
//
// Runs in the BullMQ video-worker — never inline in the request/response cycle.
// Follows the decoupled service pattern established in app/lib/audio/jobs.ts:
// - Uses relative imports only (the worker does not resolve Next.js `@/` aliases).
// - Takes optional dependencies (GCP invoker, callback poster, progress reporter)
//   so processor logic is 100% unit-testable without live GCP, Redis, or HTTP.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cloudinary from "../cloudinary";
import type { Step, DubTiming } from "../../types/avs";
import type { GcpDubSyncPayload, GcpDubSyncResult } from "../gcpWorker";
import { invokeGcpDubSync } from "../gcpWorker";

export type DubbingJobPayload = {
  jobId: string;
  videoUrl: string;
  dubUrl: string;
  steps: Array<{
    id: string;
    index?: number;
    startTime: number;
    endTime: number;
  }>;
  dubTimings: Array<{
    stepId: string;
    start: number;
    end: number;
  }>;
  sourceDuration: number;
  userId?: string;
  demoId?: string | null;
};

export type DubbingCallbackPayload =
  | {
      jobId: string;
      status: "COMPLETED";
      alignedVideoUrl: string;
      duration: number;
    }
  | {
      jobId: string;
      status: "FAILED";
      error: string;
    };

export type UploadToCloudinaryFn = (
  videoUrlOrPath: string
) => Promise<{ secure_url: string }>;

export async function defaultUploadToCloudinary(
  videoUrlOrPath: string
): Promise<{ secure_url: string }> {
  cloudinary.config({
    cloud_name:
      process.env.CLOUDINARY_CLOUD_NAME ||
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  let fileToUpload = videoUrlOrPath;
  let tempDirToClean: string | null = null;

  const isLoopbackUrl =
    videoUrlOrPath.startsWith("http://localhost") ||
    videoUrlOrPath.startsWith("http://127.0.0.1") ||
    Boolean(
      process.env.GCP_VIDEO_WORKER_URL &&
        videoUrlOrPath.startsWith(process.env.GCP_VIDEO_WORKER_URL)
    );

  if (isLoopbackUrl) {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "marvedge-dub-upload-")
    );
    tempDirToClean = tempDir;
    const tempFilePath = path.join(tempDir, "aligned.mp4");

    const response = await fetch(videoUrlOrPath);
    if (!response.ok) {
      throw new Error(
        `Failed to download local artifact for Cloudinary upload (${response.status}): ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.promises.writeFile(tempFilePath, Buffer.from(arrayBuffer));
    fileToUpload = tempFilePath;
  }

  try {
    const result = await cloudinary.uploader.upload(fileToUpload, {
      resource_type: "video",
      folder: "dubbed_exports",
    });

    if (!result || !result.secure_url) {
      throw new Error("Cloudinary upload succeeded but returned no secure_url");
    }

    return { secure_url: result.secure_url };
  } finally {
    if (tempDirToClean) {
      await fs.promises.rm(tempDirToClean, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export interface DubbingProcessorDeps {
  invokeDubSync?: (payload: GcpDubSyncPayload) => Promise<GcpDubSyncResult>;
  postCallback?: (payload: DubbingCallbackPayload) => Promise<void>;
  updateProgress?: (percent: number) => Promise<void> | void;
  uploadToCloudinary?: UploadToCloudinaryFn;
}

/**
 * Dispatch an authenticated callback to POST /api/jobs/callback.
 * Retries on network errors or 5xx server responses with exponential backoff.
 * Non-transient 4xx responses (e.g. 401 Unauthorized, 400 Bad Request) throw immediately.
 */
export async function postJobCallbackWithRetry(
  payload: DubbingCallbackPayload,
  opts?: {
    appUrl?: string;
    callbackSecret?: string;
    maxAttempts?: number;
    delayMs?: number;
  }
): Promise<void> {
  const rawBaseUrl =
    opts?.appUrl ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const secret = opts?.callbackSecret ?? process.env.CALLBACK_SECRET ?? "";
  const maxAttempts = opts?.maxAttempts ?? 3;
  const initialDelay = opts?.delayMs ?? 1000;

  const url = `${baseUrl}/api/jobs/callback`;

  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return;
      }

      // Fast fail on client error (unauthorized, invalid body)
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          `Callback rejected (${res.status}): ${body.error || res.statusText}`
        );
      }

      // 5xx server error: retry with exponential backoff
      attempt++;
      if (attempt >= maxAttempts) {
        throw new Error(`Callback failed with status ${res.status}`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelay * Math.pow(2, attempt - 1))
      );
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Callback rejected")) {
        throw err;
      }
      attempt++;
      if (attempt >= maxAttempts) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelay * Math.pow(2, attempt - 1))
      );
    }
  }
}

/**
 * Execute the AVS dubbing alignment job.
 * 1. Validates payload fields.
 * 2. Evaluates fallback condition (graceful degradation if dubUrl or timings are missing).
 * 3. Invokes GCP Cloud Run /avs-dub (or injected stub).
 * 4. Validates returned alignedVideoUrl and duration.
 * 5. Sends authenticated callback to /api/jobs/callback.
 * 6. Propagates failures to BullMQ so worker retries/logging function correctly.
 */
export async function processDubbingJob(
  payload: DubbingJobPayload,
  deps: DubbingProcessorDeps = {}
): Promise<void> {
  const invokeDubSync = deps.invokeDubSync ?? invokeGcpDubSync;
  const postCallback = deps.postCallback ?? postJobCallbackWithRetry;
  const updateProgress = deps.updateProgress ?? (() => {});
  const uploadToCloudinary = deps.uploadToCloudinary ?? defaultUploadToCloudinary;

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload: must be an object");
  }
  if (!payload.jobId || typeof payload.jobId !== "string") {
    throw new Error("Invalid payload: missing jobId");
  }
  if (!payload.videoUrl || typeof payload.videoUrl !== "string") {
    await postCallback({
      jobId: payload.jobId,
      status: "FAILED",
      error: "Missing required videoUrl",
    });
    throw new Error("Missing required videoUrl");
  }

  try {
    await updateProgress(20);

    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    const dubTimings = Array.isArray(payload.dubTimings) ? payload.dubTimings : [];

    // Fallback condition preserved from existing runDubAlignment:
    // If dubUrl, steps, or dubTimings are absent, return the source unchanged.
    const canAlign =
      Boolean(payload.dubUrl) && steps.length > 0 && dubTimings.length > 0;

    let alignedVideoUrl = payload.videoUrl;
    let duration =
      typeof payload.sourceDuration === "number" &&
      Number.isFinite(payload.sourceDuration) &&
      payload.sourceDuration >= 0
        ? payload.sourceDuration
        : 0;

    if (canAlign) {
      await updateProgress(40);
      const result = await invokeDubSync({
        videoUrl: payload.videoUrl,
        dubUrl: payload.dubUrl,
        steps,
        dubTimings,
      });

      if (
        !result ||
        typeof result.alignedVideoUrl !== "string" ||
        !result.alignedVideoUrl.trim()
      ) {
        throw new Error("Dub-sync worker returned invalid aligned video URL");
      }

      let parsed: URL;
      try {
        parsed = new URL(result.alignedVideoUrl);
      } catch (urlErr) {
        throw new Error("Dub-sync worker returned invalid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Dub-sync worker returned non-http/https URL");
      }

      if (
        typeof result.duration !== "number" ||
        !Number.isFinite(result.duration) ||
        result.duration < 0
      ) {
        throw new Error("Dub-sync worker returned invalid duration");
      }

      alignedVideoUrl = result.alignedVideoUrl;
      duration = result.duration || duration;

      const isLocalArtifact =
        alignedVideoUrl.startsWith("http://localhost") ||
        alignedVideoUrl.startsWith("http://127.0.0.1") ||
        Boolean(
          process.env.GCP_VIDEO_WORKER_URL &&
            alignedVideoUrl.startsWith(process.env.GCP_VIDEO_WORKER_URL)
        );

      const shouldUploadToCloudinary =
        deps.uploadToCloudinary !== undefined ||
        process.env.STORAGE_PROVIDER === "cloudinary" ||
        (isLocalArtifact && !alignedVideoUrl.includes("res.cloudinary.com"));

      if (shouldUploadToCloudinary) {
        await updateProgress(70);
        console.log(`[dubbingProcessor] Uploading aligned video to Cloudinary...`);
        const uploaded = await uploadToCloudinary(alignedVideoUrl);
        if (!uploaded?.secure_url) {
          throw new Error("Cloudinary upload returned no secure_url");
        }
        alignedVideoUrl = uploaded.secure_url;
      }
    }

    await updateProgress(90);

    await postCallback({
      jobId: payload.jobId,
      status: "COMPLETED",
      alignedVideoUrl,
      duration,
    });

    await updateProgress(100);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Dub-sync alignment failed";
    console.error(`[dubbingProcessor] Job ${payload.jobId} failed:`, errorMessage);

    try {
      await postCallback({
        jobId: payload.jobId,
        status: "FAILED",
        error: errorMessage,
      });
    } catch (cbErr) {
      console.error(
        `[dubbingProcessor] Failed to send FAILED callback for ${payload.jobId}:`,
        cbErr
      );
    }

    throw err;
  }
}
