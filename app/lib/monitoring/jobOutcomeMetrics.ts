import type { Queue } from "bullmq";
import type { FailureRateWindowCounts } from "./alerts";

export type JobOutcomeMetricsSources = Record<"reframe" | "dubbing", Pick<Queue, "getMetrics">>;

export function getJobOutcomeMetricsObservationWindowSeconds(
  environment: Readonly<Record<string, string | undefined>>
): number | undefined {
  const rawValue = environment.MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS?.trim();
  if (!rawValue) {
    return undefined;
  }

  const windowSeconds = Number(rawValue);
  return Number.isInteger(windowSeconds) && windowSeconds > 0 && windowSeconds % 60 === 0
    ? windowSeconds
    : undefined;
}

export function getJobOutcomeMetricsMaxDataPoints(
  environment: Readonly<Record<string, string | undefined>> = process.env
): number | undefined {
  const windowSeconds = getJobOutcomeMetricsObservationWindowSeconds(environment);
  if (windowSeconds === undefined) {
    return undefined;
  }

  return windowSeconds / 60 + 1;
}

async function readWindowCount(
  queue: Pick<Queue, "getMetrics">,
  type: "completed" | "failed",
  requiredPoints: number,
  windowSeconds: number,
  now: number
): Promise<number | undefined> {
  const snapshot = await queue.getMetrics(type, 0, requiredPoints - 1);

  if (snapshot.meta.prevTS === 0) {
    return 0;
  }

  const ageMs = now - snapshot.meta.prevTS;
  if (ageMs > (windowSeconds + 60) * 1000) {
    return 0;
  }
  if (ageMs < -60_000 || snapshot.count < requiredPoints || snapshot.data.length < requiredPoints) {
    return undefined;
  }

  const windowCount = snapshot.data.slice(0, requiredPoints).reduce((total, count) => {
    return Number.isFinite(count) && count >= 0 ? total + count : total;
  }, 0);
  return windowCount;
}

export async function collectJobOutcomeWindowCounts(
  queues: JobOutcomeMetricsSources,
  windowSeconds: number,
  now: number = Date.now()
): Promise<Partial<Record<"reframe" | "dubbing", FailureRateWindowCounts>>> {
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0 || windowSeconds % 60 !== 0) {
    throw new RangeError("Failure-rate observation window must be a positive whole-minute value");
  }

  const requiredPoints = windowSeconds / 60;
  const pipelines = ["reframe", "dubbing"] as const;
  const results = await Promise.all(
    pipelines.map(async (pipeline) => {
      try {
        const [completed, failed] = await Promise.all([
          readWindowCount(queues[pipeline], "completed", requiredPoints, windowSeconds, now),
          readWindowCount(queues[pipeline], "failed", requiredPoints, windowSeconds, now),
        ]);
        if (completed === undefined || failed === undefined) {
          return [pipeline, undefined] as const;
        }

        return [pipeline, { completed, failed, windowSeconds }] as const;
      } catch (error) {
        console.error(`[monitoring] Failed to collect ${pipeline} job outcome metrics:`, error);
        return [pipeline, undefined] as const;
      }
    })
  );

  return Object.fromEntries(
    results.filter((result): result is [(typeof result)[0], FailureRateWindowCounts] => {
      return result[1] !== undefined;
    })
  );
}
