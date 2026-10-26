const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// Audio content types that ElevenLabs legitimately returns for dubbed audio.
// Any other content type (e.g. text/html error pages, application/json) is
// treated as a provider-side fault rather than silently relabelled as audio.
const ALLOWED_AUDIO_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
  "audio/x-mpeg",
  "audio/x-mp3",
]);

export function getAudioExtension(contentType: string): string {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  switch (mime) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    case "audio/ogg":
    case "audio/vorbis":
    case "audio/opus":
      return "ogg";
    case "audio/flac":
      return "flac";
    case "audio/webm":
      return "webm";
    case "audio/mpeg":
    case "audio/mp3":
    case "audio/x-mpeg":
    case "audio/x-mp3":
    default:
      return "mp3";
  }
}

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

async function elevenLabsRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ELEVENLABS_API_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": getApiKey(),
      Accept: "application/json",
      ...(options.body instanceof FormData
        ? {}
        : options.body
          ? { "Content-Type": "application/json" }
          : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function createDubbingJob(input: {
  sourceUrl: string;
  targetLanguage: string;
}): Promise<DubbingJobResult> {
  const normalizedLanguage = input.targetLanguage.trim().toLowerCase();
  const formData = new FormData();
  formData.append("source_url", input.sourceUrl);
  formData.append("target_lang", normalizedLanguage);

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
    targetLanguage: normalizedLanguage,
  };
}

export interface DubbingStatusResult {
  status: string;
  dubbingId: string;
  error?: string;
  /**
   * Billable characters used, if exposed by provider payload.
   * Note: The standard ElevenLabs GET /v1/dubbing/{id} status response does not currently
   * include characters_used or credit consumption. This field serves as an extension point
   * for webhooks or API updates without inferring units from word counts or audio duration.
   */
  charactersUsed?: number;
  durationSecs?: number;
}

export async function getDubbingStatus(dubbingId: string): Promise<DubbingStatusResult> {
}> {
  const response = await elevenLabsRequest<{
    status?: string;
    dubbing_id?: string;
    error?: string;
    characters_used?: number;
    billing_characters?: number;
    character_count?: number;
    duration_secs?: number;
    duration_seconds?: number;
  }>(`/dubbing/${encodeURIComponent(dubbingId)}`);

  const charactersUsed =
    response.characters_used ?? response.billing_characters ?? response.character_count;
  const durationSecs = response.duration_secs ?? response.duration_seconds;

  return {
    dubbingId: response.dubbing_id ?? dubbingId,
    status: response.status ?? "unknown",
    error: response.error,
    charactersUsed:
      typeof charactersUsed === "number" && Number.isFinite(charactersUsed) && charactersUsed >= 0
        ? charactersUsed
        : undefined,
    durationSecs:
      typeof durationSecs === "number" && Number.isFinite(durationSecs) && durationSecs >= 0
        ? durationSecs
        : undefined,
  };
}

export async function waitForDubbingCompletion(
  dubbingId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<DubbingStatusResult> {
): Promise<{ status: string; dubbingId: string; error?: string }> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await getDubbingStatus(dubbingId);
    const normalizedStatus = result.status.toLowerCase();

    if (["completed", "complete", "success", "succeeded", "dubbed"].includes(normalizedStatus)) {
      return result;
    }

    if (["failed", "error", "cancelled", "canceled"].includes(normalizedStatus)) {
      const errorDetail = result.error ? `: ${result.error}` : "";
      throw new Error(`ElevenLabs dubbing failed with status: ${result.status}${errorDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("ElevenLabs dubbing polling timed out");
}

export async function getDubbedAudio(
  dubbingId: string,
  targetLanguage: string
): Promise<{ audio: Buffer; contentType: string }> {
  const apiKey = getApiKey();
  const normalizedLanguage = targetLanguage.trim().toLowerCase();
  const url = `${ELEVENLABS_API_URL}/dubbing/${encodeURIComponent(
    dubbingId
  )}/audio/${encodeURIComponent(normalizedLanguage)}`;

  const response = await fetch(url, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs audio retrieval failed (${response.status}): ${errorText}`);
  }

  const rawContentType = response.headers.get("content-type") ?? "";
  // Normalise: strip any "; charset=..." or "; boundary=..." suffix before checking.
  const contentTypeMime = rawContentType.split(";")[0].trim().toLowerCase();

  if (!ALLOWED_AUDIO_CONTENT_TYPES.has(contentTypeMime)) {
    // Log the real type server-side so operators can diagnose provider-side issues
    // without leaking internal details to the caller.
    console.error(
      `[getDubbedAudio] Unexpected content-type from ElevenLabs for dubbing ${dubbingId}/${normalizedLanguage}: "${rawContentType}"`
    );
    throw new Error("ElevenLabs returned an unexpected content type for the dubbed audio");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length === 0) {
    throw new Error("ElevenLabs returned empty audio payload");
  }

  return {
    audio: buffer,
    contentType: contentTypeMime,
  };
}
