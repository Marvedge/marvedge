import { loadEnvConfig } from "@next/env";
import {
  getMonitoringAlertEvaluationIntervalMs,
  startMonitoringAlertLoop,
} from "../app/lib/monitoring/alertLoop";
import { evaluateMonitoringAlerts, loadMonitoringAlertConfig } from "../app/lib/monitoring/alerts";
import { collectLatencyWindowMeans } from "../app/lib/monitoring/latencyWindowMetrics";
import { collectQueueMetrics } from "../app/lib/monitoring/queueMetrics";
import { Queue, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  let intervalMs: number;
  let alertConfig: ReturnType<typeof loadMonitoringAlertConfig>;
  try {
    intervalMs = getMonitoringAlertEvaluationIntervalMs();
    alertConfig = loadMonitoringAlertConfig();
  } catch (error) {
    console.error(
      "[monitoring] Invalid alert configuration; evaluator was not started:",
      error instanceof Error ? error.message : "Unknown configuration error"
    );
    process.exitCode = 1;
    return;
  }

  const redis = new Redis(process.env.REDIS_URL?.trim() || "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    commandTimeout: 5000,
  });
  redis.on("error", () => {
    console.error("[monitoring] Redis connection emitted an error.");
  });
  const queues = {
    reframe: new Queue("reframe-processing", {
      connection: redis as unknown as ConnectionOptions,
    }),
    dubbing: new Queue("dubbing-processing", {
      connection: redis as unknown as ConnectionOptions,
    }),
  };
  const allQueues = [queues.reframe, queues.dubbing];
  for (const queue of allQueues) {
    queue.on("error", () => {
      console.error("[monitoring] BullMQ queue emitted an error.");
    });
  }

  const loop = startMonitoringAlertLoop(intervalMs, async () => {
    const queueDepthAvailability = await collectQueueMetrics(queues);
    const latencyWindowMeans = await collectLatencyWindowMeans(
      redis,
      alertConfig.failureRateObservationWindowSeconds
    );
    await evaluateMonitoringAlerts({
      config: alertConfig,
      failureRateQueues: queues,
      latencyWindowMeans,
      queueDepthAvailability,
    });
  });

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    console.info(`[monitoring] Received ${signal}; stopping alert evaluation.`);
    shutdownPromise = (async () => {
      await loop.stop();
      const closeResults = await Promise.allSettled(allQueues.map((queue) => queue.close()));
      const redisCloseResult = await Promise.allSettled([redis.quit()]);
      if (redisCloseResult[0].status === "rejected") {
        redis.disconnect();
      }
      if (
        closeResults.some((result) => result.status === "rejected") ||
        redisCloseResult.some((result) => result.status === "rejected")
      ) {
        console.error("[monitoring] One or more monitoring resources failed to close cleanly.");
        process.exitCode = 1;
      }
      console.info("[monitoring] Alert evaluation shut down.");
    })();
    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error: unknown) => {
  console.error("[monitoring] Failed to start alert evaluation:", error);
  process.exitCode = 1;
});
