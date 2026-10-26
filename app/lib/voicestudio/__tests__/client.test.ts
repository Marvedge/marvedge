import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceStudioClient } from "../client";
import {
  VoiceStudioAuthError,
  VoiceStudioError,
  VoiceStudioRateLimitError,
  VoiceStudioTimeoutError,
  VoiceStudioUnavailableError,
} from "../errors";

function createSyntheticWavBuffer(durationSec: number = 1.0, sampleRate: number = 16000): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");

  // fmt subchunk
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit

  // data subchunk
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

describe("VoiceStudioClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("A. initializes with sane defaults and normalizes baseUrl trailing slashes", () => {
    const client = new VoiceStudioClient({
      baseUrl: "http://127.0.0.1:3900///",
      apiKey: "super-secret-key-12345",
    });

    expect(client.baseUrl).toBe("http://127.0.0.1:3900");
    expect(client.defaultModel).toBe("omnivoice");
    expect(client.timeoutMs).toBe(45000);
    expect(client.maxRetries).toBe(2);
    expect(client.fallbackToPaid).toBe(false);
  });

  it("B. redacts API keys from all error messages and causes", () => {
    const secretKey = "super-secret-production-token-998877";
    const client = new VoiceStudioClient({
      baseUrl: "http://127.0.0.1:3900",
      apiKey: secretKey,
    });

    global.fetch = vi.fn().mockResolvedValue(
      new Response(`Server error including key: ${secretKey}`, {
        status: 401,
      })
    );

    return expect(client.generateSpeech({ text: "Hello" })).rejects.toThrowError(
      expect.not.stringContaining(secretKey)
    );
  });

  it("C. checkHealth returns ready=true and extracts GPU device on HTTP 200", async () => {
    const client = new VoiceStudioClient({ baseUrl: "http://127.0.0.1:3900" });

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          device: "cuda (NVIDIA Tesla T4)",
          version: "0.5.6",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const health = await client.checkHealth();
    expect(health.status).toBe("ok");
    expect(health.isReady).toBe(true);
    expect(health.isGpu).toBe(true);
    expect(health.gpuModel).toBe("NVIDIA Tesla T4");
    expect(health.version).toBe("0.5.6");
  });

  it("D. checkHealth handles HTTP 503 warmup/startup state gracefully", async () => {
    const client = new VoiceStudioClient({ baseUrl: "http://127.0.0.1:3900" });

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "starting",
          step: "load_models",
          label: "Downloading OmniVoice weights...",
          version: "0.5.6",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "10",
          },
        }
      )
    );

    const health = await client.checkHealth();
    expect(health.status).toBe("starting");
    expect(health.isReady).toBe(false);
    expect(health.startupStep).toBe("load_models");
    expect(health.startupLabel).toContain("Downloading OmniVoice");
    expect(health.retryAfterSec).toBe(10);
  });

  it("E. generateSpeech validates empty input prompt before dispatch", async () => {
    const client = new VoiceStudioClient();
    await expect(client.generateSpeech({ text: "   " })).rejects.toThrowError(
      "Cannot generate speech for empty text prompt"
    );
  });

  it("F. generateSpeech throws VoiceStudioAuthError on HTTP 401/403", async () => {
    const client = new VoiceStudioClient({ apiKey: "bad-key" });

    global.fetch = vi.fn().mockResolvedValue(
      new Response("Invalid credentials", { status: 401 })
    );

    await expect(client.generateSpeech({ text: "Test speech" })).rejects.toThrowError(
      VoiceStudioAuthError
    );
  });

  it("G. generateSpeech throws VoiceStudioRateLimitError on HTTP 429 after retries", async () => {
    const client = new VoiceStudioClient({ maxRetries: 0 });

    global.fetch = vi.fn().mockResolvedValue(
      new Response("Too many jobs", {
        status: 429,
        headers: { "Retry-After": "2" },
      })
    );

    await expect(client.generateSpeech({ text: "Test speech" })).rejects.toThrowError(
      VoiceStudioRateLimitError
    );
  });

  it("H. generateSpeech successfully receives audio and validates payload", async () => {
    const client = new VoiceStudioClient({ apiKey: "valid-key" });
    const mockWav = createSyntheticWavBuffer(1.0, 16000);

    global.fetch = vi.fn().mockImplementation(async (url, init) => {
      expect(init?.headers?.Authorization).toBe("Bearer valid-key");
      const parsed = JSON.parse(init?.body as string);
      expect(parsed.input).toBe("Dubbing test");
      expect(parsed.language).toBe("es");
      expect(parsed.duration).toBe(2.5);

      return new Response(mockWav, {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Disposition": 'inline; filename="speech.wav"',
        },
      });
    });

    const res = await client.generateSpeech({
      text: "Dubbing test",
      language: "es",
      targetDurationSec: 2.5,
    });

    expect(res.format).toBe("wav");
    expect(res.contentType).toBe("audio/wav");
    expect(res.audio.length).toBe(mockWav.length);
    expect(res.fileSizeBytes).toBeGreaterThan(44);
  });

  it("I. generateSpeech throws VoiceStudioTimeoutError when request aborts", async () => {
    const client = new VoiceStudioClient({ timeoutMs: 50 });

    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          }, 80);
        })
    );

    await expect(client.generateSpeech({ text: "Timeout test" })).rejects.toThrowError(
      VoiceStudioTimeoutError
    );
  });
});
