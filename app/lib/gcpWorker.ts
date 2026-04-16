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
      throw new Error(
        body.error || `GCP worker failed (${response.status}) at ${url}`
      );
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
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
