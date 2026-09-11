import type { WebcamOverlay, WtmPosition } from "@/app/types/wtm";

export type GcpWorkerPayload = {
  chunkId?: string;
  recipeId: string;
  rawObject?: string;
  outputObject?: string;
  videoUrl?: string;
  recipe?: Record<string, unknown>;
  startTime?: number;
  duration?: number;
  chunkFilenames?: string[];
  // AVS voiceover (`/avs-voiceover`).
  lines?: Array<{ stepId: string; text: string }>;
  voiceId?: string;
  pronunciation?: Array<{ term: string; phonetic: string }>;
  // AVS time-alignment (`/avs-sync`).
  audioUrl?: string;
  steps?: Array<{ id: string; index?: number; startTime: number; endTime: number }>;
  stepTimings?: Array<{ stepId: string; start: number; end: number }>;
  // WTM webcam-bubble compositing (`/wtm-composite`).
  webcamUrl?: string;
  position?: string;
  size?: number;
  shape?: string;
  // HLS packaging (`/package-hls`). `demoId` doubles as the R2 object prefix,
  // and `sourceHash` is the idempotency key the previous run recorded.
  demoId?: string;
  sourceHash?: string;
  force?: boolean;
};

export type GcpWorkerResponse = {
  ok: boolean;
  result?: {
    chunkId?: string;
    recipeId: string;
    status?: string;
    processedBucket?: string;
    processedObject?: string;
    mergedObject?: string;
    exportedUrl?: string;
    // AVS voiceover (`/avs-voiceover`).
    audioUrl?: string;
    duration?: number;
    stepTimings?: Array<{ stepId: string; start: number; end: number }>;
    // AVS time-alignment (`/avs-sync`).
    alignedVideoUrl?: string;
    // WTM webcam-bubble compositing (`/wtm-composite`).
    compositedVideoUrl?: string;
    // HLS packaging (`/package-hls`).
    playlistUri?: string;
    sourceHash?: string;
    renditions?: Array<{ height: number; bitrateKbps: number }>;
    /** The source was unchanged, so nothing was re-encoded. */
    skipped?: boolean;
  };
  error?: string;
};

function getGcpWorkerUrl() {
  return (process.env.GCP_VIDEO_WORKER_URL || "").trim();
}

function normalizeWorkerBaseUrl(rawUrl: string) {
  let url = rawUrl.trim();
  if (!url) {
    return "";
  }
  url = url.replace(/\/+$/, "");
  // Accept env values ending with a known endpoint (/process, /subtitles,
  // /avs-voiceover, /avs-sync, /wtm-composite, /package-hls) so we always POST
  // against the worker's base URL.
  url = url.replace(/\/(process|subtitles|avs-voiceover|avs-sync|wtm-composite|package-hls)$/i, "");
  return url;
}

export async function invokeGcpWorker(
  payload: GcpWorkerPayload,
  endpoint = "/process",
  options: { timeoutMs?: number } = {}
) {
  const rawUrl = getGcpWorkerUrl();
  if (!rawUrl) {
    throw new Error("GCP_VIDEO_WORKER_URL is not configured");
  }
  const baseUrl = normalizeWorkerBaseUrl(rawUrl);
  if (!baseUrl) {
    throw new Error("GCP_VIDEO_WORKER_URL is invalid");
  }
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;

  const controller = new AbortController();
  // Callers with a heavier round-trip (e.g. ffmpeg alignment) can raise the
  // per-request timeout; otherwise fall back to the shared env default.
  const envTimeoutMs = Number.parseInt(process.env.GCP_VIDEO_WORKER_TIMEOUT_MS || "180000", 10);
  const defaultTimeoutMs = Number.isFinite(envTimeoutMs) ? envTimeoutMs : 180000;
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
      ? options.timeoutMs
      : defaultTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let attempt = 0;
  const maxAttempts = 3;
  // shared secret so random callers cannot burn our video budget
  const workerSecret = (process.env.WORKER_SECRET || "").trim();

  try {
    while (attempt < maxAttempts) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });

        const body = (await response.json().catch(() => ({}))) as GcpWorkerResponse;

        if (!response.ok || !body.ok) {
          // If the Cloud Run instance rejects the burst with 503 or 429, we trigger a retry
          if ([429, 502, 503, 504].includes(response.status) && attempt < maxAttempts - 1) {
            const backoffMs = 1500 * Math.pow(2, attempt);
            console.warn(
              `GCP worker scale-up delay (${response.status}). Retrying in ${backoffMs}ms...`
            );
            await new Promise((res) => setTimeout(res, backoffMs));
            attempt++;
            continue;
          }
          throw new Error(body.error || `GCP worker failed (${response.status}) at ${url}`);
        }

        return body;
      } catch (e: unknown) {
        if (attempt >= maxAttempts - 1) {
          throw e; // Max attempts reached
        }

        const errorMessage = e instanceof Error ? e.message : String(e);
        // Throw fast on deterministic non-network exceptions (like aborts)
        if (errorMessage.includes("aborted")) {
          throw e;
        }

        // Network error like socket hang up
        const backoffMs = 1500 * Math.pow(2, attempt);
        console.warn(`GCP worker connection error. Retrying in ${backoffMs}ms...`);
        await new Promise((res) => setTimeout(res, backoffMs));
        attempt++;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  throw new Error("GCP worker failed after multiple retries");
}

export type GcpSubtitlesPayload = {
  videoUrl: string;
  language?: string;
  /**
   * Per-call ceiling on the worker round-trip. Omitted, the shared default
   * applies, so every existing caller is unchanged; the subtitle route scales it
   * with the source length (see `subtitleWorkerTimeoutMs`), because download,
   * ffmpeg extract and Deepgram all grow with the input and a fixed 180s turns a
   * long video into a spurious abort.
   */
  timeoutMs?: number;
};

export async function invokeGcpSubtitles(payload: GcpSubtitlesPayload) {
  const body = await invokeGcpWorker(
    {
      recipeId: "subtitles",
      videoUrl: payload.videoUrl,
      recipe: { language: payload.language || "multi" },
    },
    "/subtitles",
    typeof payload.timeoutMs === "number" ? { timeoutMs: payload.timeoutMs } : {}
  );

  const cues = (
    body.result as { cues?: Array<{ start: number; end: number; text: string }> } | undefined
  )?.cues;
  return Array.isArray(cues) ? cues : [];
}

export type GcpVoiceoverPayload = {
  lines: Array<{ stepId: string; text: string }>;
  voiceId: string;
  pronunciation?: Array<{ term: string; phonetic: string }>;
};

export type GcpVoiceoverResult = {
  audioUrl: string;
  duration: number;
  stepTimings: Array<{ stepId: string; start: number; end: number }>;
};

/**
 * Trigger the Cloud Run worker's `/avs-voiceover` endpoint (Deepgram Aura TTS →
 * one continuous MP3). The Deepgram key lives in the worker, so the Next app only
 * needs GCP_VIDEO_WORKER_URL. Mirrors `invokeGcpSubtitles`.
 */
export async function invokeGcpVoiceover(
  payload: GcpVoiceoverPayload
): Promise<GcpVoiceoverResult> {
  const body = await invokeGcpWorker(
    {
      recipeId: "avs-voiceover",
      lines: payload.lines,
      voiceId: payload.voiceId,
      pronunciation: payload.pronunciation,
    },
    "/avs-voiceover"
  );

  const result = body.result;
  const audioUrl = typeof result?.audioUrl === "string" ? result.audioUrl : "";
  if (!audioUrl) {
    throw new Error("Voiceover worker returned no audio URL");
  }
  const duration = typeof result?.duration === "number" ? result.duration : 0;
  const stepTimings = Array.isArray(result?.stepTimings) ? result.stepTimings : [];
  return { audioUrl, duration, stepTimings };
}

export type GcpSyncPayload = {
  videoUrl: string;
  audioUrl: string;
  steps: Array<{ id: string; index?: number; startTime: number; endTime: number }>;
  stepTimings: Array<{ stepId: string; start: number; end: number }>;
};

export type GcpSyncResult = {
  alignedVideoUrl: string;
  duration: number;
};

// ffmpeg alignment (download → per-step re-encode → concat → mux) is heavier
// than a normal chunk render, so give the worker round-trip generous headroom.
const AVS_SYNC_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Trigger the Cloud Run worker's `/avs-sync` endpoint: freeze-frame / silence
 * time-alignment of the continuous voiceover to the video, producing one
 * aligned MP4 the normal export can then process. Mirrors `invokeGcpVoiceover`.
 */
export async function invokeGcpSync(payload: GcpSyncPayload): Promise<GcpSyncResult> {
  const body = await invokeGcpWorker(
    {
      recipeId: "avs-sync",
      videoUrl: payload.videoUrl,
      audioUrl: payload.audioUrl,
      steps: payload.steps,
      stepTimings: payload.stepTimings,
    },
    "/avs-sync",
    { timeoutMs: AVS_SYNC_TIMEOUT_MS }
  );

  const result = body.result;
  const alignedVideoUrl = typeof result?.alignedVideoUrl === "string" ? result.alignedVideoUrl : "";
  if (!alignedVideoUrl) {
    throw new Error("Sync worker returned no aligned video URL");
  }
  const duration = typeof result?.duration === "number" ? result.duration : 0;
  return { alignedVideoUrl, duration };
}

export type GcpCompositePayload = {
  videoUrl: string;
  webcamUrl?: string;
  position?: WtmPosition;
  size?: number;
  shape?: WebcamOverlay["shape"];
};

export type GcpCompositeResult = {
  compositedVideoUrl: string;
  duration: number;
};

// The compositor decodes both inputs, runs a per-pixel geq mask and re-encodes
// the whole source in one pass — heavier than a chunk render, so it gets the
// same generous headroom as the AVS alignment.
const WTM_COMPOSITE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Trigger the Cloud Run worker's `/wtm-composite` endpoint: mask the webcam clip
 * into a circle and overlay it as a corner bubble on the source, producing ONE
 * composited MP4 the normal export can then process. Mirrors `invokeGcpSync`.
 * With no `webcamUrl` the worker degrades to returning the source unchanged.
 */
export async function invokeGcpComposite(
  payload: GcpCompositePayload
): Promise<GcpCompositeResult> {
  const body = await invokeGcpWorker(
    {
      recipeId: "wtm-composite",
      videoUrl: payload.videoUrl,
      webcamUrl: payload.webcamUrl,
      position: payload.position,
      size: payload.size,
      shape: payload.shape,
    },
    "/wtm-composite",
    { timeoutMs: WTM_COMPOSITE_TIMEOUT_MS }
  );

  const result = body.result;
  const compositedVideoUrl =
    typeof result?.compositedVideoUrl === "string" ? result.compositedVideoUrl : "";
  if (!compositedVideoUrl) {
    throw new Error("Composite worker returned no video URL");
  }
  const duration = typeof result?.duration === "number" ? result.duration : 0;
  return { compositedVideoUrl, duration };
}

export type GcpPackageHlsPayload = {
  demoId: string;
  videoUrl: string;
  /** The hash recorded by the last successful run, when there was one. */
  sourceHash?: string;
  /** Repackage even when the source is unchanged. */
  force?: boolean;
};

export type GcpPackageHlsResult = {
  /** `r2://<bucket>/hls/<demoId>/master.m3u8`. */
  playlistUri: string;
  sourceHash: string;
  renditions: Array<{ height: number; bitrateKbps: number }>;
  /** The source was unchanged, so nothing was re-encoded. */
  skipped: boolean;
};

// A three-rung ladder decodes the source once and encodes it three times, which
// on a long demo is by far the heaviest thing this worker does — heavier than
// the AVS alignment or the WTM composite, which already get 15 minutes. Half an
// hour is the ceiling before Cloud Run's own request timeout becomes the binding
// constraint anyway.
const PACKAGE_HLS_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Trigger the Cloud Run worker's `/package-hls` endpoint: one source in, an
 * adaptive-bitrate HLS ladder on R2 out. Mirrors `invokeGcpComposite`, and like
 * it reuses invokeGcpWorker's retry-and-backoff rather than doing its own HTTP.
 *
 * IDEMPOTENT AT THE WORKER, not here: passing the `sourceHash` from the previous
 * run lets it answer `skipped: true` after one small object read, without
 * downloading or re-encoding anything. Callers that have a stored hash should
 * always pass it.
 */
export async function invokeGcpPackageHls(
  payload: GcpPackageHlsPayload
): Promise<GcpPackageHlsResult> {
  const body = await invokeGcpWorker(
    {
      recipeId: "package-hls",
      demoId: payload.demoId,
      videoUrl: payload.videoUrl,
      sourceHash: payload.sourceHash,
      force: payload.force,
    },
    "/package-hls",
    { timeoutMs: PACKAGE_HLS_TIMEOUT_MS }
  );

  const result = body.result;
  const playlistUri = typeof result?.playlistUri === "string" ? result.playlistUri : "";
  if (!playlistUri) {
    throw new Error("HLS packager returned no playlist URI");
  }
  return {
    playlistUri,
    sourceHash: typeof result?.sourceHash === "string" ? result.sourceHash : "",
    renditions: Array.isArray(result?.renditions) ? result.renditions : [],
    skipped: result?.skipped === true,
  };
}
