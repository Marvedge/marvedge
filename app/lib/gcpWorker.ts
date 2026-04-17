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
  };
  error?: string;
};

function getGcpWorkerUrl() {
  return (process.env.GCP_VIDEO_WORKER_URL || "").trim();
}

function normalizeWorkerBaseUrl(rawUrl: string) {
  let url = rawUrl.trim();
  if (!url) return "";
  url = url.replace(/\/+$/, "");
  // Accept env values ending with /process, /process/, /subtitles, /subtitles/
  url = url.replace(/\/(process|subtitles)$/i, "");
  return url;
}

export async function invokeGcpWorker(payload: GcpWorkerPayload, endpoint = "/process") {
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
  const timeoutMs = Number.parseInt(process.env.GCP_VIDEO_WORKER_TIMEOUT_MS || "180000", 10);
  const timer = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? timeoutMs : 180000
  );

  let attempt = 0;
  const maxAttempts = 3;

  try {
    while (attempt < maxAttempts) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
            console.warn(`GCP worker scale-up delay (${response.status}). Retrying in ${backoffMs}ms...`);
            await new Promise((res) => setTimeout(res, backoffMs));
            attempt++;
            continue;
          }
          throw new Error(
            body.error || `GCP worker failed (${response.status}) at ${url}`
          );
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
};

export async function invokeGcpSubtitles(payload: GcpSubtitlesPayload) {
  const body = await invokeGcpWorker(
    {
      recipeId: "subtitles",
      videoUrl: payload.videoUrl,
      recipe: { language: payload.language || "multi" },
    },
    "/subtitles"
  );

  const cues = (body.result as { cues?: Array<{ start: number; end: number; text: string }> } | undefined)
    ?.cues;
  return Array.isArray(cues) ? cues : [];
}
