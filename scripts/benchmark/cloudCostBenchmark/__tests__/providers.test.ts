import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  executeAvsStage,
  executeCaptionsStage,
  executeDubbingStage,
  executeReframeStage,
  isValidHttpUrl,
  resolveAccessibleMediaUrl,
  startEphemeralMediaServer,
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

describe("AutoFlip & TalkNet Accessible Media URL Resolution & Server", () => {
  it("validates HTTP/HTTPS URLs and rejects invalid schemes or paths", () => {
    expect(isValidHttpUrl("http://example.com/video.mp4")).toBe(true);
    expect(isValidHttpUrl("https://storage.googleapis.com/test.mp4")).toBe(true);
    expect(isValidHttpUrl("file:///local/path/video.mp4")).toBe(false);
    expect(isValidHttpUrl("/dummy/path.mp4")).toBe(false);
    expect(isValidHttpUrl("not-a-url")).toBe(false);
  });

  it("resolves remote HTTP/HTTPS input URL without ephemeral server", async () => {
    const remoteMedia: InputMediaMetadata = {
      path: "https://bucket.s3.amazonaws.com/test.mp4",
      durationSec: 10,
      fileSizeBytes: 1000,
      isSynthetic: false,
    };

    const resolved = await resolveAccessibleMediaUrl(remoteMedia, "http://autoflip:8000");
    expect(resolved.url).toBe("https://bucket.s3.amazonaws.com/test.mp4");
    expect(resolved.blockedReason).toBeUndefined();
    expect(resolved.cleanup).toBeUndefined();
  });

  it("blocks local media when serving is disabled and returns clear diagnostic error", async () => {
    const oldServe = process.env.BENCHMARK_SERVE_LOCAL_MEDIA;
    const oldEnvUrl = process.env.BENCHMARK_MEDIA_URL;
    delete process.env.BENCHMARK_SERVE_LOCAL_MEDIA;
    delete process.env.BENCHMARK_MEDIA_URL;

    try {
      const resolved = await resolveAccessibleMediaUrl(mockMedia, "http://autoflip:8000");
      expect(resolved.url).toBeUndefined();
      expect(resolved.blockedReason).toContain("requires an accessible HTTP/HTTPS URL");
      expect(resolved.blockedReason).toContain("cannot be sent as a local filesystem path");
    } finally {
      if (oldServe) {
        process.env.BENCHMARK_SERVE_LOCAL_MEDIA = oldServe;
      }
      if (oldEnvUrl) {
        process.env.BENCHMARK_MEDIA_URL = oldEnvUrl;
      }
    }
  });

  it("serves local media file via ephemeral HTTP server and cleans up reliably", async () => {
    const tmpFile = path.join(os.tmpdir(), "ephemeral_serve_test_" + Date.now() + ".mp4");
    fs.writeFileSync(tmpFile, "video content for ephemeral server test");

    try {
      const server = await startEphemeralMediaServer(tmpFile, "127.0.0.1", 0);
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);

      // Verify HTTP retrieval
      const res = await fetch(server.url);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe("video content for ephemeral server test");

      // Verify path traversal rejection
      const parsed = new URL(server.url);
      const badRes = await fetch(`${parsed.origin}/../secret.txt`);
      expect(badRes.status).toBe(404);

      // Cleanup
      await server.close();

      // Verify server is closed
      await expect(fetch(server.url)).rejects.toThrow();
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it("respects BENCHMARK_MEDIA_URL override and rejects invalid URL format", async () => {
    const oldUrl = process.env.BENCHMARK_MEDIA_URL;
    try {
      process.env.BENCHMARK_MEDIA_URL = "not-a-valid-url";
      const res1 = await resolveAccessibleMediaUrl(mockMedia);
      expect(res1.blockedReason).toContain("not a valid HTTP or HTTPS URL");

      process.env.BENCHMARK_MEDIA_URL = "https://cdn.marvedge.internal/test.mp4";
      const res2 = await resolveAccessibleMediaUrl(mockMedia);
      expect(res2.url).toBe("https://cdn.marvedge.internal/test.mp4");
    } finally {
      if (oldUrl) {
        process.env.BENCHMARK_MEDIA_URL = oldUrl;
      } else {
        delete process.env.BENCHMARK_MEDIA_URL;
      }
    }
  });

  it("blocks real AutoFlip execution with MEDIA_URL_INACCESSIBLE when given local path without server", async () => {
    const oldServe = process.env.BENCHMARK_SERVE_LOCAL_MEDIA;
    const oldAutoUrl = process.env.AUTOFILP_SERVICE_URL;
    delete process.env.BENCHMARK_SERVE_LOCAL_MEDIA;
    process.env.AUTOFILP_SERVICE_URL = "http://autoflip:8000";

    try {
      const res = await executeReframeStage(mockMedia, "real");
      expect(res.status).toBe("blocked");
      expect(res.error).toBe("MEDIA_URL_INACCESSIBLE");
      expect(res.notes.some((n) => n.includes("requires an accessible HTTP/HTTPS URL"))).toBe(true);
    } finally {
      if (oldServe) {
        process.env.BENCHMARK_SERVE_LOCAL_MEDIA = oldServe;
      }
      if (oldAutoUrl) {
        process.env.AUTOFILP_SERVICE_URL = oldAutoUrl;
      } else {
        delete process.env.AUTOFILP_SERVICE_URL;
      }
    }
  });
});
