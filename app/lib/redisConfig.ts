import { RedisOptions } from "ioredis";

export interface ResolvedRedisConfig {
  url: string;
  isTls: boolean;
  options: RedisOptions;
}

/**
 * Standard Redis options required for BullMQ compatibility across both App and Workers:
 * - maxRetriesPerRequest: null (BullMQ strict requirement for blocking commands like BRPOPLPUSH / BLMOVE)
 * - enableReadyCheck: false (avoids redundant INFO command over managed/serverless proxies)
 * - connectTimeout: 5000 (bounds initial TCP/TLS connection handshake to avoid indefinite hangs)
 */
export function getStandardRedisOptions(overrides: RedisOptions = {}): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5000,
    ...overrides,
  };
}

/**
 * Resolves the Redis connection URL with environment-aware guards.
 * - Uses REDIS_URL when configured (trimmed).
 * - Preserves redis://localhost:6379 as the local development fallback.
 * - In production, fails immediately with a clear error if REDIS_URL is missing or empty.
 * - Trims environment variable values before validation.
 * - Never prints or logs credentials or the full Redis URL.
 */
export function resolveRedisUrl(
  rawUrl?: string,
  options: { isProduction?: boolean; allowLocalhostInProduction?: boolean } = {}
): string {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  const candidate = (rawUrl !== undefined ? rawUrl : process.env.REDIS_URL || "").trim();

  if (!candidate) {
    if (isProduction) {
      throw new Error(
        "Missing required production setting: REDIS_URL must point to the shared production Redis instance (e.g. AWS ElastiCache or Upstash)."
      );
    }
    return "redis://localhost:6379";
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Invalid REDIS_URL format. Must be a valid URL string.");
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`Invalid Redis protocol: "${parsed.protocol}". Must be redis: or rediss:`);
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
      `Accidental localhost Redis target detected in production (${hostname}). Configure a shared production Redis URL (e.g. AWS ElastiCache or Upstash).`
    );
  }

  return candidate;
}

/**
 * Resolves and validates Redis configuration.
 * Automatically parses `rediss://` TLS URLs or `redis://` URLs.
 */
export function resolveRedisConfig(
  rawUrl?: string,
  options: { isProduction?: boolean; allowLocalhostInProduction?: boolean } = {}
): ResolvedRedisConfig {
  const url = resolveRedisUrl(rawUrl, options);
  const isTls = url.startsWith("rediss:");
  const redisOptions = getStandardRedisOptions();

  return {
    url,
    isTls,
    options: redisOptions,
  };
}
