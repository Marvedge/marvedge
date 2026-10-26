import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRedisConfig, getStandardRedisOptions } from "./redisConfig";

describe("resolveRedisConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("parses standard redis:// localhost in development", () => {
    const config = resolveRedisConfig("redis://localhost:6379", { isProduction: false });
    expect(config.isTls).toBe(false);
    expect(config.url).toBe("redis://localhost:6379");
    expect(config.options.maxRetriesPerRequest).toBeNull();
  });

  it("parses rediss:// TLS Redis URLs correctly", () => {
    const config = resolveRedisConfig("rediss://default:secret@marvedge-redis.upstash.io:6379", {
      isProduction: true,
    });
    expect(config.isTls).toBe(true);
    expect(config.url).toBe("rediss://default:secret@marvedge-redis.upstash.io:6379");
    expect(config.options.maxRetriesPerRequest).toBeNull();
  });

  it("rejects localhost Redis in production", () => {
    expect(() =>
      resolveRedisConfig("redis://127.0.0.1:6379", { isProduction: true })
    ).toThrowError(/Accidental localhost Redis target detected in production/);
  });

  it("rejects invalid protocols like http:// or amqp://", () => {
    expect(() =>
      resolveRedisConfig("http://redis.example.com:6379", { isProduction: false })
    ).toThrowError(/Invalid Redis protocol/);
  });

  it("returns standard BullMQ options with maxRetriesPerRequest: null", () => {
    const options = getStandardRedisOptions();
    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options.enableReadyCheck).toBe(false);
  });
});
