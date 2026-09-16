// Configuration loader for the lightweight Reframe Worker (Task-00023).
//
// Reads and validates environment variables for BullMQ Redis, backend callback,
// and external ML inference service.
// Contains ZERO Prisma / Postgres imports.

export interface ReframeWorkerConfig {
  redisUrl: string;
  backendUrl: string;
  callbackSecret: string;
  mlServiceUrl: string;
  mlTimeoutMs: number;
  workerConcurrency: number;
  callbackMaxRetries: number;
  callbackRetryDelayMs: number;
}

export function getReframeWorkerConfig(): ReframeWorkerConfig {
  const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";

  const rawBackendUrl =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  const backendUrl = rawBackendUrl.replace(/\/+$/, "");

  const callbackSecret = process.env.CALLBACK_SECRET?.trim() || "";

  const rawMlUrl =
    process.env.REFRAME_ML_SERVICE_URL?.trim() || "http://localhost:8000";
  const mlServiceUrl = rawMlUrl.replace(/\/+$/, "");

  const parsedTimeout = Number.parseInt(
    process.env.REFRAME_ML_TIMEOUT_MS || "180000",
    10
  );
  const mlTimeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 180000;

  const parsedConcurrency = Number.parseInt(
    process.env.REFRAME_WORKER_CONCURRENCY || "1",
    10
  );
  const workerConcurrency =
    Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
      ? parsedConcurrency
      : 1;

  const parsedCallbackRetries = Number.parseInt(
    process.env.REFRAME_CALLBACK_MAX_RETRIES || "3",
    10
  );
  const callbackMaxRetries =
    Number.isFinite(parsedCallbackRetries) && parsedCallbackRetries >= 0
      ? parsedCallbackRetries
      : 3;

  const parsedCallbackDelay = Number.parseInt(
    process.env.REFRAME_CALLBACK_RETRY_DELAY_MS || "1000",
    10
  );
  const callbackRetryDelayMs =
    Number.isFinite(parsedCallbackDelay) && parsedCallbackDelay > 0
      ? parsedCallbackDelay
      : 1000;

  return {
    redisUrl,
    backendUrl,
    callbackSecret,
    mlServiceUrl,
    mlTimeoutMs,
    workerConcurrency,
    callbackMaxRetries,
    callbackRetryDelayMs,
  };
}
