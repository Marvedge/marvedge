#!/usr/bin/env node
/**
 * In-VPC Bounded Concurrent Load Test & Degradation Runner (Task-00095).
 *
 * Designed to execute on the AWS EC2 worker host inside the private VPC.
 * Measures real GPU latency, throughput, queue drain rate, and verifies
 * graceful degradation under concurrency levels 1 (baseline) and 4 (peak).
 *
 * Safety controls:
 * - Strict timeout watchdog (default 120s per run)
 * - Safe concurrency bounds (1 or 4)
 * - Dedicated in-VPC loopback callback listener (port 3001)
 * - Clean BullMQ connection lifecycle management
 * - Zero external API mutations
 */

import http from "node:http";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { buildCallbackRecord } from "./callbackRecord.mjs";
import { Queue } from "bullmq";

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}

const concurrency = Number.parseInt(getArg("--concurrency", "1"), 10);
const totalJobs = Number.parseInt(getArg("--total-jobs", String(concurrency)), 10);
const faultInjection = getArg("--fault-injection", "none");
const timeoutSec = Number.parseInt(getArg("--timeout-sec", "120"), 10);
const videoUrl = getArg(
  "--video-url",
  process.env.TEST_VIDEO_URL || "https://marvedge-raw-ap2.s3.ap-southeast-2.amazonaws.com/test/1.mp4"
);
const redisHost = getArg(
  "--redis-host",
  process.env.REDIS_HOST || "marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com"
);
const redisPort = Number.parseInt(getArg("--redis-port", process.env.REDIS_PORT || "6379"), 10);
const outputPath = getArg("--output-json", "/tmp/in_vpc_load_test_results.json");
const callbackPort = Number.parseInt(getArg("--callback-port", "3001"), 10);
// The reframe-worker must be configured to send callbacks to this harness.
// Pass the same URL via --worker-callback-url so operator intent is explicit
// and auditable in logs. The worker itself is configured separately via
// BACKEND_URL + ALLOW_LOCALHOST_CALLBACK_IN_PRODUCTION=true (for production).
// This flag does NOT modify the worker; it only records the expected URL.
const workerCallbackUrl = getArg(
  "--worker-callback-url",
  process.env.BACKEND_URL || ""
);
const queueName = getArg("--queue-name", process.env.REFRAME_QUEUE_NAME || "reframe-benchmark-queue");

console.log("=============================================================================");
console.log(" MARVEDGE IN-VPC BOUNDED LOAD TEST RUNNER (Task-00095)");
console.log("=============================================================================");
console.log(`Concurrency Level:   ${concurrency}`);
console.log(`Total Jobs:          ${totalJobs}`);
console.log(`Fault Injection:     ${faultInjection}`);
console.log(`Watchdog Timeout:    ${timeoutSec}s`);
console.log(`Redis Host:          ${redisHost}:${redisPort}`);
console.log(`Video URL:           ${videoUrl.slice(0, 60)}...`);
console.log(`Output Path:         ${outputPath}`);
console.log(`Queue Name:          ${queueName}`);
console.log(`Callback Listener:   http://127.0.0.1:${callbackPort}`);
console.log(`Worker Callback URL: ${workerCallbackUrl || "(not set - configure BACKEND_URL on the worker)"}`);

if (!workerCallbackUrl) {
  console.warn("[WARN] --worker-callback-url is not set. The reframe-worker must be configured:");
  console.warn(`  BACKEND_URL=http://127.0.0.1:${callbackPort}`);
  console.warn("  ALLOW_LOCALHOST_CALLBACK_IN_PRODUCTION=true  # required if NODE_ENV=production");
  console.warn("  Without this, the worker sends callbacks to the wrong address and all");
  console.warn("  jobs will appear as TIMEOUT_NO_CALLBACK in this harness.");
}
console.log("=============================================================================");

if (queueName === "reframe-processing") {
  console.error(`[CRITICAL ERROR] Target queue is set to production queue "reframe-processing"! Benchmark is isolated and must not produce or consume production jobs.`);
  process.exit(1);
}

if (concurrency !== 1 && concurrency !== 4) {
  console.error(`[ERROR] Concurrency must be 1 (baseline) or 4 (peak). Received: ${concurrency}`);
  process.exit(1);
}

let peakGpuMemoryMb = 0;
let peakGpuUtilization = 0;

function sampleGpuMetrics() {
  try {
    const out = execSync(
      "nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits 2>/dev/null",
      { encoding: "utf8", timeout: 1000 }
    ).trim();
    const [utilStr, memStr] = out.split(",").map((s) => s.trim());
    const util = Number.parseFloat(utilStr) || 0;
    const mem = Number.parseFloat(memStr) || 0;
    if (util > peakGpuUtilization) peakGpuUtilization = util;
    if (mem > peakGpuMemoryMb) peakGpuMemoryMb = mem;
  } catch {
    // Non-GPU fallback
  }
}

const callbackRecords = new Map();
let server;

async function startCallbackListener() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const jobId = parsed.jobId || parsed.id;
          if (jobId) {
            callbackRecords.set(jobId, buildCallbackRecord(parsed));
            console.log(`[CALLBACK] Job ${jobId} confirmed: status=${parsed.status}, fallback=${parsed.fallback}`);
          }
        } catch {
          // Non-JSON callback
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      });
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[WARN] Callback port ${callbackPort} already in use. Assuming external listener active.`);
        resolve(false);
      } else {
        console.error(`[ERROR] Callback listener failed: ${err.message}`);
        resolve(false);
      }
    });

    server.listen(callbackPort, "127.0.0.1", () => {
      console.log(`[READY] Local callback receiver listening on http://127.0.0.1:${callbackPort}`);
      resolve(true);
    });
  });
}

function calculatePercentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function run() {
  await startCallbackListener();

  const queue = new Queue(queueName, {
    connection: { host: redisHost, port: redisPort },
  });

  const testRunId = `task95-invpc-${Date.now()}`;
  const jobLatencies = [];
  const jobResults = [];
  const submittedJobIds = [];

  const gpuInterval = setInterval(sampleGpuMetrics, 500);

  console.log(`\n[ENQUEUE] Enqueuing ${totalJobs} jobs into "${queueName}"...`);
  const runStartTime = Date.now();

  for (let i = 1; i <= totalJobs; i++) {
    const jobId = `${testRunId}-job-${String(i).padStart(3, "0")}`;
    submittedJobIds.push(jobId);

    let jobVideoUrl = videoUrl;
    let targetRatio = "9:16";
    if (faultInjection === "invalid_url") {
      jobVideoUrl = "https://marvedge-raw-ap2.s3.ap-southeast-2.amazonaws.com/non-existent-video.mp4";
    }

    const payload = {
      jobId,
      videoUrl: jobVideoUrl,
      targetAspectRatio: targetRatio,
      source: { width: 1280, height: 720, fps: 25, durationSec: 8.04 },
      testFaultMode: faultInjection !== "none" ? faultInjection : undefined,
    };

    await queue.add("reframe", payload, {
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    });
    console.log(` -> Enqueued job ${i}/${totalJobs}: ${jobId}`);
  }

  console.log(`[WAIT] Monitoring execution (watchdog limit: ${timeoutSec}s)...`);

  const deadline = Date.now() + timeoutSec * 1000;
  let allDone = false;

  while (Date.now() < deadline) {
    sampleGpuMetrics();

    const completedCount = submittedJobIds.filter((id) => callbackRecords.has(id)).length;
    if (completedCount >= totalJobs) {
      allDone = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  clearInterval(gpuInterval);
  sampleGpuMetrics();

  const runEndTime = Date.now();
  const totalElapsedMs = runEndTime - runStartTime;

  let completedCount = 0;
  let failedCount = 0;
  let fallbackCount = 0;

  for (const id of submittedJobIds) {
    const record = callbackRecords.get(id);
    if (record) {
      completedCount++;
      const latency = record.timestamp - runStartTime;
      jobLatencies.push(latency);
      if (record.fallback) fallbackCount++;
      jobResults.push({
        jobId: id,
        status: record.status,
        latencyMs: latency,
        fallback: record.fallback,
        fallbackReason: record.fallbackReason,
      });
    } else {
      failedCount++;
      jobResults.push({
        jobId: id,
        status: "TIMEOUT_NO_CALLBACK",
        latencyMs: totalElapsedMs,
        fallback: false,
        fallbackReason: "TIMEOUT",
      });
    }
  }

  const p50 = calculatePercentile(jobLatencies, 50);
  const p95 = calculatePercentile(jobLatencies, 95);
  const max = jobLatencies.length > 0 ? Math.max(...jobLatencies) : 0;
  const throughput = totalElapsedMs > 0 ? Number(((completedCount / totalElapsedMs) * 1000).toFixed(2)) : 0;

  const summary = {
    testRunId,
    timestamp: new Date().toISOString(),
    concurrency,
    totalJobs,
    completed: completedCount,
    failed: failedCount,
    fallbacks: fallbackCount,
    faultInjection,
    totalElapsedMs,
    throughputJobsSec: throughput,
    latencyMs: { p50, p95, max },
    gpu: {
      peakUtilizationPercent: peakGpuUtilization,
      peakMemoryUsedMb: peakGpuMemoryMb,
    },
    jobs: jobResults,
  };

  console.log("\n=============================================================================");
  console.log(" TEST EXECUTION SUMMARY");
  console.log("=============================================================================");
  console.log(`Status:              ${allDone ? "SUCCESS" : "TIMEOUT_EXPIRED"}`);
  console.log(`Completed / Total:   ${completedCount} / ${totalJobs}`);
  console.log(`Failed / Fallbacks:  ${failedCount} / ${fallbackCount}`);
  console.log(`Total Elapsed Time:  ${totalElapsedMs} ms`);
  console.log(`Throughput:          ${throughput} jobs/sec`);
  console.log(`Latency P50 / P95:   ${p50} ms / ${p95} ms (Max: ${max} ms)`);
  console.log(`Peak GPU Memory:     ${peakGpuMemoryMb} MB (Util: ${peakGpuUtilization}%)`);
  console.log("=============================================================================");

  try {
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`[SAVED] Benchmark results written to ${outputPath}`);
  } catch (err) {
    console.error(`[WARN] Could not write output JSON: ${err.message}`);
  }

  await queue.close();
  if (server && server.listening) {
    await new Promise((r) => server.close(r));
  }

  if (!allDone || failedCount > 0) {
    console.error(`[EXIT] Run finished with ${failedCount} failure(s) or timed out.`);
    process.exit(1);
  } else {
    console.log(`[EXIT] Run completed successfully.`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("[FATAL] In-VPC load test aborted:", err);
  process.exit(1);
});
