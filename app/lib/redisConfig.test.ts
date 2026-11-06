import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRedisConfig, resolveRedisUrl, getStandardRedisOptions } from "./redisConfig";

describe("redisConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getStandardRedisOptions", () => {
    it("returns standard BullMQ options with maxRetriesPerRequest: null, enableReadyCheck: false, and connectTimeout: 5000", () => {
      const options = getStandardRedisOptions();
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
      expect(options.connectTimeout).toBe(5000);
    });

    it("allows caller overrides while preserving defaults unless explicitly overridden", () => {
      const options = getStandardRedisOptions({
        connectionName: "video-worker-custom",
        connectTimeout: 10000,
      });
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.enableReadyCheck).toBe(false);
      expect(options.connectionName).toBe("video-worker-custom");
      expect(options.connectTimeout).toBe(10000);
    });

    it("allows overriding enableReadyCheck if explicitly required", () => {
      const options = getStandardRedisOptions({ enableReadyCheck: true });
      expect(options.enableReadyCheck).toBe(true);
      expect(options.maxRetriesPerRequest).toBeNull();
      expect(options.connectTimeout).toBe(5000);
    });
  });

  describe("resolveRedisUrl", () => {
    it("fails immediately in production when REDIS_URL is missing", () => {
      delete process.env.REDIS_URL;
      expect(() => resolveRedisUrl(undefined, { isProduction: true })).toThrowError(
        /Missing required production setting: REDIS_URL/
      );
    });

    it("fails immediately in production when REDIS_URL is empty or whitespace", () => {
      process.env.REDIS_URL = "   ";
      expect(() => resolveRedisUrl(undefined, { isProduction: true })).toThrowError(
        /Missing required production setting: REDIS_URL/
      );
    });

    it("falls back to redis://localhost:6379 in development when REDIS_URL is unset", () => {
      delete process.env.REDIS_URL;
      const url = resolveRedisUrl(undefined, { isProduction: false });
      expect(url).toBe("redis://localhost:6379");
    });

    it("falls back to redis://localhost:6379 in development when REDIS_URL is whitespace", () => {
      process.env.REDIS_URL = "   ";
      const url = resolveRedisUrl(undefined, { isProduction: false });
      expect(url).toBe("redis://localhost:6379");
    });

    it("resolves configured rediss:// URL in production", () => {
      process.env.REDIS_URL = "rediss://default:secret@marvedge-sydney.upstash.io:6379";
      const url = resolveRedisUrl(undefined, { isProduction: true });
      expect(url).toBe("rediss://default:secret@marvedge-sydney.upstash.io:6379");
    });

    it("trims whitespace around configured REDIS_URL", () => {
      process.env.REDIS_URL = "  rediss://default:secret@marvedge-sydney.upstash.io:6379  \n";
      const url = resolveRedisUrl(undefined, { isProduction: true });
      expect(url).toBe("rediss://default:secret@marvedge-sydney.upstash.io:6379");
    });

    it("trims whitespace when rawUrl parameter is passed", () => {
      const url = resolveRedisUrl("  redis://custom-host.internal:6379  ", { isProduction: false });
      expect(url).toBe("redis://custom-host.internal:6379");
    });

    it("rejects localhost target in production without logging credentials", () => {
      expect(() =>
        resolveRedisUrl("redis://default:mysecretpassword@127.0.0.1:6379", { isProduction: true })
      ).toThrowError(/Accidental localhost Redis target detected in production \(127\.0\.0\.1\)/);
      // Ensure password is NOT leaked in the error
      try {
        resolveRedisUrl("redis://default:mysecretpassword@127.0.0.1:6379", { isProduction: true });
      } catch (err: unknown) {
        if (err instanceof Error) {
          expect(err.message).not.toContain("mysecretpassword");
        }
      }
    });

    it("allows localhost in production when allowLocalhostInProduction is true", () => {
      const url = resolveRedisUrl("redis://127.0.0.1:6379", {
        isProduction: true,
        allowLocalhostInProduction: true,
      });
      expect(url).toBe("redis://127.0.0.1:6379");
    });

    it("rejects invalid Redis protocols", () => {
      expect(() =>
        resolveRedisUrl("http://redis.example.com:6379", { isProduction: false })
      ).toThrowError(/^Invalid Redis protocol: "http:". Must be redis: or rediss:$/);
    });

    it("rejects malformed URL strings without logging raw string", () => {
      expect(() => resolveRedisUrl("not-a-valid-url", { isProduction: false })).toThrowError(
        /Invalid REDIS_URL format/
      );
    });
  });

  describe("resolveRedisConfig", () => {
    it("parses standard redis:// localhost in development", () => {
      const config = resolveRedisConfig("redis://localhost:6379", { isProduction: false });
      expect(config.isTls).toBe(false);
      expect(config.url).toBe("redis://localhost:6379");
      expect(config.options.maxRetriesPerRequest).toBeNull();
      expect(config.options.enableReadyCheck).toBe(false);
      expect(config.options.connectTimeout).toBe(5000);
    });

    it("parses rediss:// TLS Redis URLs correctly", () => {
      const config = resolveRedisConfig("rediss://default:secret@marvedge-redis.upstash.io:6379", {
        isProduction: true,
      });
      expect(config.isTls).toBe(true);
      expect(config.url).toBe("rediss://default:secret@marvedge-redis.upstash.io:6379");
      expect(config.options.maxRetriesPerRequest).toBeNull();
      expect(config.options.enableReadyCheck).toBe(false);
      expect(config.options.connectTimeout).toBe(5000);
    });

    it("reads from process.env.REDIS_URL when rawUrl is omitted", () => {
      process.env.REDIS_URL = "rediss://default:token@shared-redis.upstash.io:6379";
      const config = resolveRedisConfig(undefined, { isProduction: true });
      expect(config.isTls).toBe(true);
      expect(config.url).toBe("rediss://default:token@shared-redis.upstash.io:6379");
      expect(config.options.connectTimeout).toBe(5000);
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
