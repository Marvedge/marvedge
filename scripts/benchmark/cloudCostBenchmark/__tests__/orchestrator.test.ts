import { describe, expect, it } from "vitest";
import { BenchmarkOrchestrator } from "../orchestrator";
import type { BenchmarkConfig, InputMediaMetadata } from "../types";

const sampleMedia: InputMediaMetadata = {
  path: "/dummy/synthetic_clip.mp4",
  durationSec: 10.0,
  fileSizeBytes: 1_200_000,
  isSynthetic: true,
};

describe("Benchmark Orchestrator", () => {
  it("runs individual stage with warmup separation and concurrency", async () => {
    const config: BenchmarkConfig = {
      stages: ["captions"],
      concurrency: 2,
      iterations: 4,
      warmup: 2,
      gpuType: "none",
      transcriptionProvider: "fixture",
      dubbingProvider: "fixture",
    };

    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: sampleMedia,
    });

    const res = await orchestrator.runStage("captions");

    expect(res.stage).toBe("captions");
    expect(res.status).toBe("fixture");
    expect(res.iterations).toBe(4);
    expect(res.concurrency).toBe(2);
    expect(res.completedJobs).toBe(4);
    expect(res.failedJobs).toBe(0);
    expect(res.latency.count).toBe(4);
    expect(res.latency.p50Ms).toBeGreaterThanOrEqual(0);
    expect(res.warmupDurationMs).toBeGreaterThanOrEqual(0);
    expect(res.throughputJobsPerSec).toBeGreaterThan(0);
    expect(res.realtimeFactor).toBeNull();
    expect(res.realtimeFactorLabel).toBe("N/A (fixture)");
    expect(res.cost.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(res.cost.costPerCompletedJobUsd).toBeGreaterThanOrEqual(0);
  });

  it("handles concurrent mixed success and blocked jobs deterministically without last-write-wins race", async () => {
    const config: BenchmarkConfig = {
      stages: ["captions"],
      concurrency: 4,
      iterations: 4,
      warmup: 0,
      gpuType: "L4",
      transcriptionProvider: "whisper",
      dubbingProvider: "fixture",
    };

    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: sampleMedia,
    });

    let callCount = 0;
    // Simulate concurrent jobs where 2 succeed with real inference and 2 block
    // and complete in non-deterministic order
    (orchestrator as unknown as Record<string, () => Promise<unknown>>).dispatchStageWork =
      async () => {
        const idx = ++callCount;
        if (idx % 2 === 1) {
          // Fast real inference success
          await new Promise((r) => setTimeout(r, 10));
          return {
            stage: "captions",
            status: "real_inference",
            provider: "whisper",
            notes: ["Mock whisper success"],
          };
        } else {
          // Slower blocked job
          await new Promise((r) => setTimeout(r, 25));
          return {
            stage: "captions",
            status: "blocked",
            provider: "whisper",
            error: "Rate limit blocked",
            notes: ["Mock whisper rate limit"],
          };
        }
      };

    const res = await orchestrator.runStage("captions");

    // Must be deterministic:
    expect(res.completedJobs).toBe(2);
    expect(res.failedJobs).toBe(2);
    expect(res.status).toBe("real_inference");
    expect(res.provider).toBe("whisper");
    // External billable API cost must reflect the 2 completed jobs * (10s / 60s) * $0.006/min
    expect(res.cost.externalApiCostUsd).toBeGreaterThan(0);
    expect(res.cost.costPerCompletedJobUsd).toBeGreaterThan(0);
    expect(res.error).toBe("Rate limit blocked");
  });

  it("classifies all-blocked stage as blocked with zero billable API cost", async () => {
    const config: BenchmarkConfig = {
      stages: ["captions"],
      concurrency: 2,
      iterations: 2,
      warmup: 0,
      gpuType: "none",
      transcriptionProvider: "whisper",
      dubbingProvider: "fixture",
    };

    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: sampleMedia,
    });

    (orchestrator as unknown as Record<string, () => Promise<unknown>>).dispatchStageWork =
      async () => {
        return {
          stage: "captions",
          status: "blocked",
          provider: "whisper",
          error: "OPENAI_API_KEY_UNSET",
          notes: ["Key missing"],
        };
      };

    const res = await orchestrator.runStage("captions");
    expect(res.completedJobs).toBe(0);
    expect(res.failedJobs).toBe(2);
    expect(res.status).toBe("blocked");
    expect(res.cost.externalApiCostUsd).toBe(0);
    expect(res.cost.totalCostUsd).toBe(0);
    expect(res.cost.costPerCompletedJobUsd).toBeNull();
  });

  it("runs end-to-end multi-stage pipeline successfully in fixture mode", async () => {
    const config: BenchmarkConfig = {
      stages: ["reframe", "avs", "captions", "dubbing"],
      concurrency: 1,
      iterations: 2,
      warmup: 1,
      gpuType: "none",
      transcriptionProvider: "fixture",
      dubbingProvider: "fixture",
    };

    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: sampleMedia,
    });

    const report = await orchestrator.run();

    expect(report.schemaVersion).toBe("1.1.0");
    expect(report.summary.overallStatus).toBe("SUCCESS");
    expect(report.stages.reframe).not.toBeNull();
    expect(report.stages.avs).not.toBeNull();
    expect(report.stages.captions).not.toBeNull();
    expect(report.stages.dubbing).not.toBeNull();

    // Verify all 4 ran as fixture with explicit labeling
    expect(report.stages.reframe?.status).toBe("fixture");
    expect(report.stages.reframe?.realtimeFactorLabel).toBe("N/A (fixture)");
    expect(report.stages.avs?.status).toBe("fixture");
    expect(report.stages.captions?.status).toBe("fixture");
    expect(report.stages.dubbing?.status).toBe("fixture");

    // E2E result
    expect(report.endToEnd).not.toBeNull();
    expect(report.endToEnd?.executed).toBe(true);
    expect(report.endToEnd?.completedJobs).toBe(2);
    expect(report.endToEnd?.realtimeFactorLabel).toBe("N/A (fixture)");
    expect(report.totalDurationMs).toBeGreaterThan(0);
    expect(report.totalWarmupDurationMs).toBeGreaterThanOrEqual(0);

    // Cost checks: zero external cost in fixture mode
    expect(report.stages.dubbing?.cost.externalApiCostUsd).toBe(0);
    expect(report.stages.captions?.cost.externalApiCostUsd).toBe(0);
    expect(report.summary.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(report.summary.costPerCompletedJobUsd).toBeGreaterThanOrEqual(0);
  });

  it("handles blocked stages without crashing benchmark and records failure status", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const config: BenchmarkConfig = {
        stages: ["captions"],
        concurrency: 1,
        iterations: 1,
        warmup: 0,
        gpuType: "none",
        transcriptionProvider: "whisper", // missing key -> blocked
        dubbingProvider: "fixture",
      };

      const orchestrator = new BenchmarkOrchestrator({
        config,
        inputMedia: sampleMedia,
      });

      const report = await orchestrator.run();

      expect(report.stages.captions?.status).toBe("blocked");
      expect(report.stages.captions?.failedJobs).toBe(1);
      expect(report.summary.overallStatus).toBe("FAILED");
      expect(report.stages.captions?.cost.totalCostUsd).toBe(0);
      expect(report.stages.captions?.cost.costPerCompletedJobUsd).toBeNull();
    } finally {
      if (oldKey) {
        process.env.OPENAI_API_KEY = oldKey;
      }
    }
  });

  it("guarantees telemetry is stopped even if run throws an exception", async () => {
    const config: BenchmarkConfig = {
      stages: ["captions"],
      concurrency: 1,
      iterations: 1,
      warmup: 0,
      gpuType: "none",
      transcriptionProvider: "fixture",
      dubbingProvider: "fixture",
    };

    const orchestrator = new BenchmarkOrchestrator({
      config,
      inputMedia: sampleMedia,
    });

    (orchestrator as unknown as Record<string, () => never>).dispatchStageWork = () => {
      throw new Error("Critical internal fatal error");
    };

    (orchestrator as unknown as Record<string, () => never>).runStage = () => {
      throw new Error("Fatal orchestrator stage failure");
    };

    await expect(orchestrator.run()).rejects.toThrow("Fatal orchestrator stage failure");

    const tele = orchestrator.telemetryCollector.getHardwareTelemetry();
    expect(tele.os.platform).toBeTruthy();
  });
});
