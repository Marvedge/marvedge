const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

export interface DubbingJobResult {
  dubbingId: string;
  status: string;
  targetLanguage: string;
}

function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY");
  }

  return apiKey;
}

async function elevenLabsRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${ELEVENLABS_API_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": getApiKey(),
      Accept: "application/json",
      ...(options.body instanceof FormData ? {} : options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs request failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

export async function createDubbingJob(input: {
  sourceUrl: string;
  targetLanguage: string;
}): Promise<DubbingJobResult> {
  const formData = new FormData();
  formData.append("source_url", input.sourceUrl);
  formData.append("target_lang", input.targetLanguage);

const response = await elevenLabsRequest<{
    dubbing_id?: string;
    id?: string;
    status?: string;
  }>("/dubbing", {
    method: "POST",
    body: formData,
  });

  const dubbingId = response.dubbing_id ?? response.id;

  if (!dubbingId) {
    throw new Error("ElevenLabs did not return a dubbing ID");
  }

  return {
    dubbingId,
    status: response.status ?? "processing",
    targetLanguage: input.targetLanguage,
  };
}

export async function getDubbingStatus(dubbingId: string): Promise<{
  status: string;
  dubbingId: string;
}> {
  const response = await elevenLabsRequest<{
    status?: string;
    dubbing_id?: string;
  }>(`/dubbing/${encodeURIComponent(dubbingId)}`);

  return {
    dubbingId: response.dubbing_id ?? dubbingId,
    status: response.status ?? "unknown",
  };
}

export async function waitForDubbingCompletion(
  dubbingId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ status: string; dubbingId: string }> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await getDubbingStatus(dubbingId);
    const normalizedStatus = result.status.toLowerCase();

    if (
      ["completed", "complete", "success", "succeeded", "dubbed"].includes(
        normalizedStatus
      )
    ) {
      return result;
    }

    if (
      ["failed", "error", "cancelled", "canceled"].includes(normalizedStatus)
    ) {
      throw new Error(`ElevenLabs dubbing failed with status: ${result.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("ElevenLabs dubbing polling timed out");
}