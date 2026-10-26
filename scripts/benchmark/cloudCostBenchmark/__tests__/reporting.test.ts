import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { generateJsonReport, generateMarkdownReport, writeReports } from "../reporting";
import type { BenchmarkRunReport } from "../types";

const mockReport: BenchmarkRunReport = {
  schemaVersion: "1.1.0",
  timestamp: "2026-10-23T18:00:00.000Z",
  totalDurationMs: 12500,
  totalWarmupDurationMs: 2500,
  inputMedia: {
    path: "/test/sample_media.mp4",
    durationSec: 30,
    fileSizeBytes: 4_500_000,
    isSynthetic: true,
  },
  config: {
    stages: ["reframe", "captions"],
    concurrency: 1,
    iterations: 2,
    warmup: 1,
    gpuType: "L4",
    transcriptionProvider: "fixture",
    dubbingProvider: "fixture",
  },
  pricing: {
    instanceType: "Cloud Run NVIDIA L4 (24GB)",
    computeHourlyRateUsd: 0.8,
    computeSource: "docs/GPU_COST_CONCURRENCY.md",
    computeIsAssumption: false,
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "Whisper tier",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "Elevenlabs tier",
    dubbingIsAssumption: true,
  },
  hardware: {
    os: { platform: "win32", arch: "x64", release: "10.0.22631" },
    runtime: { nodeVersion: "v24.13.1", v8Version: "13.0" },
    cpu: {
      model: "Intel Core i7",
      cores: 8,
      avgUtilizationPct: 15.2,
      peakUtilizationPct: 45.1,
    },
    memory: {
      totalBytes: 16_000_000_000,
      freeBytes: 6_000_000_000,
      processAvgRssBytes: 150_000_000,
      processPeakRssBytes: 180_000_000,
    },
    gpu: {
      isAvailable: false,
      modelName: null,
      driverVersion: null,
      cudaVersion: null,
      totalVramMib: null,
      peakVramUsedMib: null,
      avgVramUsedMib: null,
      avgGpuUtilPct: null,
      peakGpuUtilPct: null,
      maxTempC: null,
    },
  },
  stages: {
    reframe: {
      stage: "reframe",
      status: "fixture",
      provider: "fixture",
      wallClockDurationMs: 6000,
      warmupDurationMs: 1500,
      iterations: 2,
      concurrency: 1,
      latency: {
        count: 2,
        p50Ms: 3000,
        p95Ms: 3000,
        minMs: 2950,
        maxMs: 3050,
        meanMs: 3000,
        stdDevMs: 50,
        rawLatenciesMs: [2950, 3050],
      },
      completedJobs: 2,
      failedJobs: 0,
      throughputJobsPerSec: 0.333,
      realtimeFactor: null,
      realtimeFactorLabel: "N/A (fixture)",
      cost: {
        measuredComputeDurationSec: 6.0,
        computeCostUsd: 0.001333,
        externalApiCostUsd: 0,
        totalCostUsd: 0.001333,
        costPerCompletedJobUsd: 0.000667,
        costPerMinuteUsd: 0.001333,
      },
    },
    avs: null,
    captions: {
      stage: "captions",
      status: "fixture",
      provider: "fixture",
      wallClockDurationMs: 4000,
      warmupDurationMs: 1000,
      iterations: 2,
      concurrency: 1,
      latency: {
        count: 2,
        p50Ms: 2000,
        p95Ms: 2000,
        minMs: 1950,
        maxMs: 2050,
        meanMs: 2000,
        stdDevMs: 50,
        rawLatenciesMs: [1950, 2050],
      },
      completedJobs: 2,
      failedJobs: 0,
      throughputJobsPerSec: 0.5,
      realtimeFactor: null,
      realtimeFactorLabel: "N/A (fixture)",
      cost: {
        measuredComputeDurationSec: 4.0,
        computeCostUsd: 0.000888,
        externalApiCostUsd: 0,
        totalCostUsd: 0.000888,
        costPerCompletedJobUsd: 0.000444,
        costPerMinuteUsd: 0.000888,
      },
    },
    dubbing: null,
  },
  endToEnd: null,
  summary: {
    totalCostUsd: 0.002221,
    costPerCompletedJobUsd: 0.001111,
    totalCostPerMinuteUsd: 0.002221,
    overallStatus: "SUCCESS",
    caveatsAndNotes: ["Benchmark ran under simulated fixture mode."],
  },
};

describe("Benchmark Reporting", () => {
  it("generates valid JSON with schema 1.1.0", () => {
    const jsonStr = generateJsonReport(mockReport);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.schemaVersion).toBe("1.1.0");
    expect(parsed.summary.overallStatus).toBe("SUCCESS");
    expect(parsed.stages.reframe.status).toBe("fixture");
    expect(parsed.stages.reframe.realtimeFactorLabel).toBe("N/A (fixture)");
    expect(parsed.summary.costPerCompletedJobUsd).toBe(0.001111);
  });

  it("generates comprehensive Markdown report with required sections and fixture labels", () => {
    const md = generateMarkdownReport(mockReport);
    expect(md).toContain("# Cloud Cost Benchmark Report � Task-0102");
    expect(md).toContain("## 1. Executive Summary");
    expect(md).toContain("Cost per Completed Job");
    expect(md).toContain("N/A (fixture)");
    expect(md).toContain("## 2. Hardware & Environment Telemetry");
    expect(md).toContain("## 3. Stage-Level Performance & Latency");
    expect(md).toContain("## 4. Cost Accounting Breakdown");
    expect(md).toContain("Pricing Assumptions Applied");
    expect(md).toContain("Cloud Run NVIDIA L4 (24GB)");
    expect(md).toContain("$0.002221 USD");
  });

  it("writes reports to disk cleanly", () => {
    const tmpDir = path.join(os.tmpdir(), "report-test-" + Date.now());
    const jsonPath = path.join(tmpDir, "report.json");
    const mdPath = path.join(tmpDir, "report.md");

    const out = writeReports(mockReport, jsonPath, mdPath);

    expect(out.jsonWrittenTo).toBe(jsonPath);
    expect(out.markdownWrittenTo).toBe(mdPath);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
