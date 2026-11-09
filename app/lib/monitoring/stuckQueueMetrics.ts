import type { Queue, Job } from "bullmq";
import type { AlertPipeline } from "./alerts";

export interface StuckQueueJobSnapshot {
  id?: string;
  timestamp: number;
  processedOn?: number;
}

export type StuckQueueMetricSources = Partial<Record<AlertPipeline, Pick<Queue, "getJobs">>>;

/**
 * Inspect active and waiting jobs for a pipeline queue and compute the age in seconds
 * of the oldest unprocessed or active job.
 *
 * Rules:
 * - Idle / empty queues return 0 to prevent false alerts during normal inactivity.
 * - Delayed jobs (e.g. BullMQ backoff retries) are intentionally excluded because
 *   they are intentionally delayed for backoff, not stuck in starvation.
 * - Active jobs use processedOn (or timestamp if missing).
 * - Waiting jobs use timestamp.
 */
export async function calculateStuckQueueAgeSeconds(
  queue: Pick<Queue, "getJobs">,
  now: number = Date.now()
): Promise<number> {
  // Fetch active and waiting jobs only. Delayed, completed, failed, paused are excluded.
  const jobs = (await queue.getJobs(["active", "waiting"])) as Array<
    Pick<Job, "id" | "timestamp" | "processedOn">
  >;

  if (!jobs || jobs.length === 0) {
    return 0;
  }

  let maxAgeMs = 0;
  for (const job of jobs) {
    const startMs = job.processedOn ?? job.timestamp;
    if (typeof startMs === "number" && Number.isFinite(startMs) && startMs > 0) {
      const ageMs = now - startMs;
      if (ageMs > maxAgeMs) {
        maxAgeMs = ageMs;
      }
    }
  }

  return Math.max(0, Math.floor(maxAgeMs / 1000));
}

export async function collectStuckQueueMetrics(
  queues: StuckQueueMetricSources,
  now: number = Date.now()
): Promise<Partial<Record<AlertPipeline, number>>> {
  const pipelines = ["reframe", "dubbing"] as const;
  const results = await Promise.all(
    pipelines.map(async (pipeline) => {
      const queue = queues[pipeline];
      if (!queue) {
        return [pipeline, undefined] as const;
      }
      try {
        const ageSeconds = await calculateStuckQueueAgeSeconds(queue, now);
        return [pipeline, ageSeconds] as const;
      } catch (error) {
        console.error(`[monitoring] Failed to inspect stuck queue metrics for ${pipeline}:`, error);
        return [pipeline, undefined] as const;
      }
    })
  );

  return Object.fromEntries(
    results.filter((entry): entry is [(typeof entry)[0], number] => entry[1] !== undefined)
  );
}
