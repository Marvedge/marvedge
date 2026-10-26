process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDubbingJob,
  getAudioExtension,
  getDubbedAudio,
  getDubbingStatus,
  waitForDubbingCompletion,
} from "./dubbing";

describe("ElevenLabs dubbing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAudioExtension", () => {
    it("returns correct file extension for common audio MIME types", () => {
      expect(getAudioExtension("audio/mpeg")).toBe("mp3");
      expect(getAudioExtension("audio/mp3")).toBe("mp3");
      expect(getAudioExtension("audio/wav")).toBe("wav");
      expect(getAudioExtension("audio/x-wav")).toBe("wav");
      expect(getAudioExtension("audio/mp4")).toBe("m4a");
      expect(getAudioExtension("audio/x-m4a")).toBe("m4a");
      expect(getAudioExtension("audio/aac")).toBe("aac");
      expect(getAudioExtension("audio/ogg")).toBe("ogg");
      expect(getAudioExtension("audio/flac")).toBe("flac");
      expect(getAudioExtension("audio/webm")).toBe("webm");
    });

    it("strips charset parameters before determining extension", () => {
      expect(getAudioExtension("audio/wav; charset=utf-8")).toBe("wav");
      expect(getAudioExtension("audio/mpeg; charset=binary")).toBe("mp3");
    });

    it("defaults to mp3 for unknown MIME types", () => {
      expect(getAudioExtension("audio/unknown")).toBe("mp3");
    });
  });

  it("creates a dubbing job using multipart form data", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "processing",
        }),
        { status: 200 }
      )
    );

    const result = await createDubbingJob({
      sourceUrl: "https://example.com/video.mp4",
      targetLanguage: "ta",
    });

    expect(result.dubbingId).toBe("dub-123");

    const [, request] = fetchMock.mock.calls[0];
    expect(request?.method).toBe("POST");
    expect(request?.body).toBeInstanceOf(FormData);

    const formData = request?.body as FormData;
    expect(formData.get("source_url")).toBe("https://example.com/video.mp4");
    expect(formData.get("target_lang")).toBe("ta");
  });

  it("normalizes uppercase target language codes when creating dubbing job", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-456",
          status: "processing",
        }),
        { status: 200 }
      )
    );

    const result = await createDubbingJob({
      sourceUrl: "https://example.com/video.mp4",
      targetLanguage: " ES ",
    });

    expect(result.targetLanguage).toBe("es");
    const formData = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(formData.get("target_lang")).toBe("es");
  });

  it("treats dubbed status as successful completion", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "dubbed",
        }),
        { status: 200 }
      )
    );

    const result = await waitForDubbingCompletion("dub-123", {
      intervalMs: 1,
      timeoutMs: 100,
    });

    expect(result.status).toBe("dubbed");
    expect(result.dubbingId).toBe("dub-123");
  });

  it("throws when ElevenLabs reports a failed dubbing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "failed",
        }),
        { status: 200 }
      )
    );

    await expect(
      waitForDubbingCompletion("dub-123", {
        intervalMs: 1,
        timeoutMs: 100,
      })
    ).rejects.toThrow("ElevenLabs dubbing failed");
  });

  it("reads the dubbing status and error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "failed",
          error: "Separation failure",
        }),
        { status: 200 }
      )
    );

    const result = await getDubbingStatus("dub-123");

    expect(result).toEqual({
      dubbingId: "dub-123",
      status: "failed",
      error: "Separation failure",
    });
  });

  it("throws with provider error details when ElevenLabs reports a failed dubbing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "failed",
          error: "Source audio is unreadable",
        }),
        { status: 200 }
      )
    );

    await expect(
      waitForDubbingCompletion("dub-123", {
        intervalMs: 1,
        timeoutMs: 100,
      })
    ).rejects.toThrow("ElevenLabs dubbing failed with status: failed: Source audio is unreadable");
  });

  describe("getDubbedAudio", () => {
    it("fetches dubbed audio with proper credentials and returns buffer", async () => {
      const mockAudioBytes = Buffer.from("fake-mp3-audio-data");
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(mockAudioBytes, {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      );

      const result = await getDubbedAudio("dub-123", "TA");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.elevenlabs.io/v1/dubbing/dub-123/audio/ta",
        expect.objectContaining({
          headers: {
            "xi-api-key": "test-elevenlabs-key",
          },
        })
      );

      expect(result.contentType).toBe("audio/mpeg");
      expect(result.audio.toString()).toBe("fake-mp3-audio-data");
    });

    it("strips charset suffix from content-type and returns normalised MIME", async () => {
      const mockAudioBytes = Buffer.from("fake-mp3-data");
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(mockAudioBytes, {
          status: 200,
          headers: { "content-type": "audio/mpeg; charset=utf-8" },
        })
      );

      const result = await getDubbedAudio("dub-123", "es");

      expect(result.contentType).toBe("audio/mpeg");
    });

    it("throws when audio retrieval returns non-200", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("Audio not ready", {
          status: 404,
        })
      );

      await expect(getDubbedAudio("dub-123", "es")).rejects.toThrow(
        "ElevenLabs audio retrieval failed (404): Audio not ready"
      );
    });

    it("throws when audio retrieval returns empty payload", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(new ArrayBuffer(0), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      );

      await expect(getDubbedAudio("dub-123", "es")).rejects.toThrow(
        "ElevenLabs returned empty audio payload"
      );
    });

    it("throws when upstream returns an unexpected content type (e.g. text/html)", async () => {
      const mockHtml = Buffer.from("<html><body>Error</body></html>");
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(mockHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      );

      await expect(getDubbedAudio("dub-123", "es")).rejects.toThrow(
        "ElevenLabs returned an unexpected content type for the dubbed audio"
      );
    });

    it("throws when upstream returns application/json instead of audio", async () => {
      const body = Buffer.from(JSON.stringify({ error: "not found" }));
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(getDubbedAudio("dub-123", "es")).rejects.toThrow(
        "ElevenLabs returned an unexpected content type for the dubbed audio"
      );
    });

    it("accepts audio/mp4 as a valid content type", async () => {
      const mockAudio = Buffer.from("mp4-audio-bytes");
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(mockAudio, {
          status: 200,
          headers: { "content-type": "audio/mp4" },
        })
      );

      const result = await getDubbedAudio("dub-123", "es");
      expect(result.contentType).toBe("audio/mp4");
    });
  });
});
