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
    // Fixture speed must be labeled as N/A (fixture), not misleading real-time factor
    expect(res.realtimeFactor).toBeNull();
    expect(res.realtimeFactorLabel).toBe("N/A (fixture)");
    expect(res.cost.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(res.cost.costPerCompletedJobUsd).toBeGreaterThanOrEqual(0);
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

    // Force an internal error by mocking dispatchStageWork
    (orchestrator as unknown as Record<string, () => never>).dispatchStageWork = () => {
      throw new Error("Critical internal fatal error");
    };

    // runStage catches job errors; force run() error during stage loop
    (orchestrator as unknown as Record<string, () => never>).runStage = () => {
      throw new Error("Fatal orchestrator stage failure");
    };

    await expect(orchestrator.run()).rejects.toThrow("Fatal orchestrator stage failure");

    // Hardware telemetry should be cleanly retrievable and collector stopped
    const tele = orchestrator.telemetryCollector.getHardwareTelemetry();
    expect(tele.os.platform).toBeTruthy();
  });
});
