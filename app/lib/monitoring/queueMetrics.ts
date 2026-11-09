import type { Queue, JobType } from "bullmq";
import { queueDepth } from "./metrics";

export type MonitoredPipeline = "reframe" | "dubbing";

export type QueueMetricsSources = Record<MonitoredPipeline, Pick<Queue, "getJobCounts">>;

const queueStates: JobType[] = ["waiting", "active", "delayed", "failed"];

export async function collectQueueMetrics(
  queues: QueueMetricsSources
): Promise<Partial<Record<MonitoredPipeline, boolean>>> {
  const pipelines: MonitoredPipeline[] = ["reframe", "dubbing"];

  const results = await Promise.all(
    pipelines.map(async (pipeline) => {
      try {
        const counts = await queues[pipeline].getJobCounts(...queueStates);
        for (const state of queueStates) {
          queueDepth.set({ pipeline, state }, counts[state] ?? 0);
        }
        return [pipeline, true] as const;
      } catch (error) {
        console.error(`[monitoring] Failed to collect ${pipeline} queue metrics:`, error);
        return [pipeline, false] as const;
      }
    })
  );

  return Object.fromEntries(results);
}
