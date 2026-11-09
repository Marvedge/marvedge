/**
 * Redis connection resolution for in-VPC and external load tests (Task-00018).
 *
 * Implements strict precedence:
 * 1. Explicit CLI arguments (--redis-url, --redis-host, --redis-port) take precedence.
 * 2. REDIS_URL environment variable is used when supplied.
 * 3. Existing VPC hostname fallback (marvedge-redis... or REDIS_HOST) remains available where appropriate.
 */

export function formatRedisTarget(raw) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const parsed = new URL(raw);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function resolveLoadTestRedis(args = [], env = process.env) {
  function getArg(flag) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  }

  const cliRedisUrl = getArg("--redis-url");
  const cliRedisHost = getArg("--redis-host");
  const cliRedisPort = getArg("--redis-port");

  // 1. Explicit CLI arguments take highest precedence
  if (cliRedisUrl) {
    return {
      connection: {
        url: cliRedisUrl,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      displayTarget: formatRedisTarget(cliRedisUrl),
      source: "cli-url",
    };
  }

  if (cliRedisHost) {
    const port = Number.parseInt(cliRedisPort || env.REDIS_PORT || "6379", 10);
    return {
      connection: {
        host: cliRedisHost,
        port,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      displayTarget: `${cliRedisHost}:${port}`,
      source: "cli-host",
    };
  }

  // 2. REDIS_URL environment variable is used when supplied
  if (env.REDIS_URL && env.REDIS_URL.trim() !== "") {
    const envUrl = env.REDIS_URL.trim();
    return {
      connection: {
        url: envUrl,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      },
      displayTarget: formatRedisTarget(envUrl),
      source: "env-url",
    };
  }

  // 3. Existing VPC hostname fallback remains available where appropriate
  const fallbackHost = env.REDIS_HOST || "marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com";
  const fallbackPort = Number.parseInt(cliRedisPort || env.REDIS_PORT || "6379", 10);
  return {
    connection: {
      host: fallbackHost,
      port: fallbackPort,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    displayTarget: `${fallbackHost}:${fallbackPort}`,
    source: env.REDIS_HOST ? "env-host" : "default-fallback",
  };
}
