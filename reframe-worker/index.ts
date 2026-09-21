// Standalone entry point for the lightweight Reframe Worker (Task-00023).
//
// Consumes the BullMQ "reframe-processing" queue, communicates with the stateless
// ML inference service, and sends authenticated results to /api/jobs/callback.
//
// Contains ZERO Prisma / Postgres imports.
// Pure HTTP boundary - no child_process execution.

import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import { getReframeWorkerConfig, loadReframeWorkerEnv } from "./config";
import { processReframeJob, type ReframeJobContext } from "./orchestrator";

// Load environment variables (.env.local, .env) following Next.js precedence
loadReframeWorkerEnv();

const config = getReframeWorkerConfig();

console.log("📐 Starting lightweight Reframe Worker (Task-00023)...");
console.log(`📡 Backend URL: ${config.backendUrl}`);
console.log(`🤖 ML Service URL: ${config.mlServiceUrl}`);
console.log(`🔑 Callback Secret configured: ${config.callbackSecret ? "yes" : "no"}`);
console.log(`☁️  Cloudinary configured: ${process.env.CLOUDINARY_API_KEY ? "yes" : "no"}`);
console.log(`⚙️  Concurrency: ${config.workerConcurrency}`);

const redisConnection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

const worker = new Worker<ReframeJobPayload>(
  "reframe-processing",
  async (job: Job<ReframeJobPayload>) => {
    const context: ReframeJobContext = {
      jobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
    };
    return await processReframeJob(job.data, context);
  },
  {
    connection: redisConnection as any,
    concurrency: config.workerConcurrency,
  }
);

worker.on("completed", (job) => {
  console.log(`[reframe-worker] BullMQ Job completed: ${job.id} (data.jobId=${job.data?.jobId})`);
});

worker.on("failed", (job, err) => {
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
    console.log("[reframe-worker] Shutdown complete.");
    process.exit(0);
  } catch (err) {
    console.error("[reframe-worker] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
