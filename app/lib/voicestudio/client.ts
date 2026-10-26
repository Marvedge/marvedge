/**
 * VoiceStudio Typed HTTP Client (Task-00103)
 * Provides authenticated, resilient communication with the VoiceStudio container service.
 * Supports health/readiness checks, speech generation, explicit model installation,
 * bounded retries on transient errors, and strict credential protection.
 */

import {
  VoiceStudioAuthError,
  VoiceStudioError,
  VoiceStudioInferenceError,
  VoiceStudioRateLimitError,
  VoiceStudioTimeoutError,
  VoiceStudioUnavailableError,
} from "./errors";
import type {
  VoiceStudioConfig,
  VoiceStudioHealthResponse,
  VoiceStudioSpeechRequest,
  VoiceStudioSpeechResult,
} from "./types";
import { assertValidAudio } from "./validateAudio";

export class VoiceStudioClient {
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  public readonly defaultModel: string;
  public readonly timeoutMs: number;
  public readonly maxRetries: number;
  public readonly fallbackToPaid: boolean;

  constructor(config?: VoiceStudioConfig) {
    const rawUrl = config?.baseUrl || process.env.VOICESTUDIO_API_URL || "http://127.0.0.1:3900";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = config?.apiKey ?? process.env.VOICESTUDIO_API_KEY;
    this.defaultModel = config?.defaultModel || process.env.VOICESTUDIO_MODEL || "omnivoice";
    this.timeoutMs = config?.timeoutMs ?? 45000;
    this.maxRetries = config?.maxRetries ?? 2;
    this.fallbackToPaid =
      config?.fallbackToPaid ??
      (process.env.VOICESTUDIO_FALLBACK_TO_PAID === "true" ||
        process.env.VOICESTUDIO_FALLBACK_TO_PAID === "1");
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json, audio/*",
    };
    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers.Authorization = `Bearer ${this.apiKey.trim()}`;
    }
    return headers;
  }

  /**
   * Probes /health endpoint to determine service readiness and active compute device.
   * Handles 503 (startup / model loading) and 200 (healthy / ready).
   */
  public async checkHealth(options?: { timeoutMs?: number }): Promise<VoiceStudioHealthResponse> {
    const timeout = options?.timeoutMs ?? 5000;
    const url = `${this.baseUrl}/health`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(timeout),
      });

      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) || 2 : 2;

      // 503 Service Unavailable: server is starting up or heavy model loading is in progress
      if (res.status === 503) {
        let body: Record<string, unknown> = {};
        try {
          body = (await res.json()) as Record<string, unknown>;
        } catch {
          // ignore json parse error
        }
        return {
          status: "starting",
          device: "unknown",
          version: typeof body.version === "string" ? body.version : "unknown",
          isReady: false,
          isGpu: false,
          gpuModel: null,
          startupStep: typeof body.step === "string" ? body.step : undefined,
          startupLabel: typeof body.label === "string" ? body.label : undefined,
          retryAfterSec,
        };
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new VoiceStudioError(
          "SERVICE_UNAVAILABLE",
          `Health check failed (${res.status}): ${errorText}`,
          {
            statusCode: res.status,
            sensitiveValues: [this.apiKey],
          }
        );
      }

      const body = (await res.json()) as Record<string, unknown>;
      const device = typeof body.device === "string" ? body.device : "cpu";
      const isGpu = device.toLowerCase().includes("cuda") || device.toLowerCase().includes("gpu");

      let gpuModel: string | null = null;
      const gpuMatch = device.match(/\(([^)]+)\)/);
      if (gpuMatch && gpuMatch[1]) {
        gpuModel = gpuMatch[1].trim();
      } else if (isGpu) {
        gpuModel = "CUDA GPU";
      }

      return {
        status: "ok",
        device,
        version: typeof body.version === "string" ? body.version : "unknown",
        isReady: true,
        isGpu,
        gpuModel,
      };
    } catch (err: unknown) {
      if (err instanceof VoiceStudioError) {
        throw err;
      }
      const message = (err as Error).message || String(err);
      throw new VoiceStudioUnavailableError(
        `VoiceStudio health probe unreachable at ${url}: ${message}`,
        5,
        [this.apiKey]
      );
    }
  }

  /**
   * Explicitly requests downloading and caching model weights before running inference.
   * Avoids cold-cache timeout on first generation call.
   */
  public async installModel(
    repoId: string = "k2-fsa/OmniVoice",
    options?: { timeoutMs?: number }
  ): Promise<void> {
    const timeout = options?.timeoutMs ?? 180000;
    const url = `${this.baseUrl}/models/install`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...this.getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ repo_id: repoId }),
      signal: AbortSignal.timeout(timeout),
    });

    if (res.status === 401 || res.status === 403) {
      throw new VoiceStudioAuthError(
        `Unauthorized model install on VoiceStudio (${res.status})`,
        res.status,
        [this.apiKey]
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new VoiceStudioInferenceError(
        `Failed to install model ${repoId}: ${errText}`,
        res.status,
        [this.apiKey]
      );
    }
  }

  /**
   * Generates audio from text prompt via POST /v1/audio/speech.
   * Validates response buffer against container specs and ffprobe.
   */
  public async generateSpeech(
    request: VoiceStudioSpeechRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<VoiceStudioSpeechResult> {
    const cleanText = request.text.trim();
    if (!cleanText) {
      throw new VoiceStudioError("INVALID_INPUT", "Cannot generate speech for empty text prompt");
    }

    const format = request.responseFormat || "wav";
    const speed = request.speed !== undefined ? Math.max(0.25, Math.min(4.0, request.speed)) : 1.0;
    const language = request.language?.trim().toLowerCase();
    const voice = request.voice?.trim() || "alloy";

    const payload: Record<string, unknown> = {
      model: this.defaultModel,
      input: cleanText,
      voice,
      response_format: format,
      speed,
    };

    if (language) {
      payload.language = language;
    }
    if (request.targetDurationSec !== undefined && request.targetDurationSec > 0) {
      payload.duration = request.targetDurationSec;
    }
    if (request.numStep !== undefined) {
      payload.num_step = request.numStep;
    }
    if (request.guidanceScale !== undefined) {
      payload.guidance_scale = request.guidanceScale;
    }
    if (request.seed !== undefined) {
      payload.seed = request.seed;
    }

    const timeout = options?.timeoutMs ?? this.timeoutMs;
    const endpoint = `${this.baseUrl}/v1/audio/speech`;

    const startTime = Date.now();
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      attempt++;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        if (options?.signal) {
          options.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        let res: Response;
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              ...this.getAuthHeaders(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // Handle specific error codes
        if (res.status === 401 || res.status === 403) {
          throw new VoiceStudioAuthError(
            `Authentication failed on VoiceStudio (${res.status}): ensure VOICESTUDIO_API_KEY matches OMNIVOICE_API_KEY`,
            res.status,
            [this.apiKey]
          );
        }

        if (res.status === 429) {
          const retryHeader = res.headers.get("retry-after");
          const retrySec = retryHeader ? parseInt(retryHeader, 10) || 5 : 5;
          if (attempt <= this.maxRetries) {
            await new Promise((r) => setTimeout(r, retrySec * 1000));
            continue;
          }
          throw new VoiceStudioRateLimitError(
            "VoiceStudio GPU inference queue is saturated (HTTP 429)",
            retrySec,
            [this.apiKey]
          );
        }

        if (res.status === 503) {
          const retryHeader = res.headers.get("retry-after");
          const retrySec = retryHeader ? parseInt(retryHeader, 10) || 3 : 3;
          if (attempt <= this.maxRetries) {
            await new Promise((r) => setTimeout(r, retrySec * 1000));
            continue;
          }
          throw new VoiceStudioUnavailableError(
            "VoiceStudio engine is not ready or model is still loading (HTTP 503)",
            retrySec,
            [this.apiKey]
          );
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new VoiceStudioInferenceError(
            `VoiceStudio speech generation failed (HTTP ${res.status}): ${errorText}`,
            res.status,
            [this.apiKey]
          );
        }

        const contentType = res.headers.get("content-type") || `audio/${format}`;
        const arrayBuf = await res.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);

        // Validate audio buffer integrity
        const probeResult = await assertValidAudio(audioBuffer, format);

        const serverInferenceHeader = res.headers.get("x-inference-time-ms");
        return {
          audio: audioBuffer,
          contentType,
          format,
          fileSizeBytes: audioBuffer.length,
          durationSec:
            probeResult.durationSec && probeResult.durationSec > 0
              ? probeResult.durationSec
              : undefined,
          sampleRate: probeResult.sampleRate,
          channels: probeResult.channels,
          timing: {
            wallClockMs: Date.now() - startTime,
            serverInferenceMs: serverInferenceHeader ? Number(serverInferenceHeader) : undefined,
          },
        };
      } catch (err: unknown) {
        if (err instanceof VoiceStudioError) {
          throw err;
        }

        const isAbort = (err as Error).name === "AbortError";
        if (isAbort) {
          throw new VoiceStudioTimeoutError("VoiceStudio speech request exceeded timeout", timeout);
        }

        // Network error retry
        if (attempt <= this.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        const msg = (err as Error).message || String(err);
        throw new VoiceStudioInferenceError(`VoiceStudio request failed: ${msg}`, 500, [
          this.apiKey,
        ]);
      }
    }

    throw new VoiceStudioInferenceError("VoiceStudio speech generation exhausted retry attempts");
  }
}

export function createVoiceStudioClient(config?: VoiceStudioConfig): VoiceStudioClient {
  return new VoiceStudioClient(config);
}
