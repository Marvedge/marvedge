import type Redis from "ioredis";

const bucketDurationMs = 60_000;
const IDENTIFIER_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Atomic Lua script to record cost/usage observation into a minute bucket.
 * KEYS[1]: bucket key (marvedge:monitoring:cost:v1:${category}:${provider}:${unit}:${bucket})
 * ARGV[1]: amount to increment (string float)
 * ARGV[2]: bucket TTL in seconds
 * ARGV[3]: idempotency key (or empty string if none)
 * ARGV[4]: idempotency key TTL in seconds
 *
 * Returns 1 if recorded, or 0 if duplicate suppressed via idempotency key.
 */
const costObservationScript = `
if ARGV[3] ~= "" then
  local idemKey = "marvedge:monitoring:cost:v1:idem:" .. ARGV[3]
  local wasSet = redis.call("SET", idemKey, "1", "EX", tonumber(ARGV[4]), "NX")
  if not wasSet then
    return 0
  end
end
redis.call("HINCRBY", KEYS[1], "count", 1)
redis.call("HINCRBYFLOAT", KEYS[1], "sum", ARGV[1])
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
return 1
`;

export interface CostObservationFilter {
  category: string;
  provider: string;
  unit: string;
}

export interface CostObservationInput extends CostObservationFilter {
  amount: number;
  windowSeconds: number;
  timestampMs?: number;
  idempotencyKey?: string;
  idempotencyTtlSeconds?: number;
}

function validateIdentifier(name: string, value: string): void {
  if (typeof value !== "string" || !value.trim() || !IDENTIFIER_PATTERN.test(value.trim())) {
    throw new TypeError(
      `Cost observation ${name} must be a non-empty alphanumeric string matching /^[a-z0-9_-]+$/`
    );
  }
}

export function costObservationKey(
  category: string,
  provider: string,
  unit: string,
  bucket: number
): string {
  return `marvedge:monitoring:cost:v1:${category}:${provider}:${unit}:${bucket}`;
}

export function formatMetricKey(category: string, provider: string, unit: string): string {
  return `${category}:${provider}:${unit}`;
}

/**
 * Record a cost or usage observation into the Redis rolling-window buckets.
 *
 * Idempotency & Exactly-Once Lifecycle Limitations:
 * - If `idempotencyKey` is provided, an atomic Redis SET NX ensures duplicate recordings
 *   with the same key are ignored within `idempotencyTtlSeconds`.
 * - Limitation 1 (Memory Eviction & Expiry): If Redis evicts keys under memory pressure,
 *   or if a callback retries after `idempotencyTtlSeconds` expires, the usage may be recorded again.
 * - Limitation 2 (Job Retries vs Redundant Callbacks): If a BullMQ job retries after failing halfway,
 *   and each retry consumed real GPU/vendor resources, keying by `jobId` alone will suppress the retry's
 *   usage (undercounting actual spend), whereas keying by `${jobId}:${attempt}` accounts for real
 *   retried compute while still deduplicating duplicate callbacks of the same attempt.
 * - Exactly-once cost accounting cannot be guaranteed across network partitions or external vendor
 *   retries without end-to-end distributed transaction logs; this provides robust best-effort deduplication.
 */
export async function recordCostObservation(
  redis: Redis,
  input: CostObservationInput
): Promise<boolean> {
  validateIdentifier("category", input.category);
  validateIdentifier("provider", input.provider);
  validateIdentifier("unit", input.unit);

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new RangeError("Cost observation amount must be a finite non-negative number");
  }

  if (
    !Number.isSafeInteger(input.windowSeconds) ||
    input.windowSeconds <= 0 ||
    input.windowSeconds % 60 !== 0
  ) {
    throw new RangeError("Cost observation window must be a positive whole-minute value");
  }

  const timestampMs = input.timestampMs ?? Date.now();
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new RangeError("Cost observation timestamp must be a finite non-negative number");
  }

  const bucket = Math.floor(timestampMs / bucketDurationMs);
  const bucketKey = costObservationKey(
    input.category.trim(),
    input.provider.trim(),
    input.unit.trim(),
    bucket
  );

  const bucketTtlSeconds = Math.max(input.windowSeconds + 300, 3600);
  const rawIdemKey = input.idempotencyKey?.trim() ?? "";
  const idemKey = rawIdemKey
    ? `${input.category.trim()}:${input.provider.trim()}:${input.unit.trim()}:${rawIdemKey}`
    : "";
  const idemTtlSeconds = input.idempotencyTtlSeconds ?? Math.max(input.windowSeconds + 300, 86400);

  const result = await redis.eval(
    costObservationScript,
    1,
    bucketKey,
    String(input.amount),
    String(bucketTtlSeconds),
    idemKey,
    String(idemTtlSeconds)
  );

  return result === 1;
}

/**
 * Non-throwing helper to record cost observations from background workers or callbacks.
 * Catches any Redis error so monitoring failures never disrupt video processing pipelines.
 */
export function recordCostObservationBestEffort(
  redis: Redis,
  input: CostObservationInput
): void {
  void recordCostObservation(redis, input).catch((error: unknown) => {
    console.error(
      `[monitoring] Failed to record cost observation for ${input.category}/${input.provider}:`,
      error
    );
  });
}

/**
 * Collect accumulated cost/usage for a given metric across a rolling time window.
 */
export async function collectCostWindowSum(
  redis: Redis,
  metric: CostObservationFilter,
  windowSeconds: number,
  now: number = Date.now()
): Promise<number> {
  const sums = await collectCostWindowSums(redis, [metric], windowSeconds, now);
  const key = formatMetricKey(metric.category, metric.provider, metric.unit);
  return sums[key] ?? 0;
}

/**
 * Batch-collect accumulated sums for multiple cost metrics in a single Redis pipeline.
 */
export async function collectCostWindowSums(
  redis: Redis,
  metrics: CostObservationFilter[],
  windowSeconds: number,
  now: number = Date.now()
): Promise<Record<string, number>> {
  if (
    !Number.isSafeInteger(windowSeconds) ||
    windowSeconds <= 0 ||
    windowSeconds % 60 !== 0
  ) {
    throw new RangeError("Cost observation window must be a positive whole-minute value");
  }

  if (metrics.length === 0) {
    return {};
  }

  for (const m of metrics) {
    validateIdentifier("category", m.category);
    validateIdentifier("provider", m.provider);
    validateIdentifier("unit", m.unit);
  }

  const firstBucket = Math.floor((now - windowSeconds * 1000) / bucketDurationMs);
  const lastBucket = Math.floor(now / bucketDurationMs);
  const pipeline = redis.pipeline();
  const bucketCounts = new Map<string, number>();

  for (const m of metrics) {
    const metricKey = formatMetricKey(m.category, m.provider, m.unit);
    let count = 0;
    for (let b = firstBucket; b <= lastBucket; b += 1) {
      pipeline.hmget(costObservationKey(m.category, m.provider, m.unit, b), "sum", "count");
      count += 1;
    }
    bucketCounts.set(metricKey, count);
  }

  try {
    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Redis returned no cost metric results");
    }

    const totals: Record<string, number> = {};
    let resultIndex = 0;

    for (const m of metrics) {
      const metricKey = formatMetricKey(m.category, m.provider, m.unit);
      let metricSum = 0;
      const count = bucketCounts.get(metricKey) ?? 0;

      for (let i = 0; i < count; i += 1) {
        const result = results[resultIndex++];
        if (!result || result[0]) {
          throw result?.[0] ?? new Error("Redis returned an incomplete cost metric result");
        }

        const fields = result[1] as Array<string | null>;
        const sumVal = Number(fields[0] ?? 0);
        if (!Number.isFinite(sumVal) || sumVal < 0) {
          throw new Error("Redis returned invalid cost metric values");
        }
        metricSum += sumVal;
      }

      totals[metricKey] = metricSum;
    }

    return totals;
  } catch (error) {
    console.error("[monitoring] Failed to collect cost window metrics:", error);
    return {};
  }
}
