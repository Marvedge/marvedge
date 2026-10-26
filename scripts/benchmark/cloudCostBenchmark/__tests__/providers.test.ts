import { describe, expect, it } from "vitest";
import {
  executeAvsStage,
  executeCaptionsStage,
  executeDubbingStage,
  executeReframeStage,
} from "../providers";
import type { InputMediaMetadata } from "../types";

const mockMedia: InputMediaMetadata = {
  path: "/dummy/test_clip.mp4",
  durationSec: 10.0,
  fileSizeBytes: 2_500_000,
  isSynthetic: true,
};

describe("Provider Offline Execution & Guardrails", () => {
  it("executes reframe in fixture mode with valid crop filter", async () => {
    const res = await executeReframeStage(mockMedia, "fixture");
    expect(res.stage).toBe("reframe");
    expect(res.status).toBe("fixture");
    expect(res.provider).toBe("fixture");
    expect(res.outputArtifacts?.cropFilter).toContain("crop=");
    expect(res.outputArtifacts?.targetCount).toBeGreaterThan(0);
  });

  it("blocks real reframe when AutoFlip service URL is unset", async () => {
    const oldUrl = process.env.AUTOFILP_SERVICE_URL;
    const oldGw = process.env.ML_GATEWAY_URL;
    delete process.env.AUTOFILP_SERVICE_URL;
    delete process.env.ML_GATEWAY_URL;

    try {
      const res = await executeReframeStage(mockMedia, "real");
      expect(res.status).toBe("blocked");
      expect(res.error).toBe("AUTOFILP_SERVICE_URL_UNSET");
    } finally {
      if (oldUrl) {
        process.env.AUTOFILP_SERVICE_URL = oldUrl;
      }
      if (oldGw) {
        process.env.ML_GATEWAY_URL = oldGw;
      }
    }
  });

  it("executes AVS in fixture mode with valid speaker segments", async () => {
    const res = await executeAvsStage(mockMedia, "fixture");
    expect(res.stage).toBe("avs");
    expect(res.status).toBe("fixture");
    expect(res.outputArtifacts?.activeSegments.length).toBeGreaterThan(0);
  });

  it("blocks real AVS when TalkNet model weights are missing without downloading", async () => {
    const res = await executeAvsStage(mockMedia, "real");
    expect(res.status).toBe("blocked");
    expect(res.error).toBe("TALKNET_WEIGHTS_MISSING");
    expect(res.notes.some((n) => n.includes("Automatic model weight download is disabled"))).toBe(
      true
    );
  });

  it("executes captions in fixture mode and satisfies subtitle invariants", async () => {
    const res = await executeCaptionsStage(mockMedia, "fixture");
    expect(res.stage).toBe("captions");
    expect(res.status).toBe("fixture");
    expect(res.outputArtifacts?.cuesCount).toBeGreaterThan(0);
    expect(res.outputArtifacts?.sampleAssEvent).toContain("Dialogue:");
  });

  it("blocks real captions when Whisper API key is missing", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const res = await executeCaptionsStage(mockMedia, "whisper");
      expect(res.status).toBe("blocked");
      expect(res.error).toBe("OPENAI_API_KEY_UNSET");
    } finally {
      if (oldKey) {
        process.env.OPENAI_API_KEY = oldKey;
      }
    }
  });

  it("executes dubbing in fixture mode with zero spend simulation", async () => {
    const res = await executeDubbingStage(mockMedia, "fixture");
    expect(res.stage).toBe("dubbing");
    expect(res.status).toBe("fixture");
    expect(res.outputArtifacts?.status).toBe("COMPLETED");
    expect(res.outputArtifacts?.dubbedDurationSec).toBe(mockMedia.durationSec);
  });

  it("blocks real dubbing when ElevenLabs API key is missing", async () => {
    const oldKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;

    try {
      const res = await executeDubbingStage(mockMedia, "elevenlabs");
      expect(res.status).toBe("blocked");
      expect(res.error).toBe("ELEVENLABS_API_KEY_UNSET");
    } finally {
      if (oldKey) {
        process.env.ELEVENLABS_API_KEY = oldKey;
      }
    }
  });
});
