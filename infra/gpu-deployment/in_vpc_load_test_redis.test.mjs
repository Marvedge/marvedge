import { describe, expect, it } from "vitest";
import { resolveLoadTestRedis, formatRedisTarget } from "./loadTestRedis.mjs";

describe("resolveLoadTestRedis", () => {
  it("uses explicit CLI --redis-url with highest precedence", () => {
    const args = ["--redis-url", "rediss://default:secret@marvedge-redis.upstash.io:6379"];
    const env = {
      REDIS_URL: "redis://other-redis:6379",
      REDIS_HOST: "vpc-host",
      REDIS_PORT: "6380",
    };

    const result = resolveLoadTestRedis(args, env);

    expect(result.source).toBe("cli-url");
    expect(result.connection).toEqual({
      url: "rediss://default:secret@marvedge-redis.upstash.io:6379",
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    expect(result.displayTarget).toBe("rediss://default:***@marvedge-redis.upstash.io:6379");
  });

  it("uses explicit CLI --redis-host and --redis-port over env variables", () => {
    const args = ["--redis-host", "custom-host.internal", "--redis-port", "6380"];
    const env = {
      REDIS_URL: "redis://env-redis:6379",
      REDIS_HOST: "vpc-host",
    };

    const result = resolveLoadTestRedis(args, env);

    expect(result.source).toBe("cli-host");
    expect(result.connection).toEqual({
      host: "custom-host.internal",
      port: 6380,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    expect(result.displayTarget).toBe("custom-host.internal:6380");
  });

  it("uses REDIS_URL from env when no CLI argument is provided", () => {
    const args = [];
    const env = {
      REDIS_URL: "rediss://default:mytoken@sydney-redis.upstash.io:6379",
      REDIS_HOST: "vpc-host",
    };

    const result = resolveLoadTestRedis(args, env);

    expect(result.source).toBe("env-url");
    expect(result.connection).toEqual({
      url: "rediss://default:mytoken@sydney-redis.upstash.io:6379",
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    expect(result.displayTarget).toBe("rediss://default:***@sydney-redis.upstash.io:6379");
  });

  it("uses REDIS_HOST and REDIS_PORT from env when REDIS_URL is absent", () => {
    const args = [];
    const env = {
      REDIS_HOST: "my-elasticache.vpc.internal",
      REDIS_PORT: "6385",
    };

    const result = resolveLoadTestRedis(args, env);

    expect(result.source).toBe("env-host");
    expect(result.connection).toEqual({
      host: "my-elasticache.vpc.internal",
      port: 6385,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    expect(result.displayTarget).toBe("my-elasticache.vpc.internal:6385");
  });

  it("falls back to default AWS ElastiCache VPC hostname when neither CLI nor env is set", () => {
    const args = [];
    const env = {};

    const result = resolveLoadTestRedis(args, env);

    expect(result.source).toBe("default-fallback");
    expect(result.connection).toEqual({
      host: "marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    expect(result.displayTarget).toBe("marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379");
  });

  it("redacts passwords in formatRedisTarget", () => {
    expect(formatRedisTarget("rediss://default:supersecret@endpoint.upstash.io:6379")).toBe(
      "rediss://default:***@endpoint.upstash.io:6379"
    );
    expect(formatRedisTarget("redis://localhost:6379")).toBe("redis://localhost:6379");
    expect(formatRedisTarget("custom-host:6379")).toBe("custom-host:6379");
  });
});
