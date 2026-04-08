export type GcpWorkerPayload = {
  chunkId: string;
  recipeId: string;
  rawObject?: string;
  outputObject?: string;
  videoUrl?: string;
  recipe?: Record<string, unknown>;
};

export type GcpWorkerResponse = {
  ok: boolean;
  result?: {
    chunkId: string;
    recipeId: string;
    status: string;
    processedBucket?: string;
    processedObject?: string;
  };
  error?: string;
};

function getGcpWorkerUrl() {
  return process.env.GCP_VIDEO_WORKER_URL || "";
}

export async function invokeGcpWorker(payload: GcpWorkerPayload) {
  const url = getGcpWorkerUrl();
  if (!url) {
    throw new Error("GCP_VIDEO_WORKER_URL is not configured");
  }

  const controller = new AbortController();
  const timeoutMs = Number.parseInt(process.env.GCP_VIDEO_WORKER_TIMEOUT_MS || "180000", 10);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 180000);

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
      throw new Error(body.error || `GCP worker failed with status ${response.status}`);
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}
