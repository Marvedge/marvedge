import { RedisOptions } from "ioredis";

export interface ResolvedRedisConfig {
  url: string;
  isTls: boolean;
  options: RedisOptions;
}

/**
 * Standard Redis options required for BullMQ compatibility across both App and Workers:
 * - maxRetriesPerRequest: null (BullMQ strict requirement for blocking commands like BRPOPLPUSH / BLMOVE)
 * - enableReadyCheck: false when using certain serverless/managed Redis proxies if required
 */
export function getStandardRedisOptions(overrides: RedisOptions = {}): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...overrides,
  };
}

/**
 * Resolves and validates Redis configuration.
 * Automatically parses `rediss://` TLS URLs or `redis://` URLs.
 */
export function resolveRedisConfig(
  rawUrl?: string,
  options: { isProduction?: boolean; allowLocalhostInProduction?: boolean } = {}
): ResolvedRedisConfig {
  const url = (rawUrl || process.env.REDIS_URL || "redis://localhost:6379").trim();
  const isProduction = options.isProduction ?? (process.env.NODE_ENV === "production");

  let parsed: URL;  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid REDIS_URL format: "${url}"`);
  }

  const isTls = parsed.protocol === "rediss:";
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`nInvalid Redis protocol: "${parsed.protocol}". Must be redis: or rediss:`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  if (isProduction && isLoopback && !options.allowLocalhostInProduction) {
    throw new Error(
      `Accidental localhost Redis target detected in production: "${url}". Configure a shared production Redis URL (e.g. AWS ElastiCache or Upstash).`
    );
  }

  const redisOptions = getStandardRedisOptions();

  return {
    url,
    isTls,
    options: redisOptions,
  };
}
