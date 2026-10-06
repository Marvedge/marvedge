process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDubbingJob,
  getDubbingStatus,
  waitForDubbingCompletion,
} from "./dubbing";

describe("ElevenLabs dubbing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(formData.get("source_url")).toBe(
      "https://example.com/video.mp4"
    );
    expect(formData.get("target_lang")).toBe("ta");
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

  it("reads the dubbing status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          dubbing_id: "dub-123",
          status: "dubbed",
        }),
        { status: 200 }
      )
    );

    const result = await getDubbingStatus("dub-123");

    expect(result).toEqual({
      dubbingId: "dub-123",
      status: "dubbed",
    });
  });
});