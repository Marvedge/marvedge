import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRedisConfig, getStandardRedisOptions } from "./redisConfig";

describe("redisConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getStandardRedisOptions", () => {
    it("returns standard BullMQ options with maxRetriesPerRequest: null and enableReadyCheck: false", () => {
      const options = getStandardRedisOptions();
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
    });

    it("allows caller overrides while preserving defaults unless explicitly overridden", () => {
      const options = getStandardRedisOptions({
        connectionName: "video-worker-custom",
        connectTimeout: 5000,
      });
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
      expect(options.connectionName).toBe("video-worker-custom");
      expect(options.connectTimeout).toBe(5000);
    });

    it("allows overriding enableReadyCheck if explicitly required", () => {
      const options = getStandardRedisOptions({ enableReadyCheck: true });
      expect(options.enableReadyCheck).toBe(true);
      expect(options.maxRetriesPerRequest).toBeNull();
    });
  });

  describe("resolveRedisConfig", () => {
    it("parses standard redis:// localhost in development", () => {
      const config = resolveRedisConfig("redis://localhost:6379", { isProduction: false });
      expect(config.isTls).toBe(false);
      expect(config.url).toBe("redis://localhost:6379");
      expect(config.options.maxRetriesPerRequest).toBeNull();
      expect(config.options.enableReadyCheck).toBe(false);
    });

    it("parses rediss:// TLS Redis URLs correctly", () => {
      const config = resolveRedisConfig("rediss://default:secret@marvedge-redis.upstash.io:6379", {
        isProduction: true,
      });
      expect(config.isTls).toBe(true);
      expect(config.url).toBe("rediss://default:secret@marvedge-redis.upstash.io:6379");
      expect(config.options.maxRetriesPerRequest).toBeNull();
      expect(config.options.enableReadyCheck).toBe(false);
    });

    it("reads from process.env.REDIS_URL when rawUrl is omitted", () => {
      process.env.REDIS_URL = "rediss://default:token@shared-redis.upstash.io:6379";
      const config = resolveRedisConfig(undefined, { isProduction: true });
      expect(config.isTls).toBe(true);
      expect(config.url).toBe("rediss://default:token@shared-redis.upstash.io:6379");
    });

    it("rejects localhost Redis in production", () => {
      expect(() =>
        resolveRedisConfig("redis://127.0.0.1:6379", { isProduction: true })
      ).toThrowError(/Accidental localhost Redis target detected in production/);
    });

    it("allows localhost in production when allowLocalhostInProduction is true", () => {
      const config = resolveRedisConfig("redis://127.0.0.1:6379", {
        isProduction: true,
        allowLocalhostInProduction: true,
      });
      expect(config.url).toBe("redis://127.0.0.1:6379");
      expect(config.isTls).toBe(false);
    });

    it("rejects invalid protocols with clean error message", () => {
      expect(() =>
        resolveRedisConfig("http://redis.example.com:6379", { isProduction: false })
      ).toThrowError(/^Invalid Redis protocol: "http:". Must be redis: or rediss:$/);
    });
  });
});
