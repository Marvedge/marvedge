import { describe, it, expect, afterEach, vi } from "vitest";

// Mock dotenv so dotenv.config() never reads .env / .env.local from disk.
// Without this, getReframeWorkerConfig() internally calls loadReframeWorkerEnv()
// which repopulates process.env.CALLBACK_SECRET from .env.local even after the
// test deletes it � silently preventing the throw-on-missing assertion from firing.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

import { getReframeWorkerConfig } from "./config";

describe("Reframe Worker Config", () => {
  const envMap = process.env as Record<string, string | undefined>;
  const originalCallbackSecret = envMap.CALLBACK_SECRET;
  const originalNodeEnv = envMap.NODE_ENV;
  const originalRedisUrl = envMap.REDIS_URL;
  const originalBackendUrl = envMap.BACKEND_URL;
  const originalConcurrency = envMap.REFRAME_WORKER_CONCURRENCY;

  afterEach(() => {
    if (originalCallbackSecret === undefined) {
      delete envMap.CALLBACK_SECRET;
    } else {
      envMap.CALLBACK_SECRET = originalCallbackSecret;
    }

    if (originalNodeEnv === undefined) {
      delete envMap.NODE_ENV;
    } else {
      envMap.NODE_ENV = originalNodeEnv;
    }

    if (originalRedisUrl === undefined) {
      delete envMap.REDIS_URL;
    } else {
      envMap.REDIS_URL = originalRedisUrl;
    }

    if (originalBackendUrl === undefined) {
      delete envMap.BACKEND_URL;
    } else {
      envMap.BACKEND_URL = originalBackendUrl;
    }

    if (originalConcurrency === undefined) {
      delete envMap.REFRAME_WORKER_CONCURRENCY;
    } else {
      envMap.REFRAME_WORKER_CONCURRENCY = originalConcurrency;
    }
  });

  it("throws an error when CALLBACK_SECRET is missing", () => {
    envMap.CALLBACK_SECRET = "";

    expect(() => getReframeWorkerConfig()).toThrow(
      "CALLBACK_SECRET is required for the Reframe Worker"
    );
  });

  it("loads successfully when CALLBACK_SECRET is configured", () => {
    envMap.CALLBACK_SECRET = "test-secret";

    const config = getReframeWorkerConfig();

    expect(config.callbackSecret).toBe("test-secret");
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  describe("Production Redis validation", () => {
    it("throws when REDIS_URL is missing in production", () => {
      envMap.NODE_ENV = "production";
      envMap.CALLBACK_SECRET = "test-secret";
      delete envMap.REDIS_URL;

      expect(() => getReframeWorkerConfig()).toThrow(
        /Missing required production setting: REDIS_URL/
      );
    });

    it("throws when REDIS_URL points to localhost in production", () => {
      envMap.NODE_ENV = "production";
      envMap.CALLBACK_SECRET = "test-secret";
      envMap.REDIS_URL = "redis://localhost:6379";

      expect(() => getReframeWorkerConfig()).toThrow(
        /Accidental localhost Redis target detected in production/
      );
    });

    it("throws when REDIS_URL points to 127.0.0.1 in production", () => {
      envMap.NODE_ENV = "production";
      envMap.CALLBACK_SECRET = "test-secret";
      envMap.REDIS_URL = "redis://127.0.0.1:6379";

      expect(() => getReframeWorkerConfig()).toThrow(
        /Accidental localhost Redis target detected in production/
      );
    });

    it("accepts valid shared ElastiCache Redis URL in production", () => {
      envMap.NODE_ENV = "production";
      envMap.CALLBACK_SECRET = "test-secret";
      envMap.BACKEND_URL = "https://api.marvedge.com";
      envMap.REFRAME_WORKER_CONCURRENCY = "1";
      envMap.REDIS_URL =
        "redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379";

      const config = getReframeWorkerConfig();
      expect(config.redisUrl).toBe(
        "redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379"
      );
      expect(config.workerConcurrency).toBe(1);
    });
  });
  describe("Queue configuration", () => {
    it("defaults queueName to production reframe-processing when REFRAME_QUEUE_NAME is unset", () => {
      envMap.CALLBACK_SECRET = "test-secret";
      delete envMap.REFRAME_QUEUE_NAME;

      const config = getReframeWorkerConfig();
      expect(config.queueName).toBe("reframe-processing");
    });

    it("uses isolated benchmark queue when REFRAME_QUEUE_NAME is explicitly set", () => {
      envMap.CALLBACK_SECRET = "test-secret";
      envMap.REFRAME_QUEUE_NAME = "reframe-benchmark-queue";

      const config = getReframeWorkerConfig();
      expect(config.queueName).toBe("reframe-benchmark-queue");
    });

    it("trims whitespace and falls back to reframe-processing when empty", () => {
      envMap.CALLBACK_SECRET = "test-secret";
      envMap.REFRAME_QUEUE_NAME = "   ";

      const config = getReframeWorkerConfig();
      expect(config.queueName).toBe("reframe-processing");

      envMap.REFRAME_QUEUE_NAME = "  isolated-test-queue  ";
      const config2 = getReframeWorkerConfig();
      expect(config2.queueName).toBe("isolated-test-queue");
    });
  });
});
