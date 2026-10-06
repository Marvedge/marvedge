import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDubServiceUrl,
  normalizeWorkerBaseUrl,
  invokeGcpDubSync,
  invokeGcpWorker,
  type GcpDubSyncPayload,
} from "./gcpWorker";

describe("gcpWorker - AVS Dubbing Service URL Resolution & Routing", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  const samplePayload: GcpDubSyncPayload = {
    videoUrl: "https://example.com/source.mp4",
    dubUrl: "https://example.com/dub.mp3",
    steps: [{ id: "step-1", startTime: 0, endTime: 5 }],
    dubTimings: [{ stepId: "step-1", start: 0, end: 4.8 }],
  };

  describe("URL Normalization (normalizeWorkerBaseUrl)", () => {
    it("strips trailing slashes cleanly", () => {
      expect(normalizeWorkerBaseUrl("http://localhost:8080/")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080///")).toBe("http://localhost:8080");
    });

    it("strips /avs-dub if present in the base URL to prevent duplicate /avs-dub/avs-dub", () => {
      expect(normalizeWorkerBaseUrl("http://cloudrun-worker:8080/avs-dub")).toBe(
        "http://cloudrun-worker:8080"
      );
      expect(normalizeWorkerBaseUrl("http://cloudrun-worker:8080/avs-dub/")).toBe(
        "http://cloudrun-worker:8080"
      );
      expect(normalizeWorkerBaseUrl("https://run.app/avs-dub")).toBe("https://run.app");
    });

    it("strips other known worker endpoints properly", () => {
      expect(normalizeWorkerBaseUrl("http://localhost:8080/process")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080/subtitles")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080/avs-voiceover")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080/avs-sync")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080/wtm-composite")).toBe("http://localhost:8080");
      expect(normalizeWorkerBaseUrl("http://localhost:8080/package-hls")).toBe("http://localhost:8080");
    });
  });

  describe("Service URL Resolution (getDubServiceUrl)", () => {
    it("TEST A — resolves to AVS_DUB_SERVICE_URL when set", () => {
      process.env.AVS_DUB_SERVICE_URL = "http://cloudrun-worker:8080";
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      expect(getDubServiceUrl()).toBe("http://cloudrun-worker:8080");
    });

    it("TEST B — falls back to GCP_VIDEO_WORKER_URL when AVS_DUB_SERVICE_URL is absent or empty", () => {
      delete process.env.AVS_DUB_SERVICE_URL;
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      expect(getDubServiceUrl()).toBe("https://production-gcp-worker.run.app");

      process.env.AVS_DUB_SERVICE_URL = "   ";
      expect(getDubServiceUrl()).toBe("https://production-gcp-worker.run.app");
    });
  });

  describe("invokeGcpDubSync Routing Execution", () => {
    it("does not retry deterministic 4xx responses", async () => {
      process.env.GCP_VIDEO_WORKER_URL = "https://worker.example.com";
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid subtitle input" }),
      });

      await expect(invokeGcpWorker({ recipeId: "subtitles" }, "/subtitles")).rejects.toThrow(
        "Invalid subtitle input"
      );

      expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it("TEST A — local override: POSTs to http://cloudrun-worker:8080/avs-dub exactly once", async () => {
      process.env.AVS_DUB_SERVICE_URL = "http://cloudrun-worker:8080";
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        capturedUrl = url;
        capturedMethod = init?.method;
        capturedBody = JSON.parse(init?.body || "{}");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              recipeId: "avs-dub",
              alignedVideoUrl: "http://cloudrun-worker:8080/artifacts/aligned-1.mp4",
              duration: 5.0,
            },
          }),
        };
      });

      const res = await invokeGcpDubSync(samplePayload);

      expect(capturedMethod).toBe("POST");
      expect(capturedUrl).toBe("http://cloudrun-worker:8080/avs-dub");
      expect(capturedBody.recipeId).toBe("avs-dub");
      expect(capturedBody.videoUrl).toBe(samplePayload.videoUrl);
      expect(res.alignedVideoUrl).toBe("http://cloudrun-worker:8080/artifacts/aligned-1.mp4");
      expect(res.duration).toBe(5.0);
    });

    it("TEST B — production/default: POSTs to GCP_VIDEO_WORKER_URL/avs-dub when override is absent", async () => {
      delete process.env.AVS_DUB_SERVICE_URL;
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      let capturedUrl = "";

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              recipeId: "avs-dub",
              alignedVideoUrl: "https://storage.googleapis.com/processed-bucket/aligned-prod.mp4",
              duration: 5.0,
            },
          }),
        };
      });

      const res = await invokeGcpDubSync(samplePayload);

      expect(capturedUrl).toBe("https://production-gcp-worker.run.app/avs-dub");
      expect(res.alignedVideoUrl).toBe(
        "https://storage.googleapis.com/processed-bucket/aligned-prod.mp4"
      );
    });

    it("avoids /avs-dub/avs-dub when base URL contains trailing slash or /avs-dub", async () => {
      process.env.AVS_DUB_SERVICE_URL = "http://cloudrun-worker:8080/avs-dub/";
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      let capturedUrl = "";

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              recipeId: "avs-dub",
              alignedVideoUrl: "http://cloudrun-worker:8080/artifacts/aligned-1.mp4",
              duration: 5.0,
            },
          }),
        };
      });

      await invokeGcpDubSync(samplePayload);
      expect(capturedUrl).toBe("http://cloudrun-worker:8080/avs-dub");
    });

    it("honors per-invocation serviceUrl option override", async () => {
      delete process.env.AVS_DUB_SERVICE_URL;
      process.env.GCP_VIDEO_WORKER_URL = "https://production-gcp-worker.run.app";

      let capturedUrl = "";

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              recipeId: "avs-dub",
              alignedVideoUrl: "http://custom-worker:9000/artifacts/aligned.mp4",
              duration: 5.0,
            },
          }),
        };
      });

      await invokeGcpDubSync(samplePayload, { serviceUrl: "http://custom-worker:9000" });
      expect(capturedUrl).toBe("http://custom-worker:9000/avs-dub");
    });
  });
});
