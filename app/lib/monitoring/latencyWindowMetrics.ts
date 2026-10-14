import type Redis from "ioredis";
import type { AlertPipeline } from "./alerts";

export type LatencyStatus = "success" | "failure";

const bucketDurationMs = 60_000;
const latencyObservationScript = `
redis.call("HINCRBY", KEYS[1], ARGV[1] .. "_count", 1)
redis.call("HINCRBYFLOAT", KEYS[1], ARGV[1] .. "_sum", ARGV[2])
redis.call("EXPIRE", KEYS[1], ARGV[3])
return 1
`;

function observationKey(pipeline: AlertPipeline, bucket: number): string {
  return `marvedge:monitoring:latency:v1:${pipeline}:${bucket}`;
}

export async function recordLatencyObservation(
  redis: Redis,
  pipeline: AlertPipeline,
  status: LatencyStatus,
  durationSeconds: number,
  timestampMs: number,
  windowSeconds: number
): Promise<void> {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError("Latency observation must be a finite non-negative duration");
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0 || windowSeconds % 60 !== 0) {
    throw new RangeError("Latency observation window must be a positive whole-minute value");
  }

  const bucket = Math.floor(timestampMs / bucketDurationMs);
  await redis.eval(
    latencyObservationScript,
    1,
    observationKey(pipeline, bucket),
    status,
    String(durationSeconds),
    String(windowSeconds + 120)
  );
}

export function recordLatencyObservationBestEffort(
  redis: Redis,
  pipeline: AlertPipeline,
  status: LatencyStatus,
  durationSeconds: number,
  windowSeconds: number
): void {
  void recordLatencyObservation(
    redis,
    pipeline,
    status,
    durationSeconds,
    Date.now(),
    windowSeconds
  ).catch((error: unknown) => {
    console.error(`[monitoring] Failed to record ${pipeline} latency observation:`, error);
  });
}

export async function collectLatencyWindowMeans(
  redis: Redis,
  windowSeconds: number,
  now: number = Date.now()
): Promise<Partial<Record<AlertPipeline, number>>> {
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0 || windowSeconds % 60 !== 0) {
    throw new RangeError("Latency observation window must be a positive whole-minute value");
  }

  const firstBucket = Math.floor((now - windowSeconds * 1000) / bucketDurationMs);
  const lastBucket = Math.floor(now / bucketDurationMs);
  const pipeline = redis.pipeline();
  const pipelines = ["reframe", "dubbing"] as const;
  const bucketCounts = new Map<AlertPipeline, number>();

  for (const name of pipelines) {
    let count = 0;
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      pipeline.hmget(
        observationKey(name, bucket),
        "success_count",
        "success_sum",
        "failure_count",
        "failure_sum"
      );
      count += 1;
    }
    bucketCounts.set(name, count);
  }

  try {
    const results = await pipeline.exec();
    if (!results) {
      throw new Error("Redis returned no latency metric results");
    }

    const means: Partial<Record<AlertPipeline, number>> = {};
    let resultIndex = 0;
    for (const name of pipelines) {
      let count = 0;
      let sum = 0;
      for (let index = 0; index < (bucketCounts.get(name) ?? 0); index += 1) {
        const result = results[resultIndex++];
        if (!result || result[0]) {
          throw result?.[0] ?? new Error("Redis returned an incomplete latency metric result");
        }

        const fields = result[1] as Array<string | null>;
        for (const [countValue, sumValue] of [
          [fields[0], fields[1]],
          [fields[2], fields[3]],
        ] as const) {
          const observedCount = Number(countValue ?? 0);
          const observedSum = Number(sumValue ?? 0);
          if (
            !Number.isSafeInteger(observedCount) ||
            observedCount < 0 ||
            !Number.isFinite(observedSum) ||
            observedSum < 0
          ) {
            throw new Error("Redis returned invalid latency metric values");
          }
          count += observedCount;
          sum += observedSum;
        }
      }

      if (count > 0) {
        means[name] = sum / count;
      }
    }
    return means;
  } catch (error) {
    console.error("[monitoring] Failed to collect latency window metrics:", error);
    return {};
  }
}
