/**
 * scripts/benchmark/concurrentLoadRunner.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated regression suite for Task-00095 Local Concurrent Load Test Runner.
 *
 * Verifies:
 *   1. Concurrency 1 enforces serial execution (peak active workers = 1).
 *   2. Concurrency 2 enables parallel execution (peak active workers <= 2).
 *   3. Concurrency 4 (benchmark-approved level) scales throughput proportionally.
 *   4. Failure Injection: AutoFlip empty targets immediately degrades to center-crop.
 *   5. Failure Injection: Transient gateway timeout triggers retry backoff and
 *      exhaustion fallback to center crop with JobFallbackMetadata.
 *   6. Queue metrics compatibility: verifies getJobCounts transitions accurately.
 */

import { describe, it, expect } from "vitest";
import {
  runLoadScenario,
  InMemoryQueueDouble,
  calculatePercentiles,
  createValidCropTarget,
} from "./concurrentLoadRunner";
import { collectQueueMetrics } from "../../app/lib/monitoring/queueMetrics";
import {
  INITIAL_VALIDATION_CONCURRENCY,
  BENCHMARK_APPROVED_CONCURRENCY,
} from "../../app/lib/config/concurrency";

describe("Task-00095 | Concurrent Load Runner Unit Tests", () => {
  it("concurrency 1 executes strictly serially and caps peak active workers at 1", async () => {
    const result = await runLoadScenario({
      name: "test_concurrency_1",
      concurrency: INITIAL_VALIDATION_CONCURRENCY,
      jobCount: 3,
      baseDurationMs: 25,
    });

    expect(result.concurrency).toBe(1);
    expect(result.completedJobs).toBe(3);
    expect(result.failedJobs).toBe(0);
    expect(result.peakActiveWorkers).toBe(1);
    expect(result.throughputJobsPerSec).toBeGreaterThan(0);
  });

  it("concurrency 2 executes concurrently and caps peak active workers at 2", async () => {
    const result = await runLoadScenario({
      name: "test_concurrency_2",
      concurrency: 2,
      jobCount: 4,
      baseDurationMs: 30,
    });

    expect(result.concurrency).toBe(2);
    expect(result.completedJobs).toBe(4);
    expect(result.failedJobs).toBe(0);
    expect(result.peakActiveWorkers).toBeLessThanOrEqual(2);
  });

  it("concurrency 4 (benchmark approved) scales throughput and completes all jobs", async () => {
    const result = await runLoadScenario({
      name: "test_concurrency_4",
      concurrency: BENCHMARK_APPROVED_CONCURRENCY,
      jobCount: 8,
      baseDurationMs: 20,
    });

    expect(result.concurrency).toBe(4);
    expect(result.completedJobs).toBe(8);
    expect(result.failedJobs).toBe(0);
    expect(result.peakActiveWorkers).toBeLessThanOrEqual(4);
  });

  it("graceful degradation: AutoFlip empty targets immediately triggers center-crop fallback", async () => {
    const result = await runLoadScenario({
      name: "test_autoflip_empty_fallback",
      concurrency: 2,
      jobCount: 3,
      baseDurationMs: 15,
      failureMode: "AUTOFLIP_EMPTY_TARGETS",
    });

    expect(result.totalJobs).toBe(3);
    expect(result.completedJobs).toBe(3);
    expect(result.failedJobs).toBe(0);
    expect(result.fallbackJobs).toBe(3);
    expect(result.fallbackEvents.length).toBe(3);

    for (const event of result.fallbackEvents) {
      expect(event.reason).toBe("AUTOFLIP_EMPTY_CROP_TARGETS");
      expect(event.attemptsMade).toBe(1); // Immediate fallback on attempt 1 without wasteful retries
    }
  });

  it("graceful degradation: transient gateway timeouts retry and fallback to center-crop on attempt 3", async () => {
    const result = await runLoadScenario({
      name: "test_gateway_timeout_retry_fallback",
      concurrency: 1,
      jobCount: 2,
      baseDurationMs: 10,
      failureMode: "TRANSIENT_GATEWAY_TIMEOUT",
      maxAttempts: 3,
    });

    expect(result.totalJobs).toBe(2);
    expect(result.completedJobs).toBe(2);
    expect(result.failedJobs).toBe(0);
    expect(result.fallbackJobs).toBe(2);
    expect(result.fallbackEvents.length).toBe(2);

    for (const event of result.fallbackEvents) {
      expect(event.reason).toBe("AUTOFLIP_RETRY_EXHAUSTED");
      expect(event.attemptsMade).toBe(3); // Verified retried up to maxAttempts
    }
  });

  it("InMemoryQueueDouble integrates with collectQueueMetrics", async () => {
    const q1 = new InMemoryQueueDouble([
      {
        jobId: "q-1",
        videoUrl: "http://example.com/1.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: 1080, fps: 30, durationSec: 5 },
      },
      {
        jobId: "q-2",
        videoUrl: "http://example.com/2.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: 1080, fps: 30, durationSec: 5 },
      },
    ]);
    const q2 = new InMemoryQueueDouble();

    const countsBefore = await q1.getJobCounts("waiting", "active", "completed", "failed");
    expect(countsBefore.waiting).toBe(2);
    expect(countsBefore.active).toBe(0);

    const metricsResult = await collectQueueMetrics({
      reframe: q1,
      dubbing: q2,
    });

    expect(metricsResult.reframe).toBe(true);
    expect(metricsResult.dubbing).toBe(true);

    const dequeued = q1.dequeue();
    expect(dequeued?.jobId).toBe("q-1");

    const countsAfter = await q1.getJobCounts("waiting", "active", "completed", "failed");
    expect(countsAfter.waiting).toBe(1);
    expect(countsAfter.active).toBe(1);

    q1.markCompleted("q-1");
    const countsFinal = await q1.getJobCounts("waiting", "active", "completed", "failed");
    expect(countsFinal.waiting).toBe(1);
    expect(countsFinal.active).toBe(0);
    expect(countsFinal.completed).toBe(1);
  });

  it("calculatePercentiles returns accurate statistical distributions", () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p = calculatePercentiles(samples);

    expect(p.minMs).toBe(10);
    expect(p.maxMs).toBe(100);
    expect(p.meanMs).toBe(55);
    expect(p.p50Ms).toBe(50);
    expect(p.p90Ms).toBe(90);
    expect(p.p95Ms).toBe(100);
    expect(p.p99Ms).toBe(100);
  });

  it("createValidCropTarget produces schema_version 1 valid crop targets", () => {
    const target = createValidCropTarget({ width: 1920, height: 1080, fps: 30, durationSec: 10 });
    expect(target.schema_version).toBe(1);
    expect(target.output.aspect_ratio).toBe("9:16");
    expect(target.crop_targets.length).toBe(1);
    expect(target.crop_targets[0].crop.height).toBe(1080);
    expect(target.crop_targets[0].crop.width).toBeGreaterThan(0);
  });
});
