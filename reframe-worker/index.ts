// Standalone entry point for the lightweight Reframe Worker (Task-00023).
//
// Consumes the BullMQ "reframe-processing" queue, communicates with the stateless
// ML inference service, and sends authenticated results to /api/jobs/callback.
//
// Contains ZERO Prisma / Postgres imports.
// Pure HTTP boundary - no child_process execution.

import { Worker, Job, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import { jobsTotal } from "../app/lib/monitoring/metrics";
import {
  getJobOutcomeMetricsMaxDataPoints,
  getJobOutcomeMetricsObservationWindowSeconds,
} from "../app/lib/monitoring/jobOutcomeMetrics";
import { recordLatencyObservationBestEffort } from "../app/lib/monitoring/latencyWindowMetrics";
import { createWorkerMonitoringRedis } from "../app/lib/monitoring/workerRedis";
import { getReframeWorkerConfig, loadReframeWorkerEnv } from "./config";
import { isFinalReframeJobFailure } from "./jobMetrics";
import { processReframeJob, type ReframeJobContext } from "./orchestrator";

// Load environment variables (.env.local, .env) following Next.js precedence
loadReframeWorkerEnv();

const config = getReframeWorkerConfig();
const jobOutcomeMetricsMaxDataPoints = getJobOutcomeMetricsMaxDataPoints();
const latencyObservationWindowSeconds = getJobOutcomeMetricsObservationWindowSeconds(process.env);
if (jobOutcomeMetricsMaxDataPoints === undefined) {
  console.warn(
    "[reframe-worker] Failure-rate history is disabled; configure MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS as a whole-minute value."
  );
}

console.log("📐 Starting lightweight Reframe Worker (Task-00023)...");
console.log(`📡 Backend URL: ${config.backendUrl}`);
console.log(`🤖 ML Service URL: ${config.mlServiceUrl}`);
console.log(`🔑 Callback Secret configured: ${config.callbackSecret ? "yes" : "no"}`);
console.log(`☁️  Cloudinary configured: ${process.env.CLOUDINARY_API_KEY ? "yes" : "no"}`);
console.log(`⚙️  Concurrency: ${config.workerConcurrency}`);

const discardedJobs = new WeakSet<Job<ReframeJobPayload>>();

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});
const monitoringRedisConnection = createWorkerMonitoringRedis(config.redisUrl);

const worker = new Worker<ReframeJobPayload>(
  "reframe-processing",
  async (job: Job<ReframeJobPayload>) => {
    const context: ReframeJobContext = {
      jobId: typeof job.data?.jobId === "string" ? job.data.jobId : "",
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      discardJob: async () => {
        await job.discard();
        discardedJobs.add(job);
      },
      recordInferenceDuration: (status, durationSeconds) => {
        if (latencyObservationWindowSeconds !== undefined) {
          recordLatencyObservationBestEffort(
            monitoringRedisConnection,
            "reframe",
            status,
            durationSeconds,
            latencyObservationWindowSeconds
          );
        }
      },
    };
    return await processReframeJob(job.data, context);
  },
  {
    connection: redisConnection as unknown as ConnectionOptions,
    concurrency: config.workerConcurrency,
    metrics:
      jobOutcomeMetricsMaxDataPoints === undefined
        ? undefined
        : { maxDataPoints: jobOutcomeMetricsMaxDataPoints },
  }
);

worker.on("completed", (job) => {
  jobsTotal.inc({ pipeline: "reframe", status: "completed" });
  console.log(`[reframe-worker] BullMQ Job completed: ${job.id} (data.jobId=${job.data?.jobId})`);
});

worker.on("failed", (job, err) => {
  if (job && isFinalReframeJobFailure(job, err, discardedJobs.has(job))) {
    jobsTotal.inc({ pipeline: "reframe", status: "failed" });
  }
  if (job) {
    discardedJobs.delete(job);
  }
  console.error(
    `[reframe-worker] BullMQ Job failed: ${job?.id} (data.jobId=${job?.data?.jobId}, attemptsMade=${job?.attemptsMade}): ${err.message}`
  );
});

worker.on("error", (err) => {
  console.error("[reframe-worker] Worker error:", err);
});

// Graceful shutdown handling
async function shutdown(signal: string) {
  console.log(`[reframe-worker] Received ${signal}, closing worker gracefully...`);
  try {
    await worker.close();
    await redisConnection.quit();
    monitoringRedisConnection.disconnect();
    console.log("[reframe-worker] Shutdown complete.");
    process.exit(0);
  } catch (err) {
    monitoringRedisConnection.disconnect();
    console.error("[reframe-worker] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
