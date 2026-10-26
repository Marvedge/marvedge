/**
 * Task-0102: Benchmark Pipeline Orchestrator
 * Coordinates per-stage and end-to-end benchmark execution, warmup separation,
 * concurrency, latency aggregation, throughput calculation, telemetry lifecycle, and cost accounting.
 */

import { performance } from "perf_hooks";
import { calculateStageCost, resolvePricingModel, aggregateCosts } from "./costCalculator";
import {
  executeAvsStage,
  executeCaptionsStage,
  executeDubbingStage,
  executeReframeStage,
  type StageExecutionOutput,
} from "./providers";
import { calculatePercentiles, TelemetryCollector } from "./telemetry";
import type {
  BenchmarkConfig,
  BenchmarkRunReport,
  EndToEndResult,
  InputMediaMetadata,
  PipelineStage,
  PricingModel,
  StageExecutionStatus,
  StageResult,
} from "./types";

export interface OrchestratorRunOptions {
  config: BenchmarkConfig;
  inputMedia: InputMediaMetadata;
}

export class BenchmarkOrchestrator {
  public readonly config: BenchmarkConfig;
  public readonly media: InputMediaMetadata;
  public readonly pricing: PricingModel;
  public readonly telemetryCollector: TelemetryCollector;

  constructor(options: OrchestratorRunOptions) {
    this.config = options.config;
    this.media = options.inputMedia;
    this.pricing = resolvePricingModel(this.config.gpuType, {
      computeHourlyRateUsd: this.config.hourlyRateUsd,
    });
    this.telemetryCollector = new TelemetryCollector({
      checkGpu: this.config.gpuType !== "none",
    });
  }

  public async runStage(stage: PipelineStage): Promise<StageResult> {
    const { concurrency, iterations, warmup } = this.config;
    const stageNotes: string[] = [];
    let detectedStatus: StageExecutionStatus = "fixture";
    let detectedProvider = "fixture";

    // 1. Warm-up Iterations (reported separately, not included in latency stats)
    const warmupStart = performance.now();
    for (let w = 0; w < warmup; w++) {
      try {
        await this.dispatchStageWork(stage);
      } catch {
        // Warmup errors recorded but ignored
      }
    }
    const warmupDurationMs = performance.now() - warmupStart;

    // 2. Measured Iterations
    const iterationLatenciesMs: number[] = [];
    let completedJobs = 0;
    let failedJobs = 0;
    let lastError: string | undefined;

    const measureStart = performance.now();

    // Execute in batches according to concurrency
    const totalJobs = Math.max(1, iterations);
    for (let i = 0; i < totalJobs; i += concurrency) {
      const batchSize = Math.min(concurrency, totalJobs - i);
      const batchPromises = Array.from({ length: batchSize }).map(async () => {
        const iterStart = performance.now();
        try {
          const out = await this.dispatchStageWork(stage);
          const iterDuration = performance.now() - iterStart;
          detectedStatus = out.status;
          detectedProvider = out.provider;
          if (out.notes) {
            for (const n of out.notes) {
              if (!stageNotes.includes(n)) {
                stageNotes.push(n);
              }
            }
          }
          if (out.status === "blocked") {
            failedJobs++;
            lastError = out.error || "Stage execution blocked";
          } else {
            completedJobs++;
            iterationLatenciesMs.push(iterDuration);
          }
        } catch (err: unknown) {
          failedJobs++;
          lastError = (err as Error).message || String(err);
        }
      });

      await Promise.allSettled(batchPromises);
    }

    const wallClockDurationMs = performance.now() - measureStart;
    const latencyMetrics = calculatePercentiles(iterationLatenciesMs);

    // Throughput: completed jobs per second of wall-clock duration
    const wallClockSec = Math.max(0.001, wallClockDurationMs / 1000);
    const throughputJobsPerSec = Number((completedJobs / wallClockSec).toFixed(3));

    // Realtime factor: media seconds processed per second of computation
    // For fixture modes, do not present in-memory speed as genuine inference performance!
    let realtimeFactor: number | null = null;
    let realtimeFactorLabel = "N/A (fixture)";

    if (
      (detectedStatus as string) === "real_inference" &&
      completedJobs > 0 &&
      latencyMetrics.meanMs > 0
    ) {
      realtimeFactor = Number((this.media.durationSec / (latencyMetrics.meanMs / 1000)).toFixed(2));
      realtimeFactorLabel = `${realtimeFactor}�`;
    } else if (detectedStatus === "fixture") {
      realtimeFactor = null;
      realtimeFactorLabel = "N/A (fixture)";
    } else if (detectedStatus === "blocked") {
      realtimeFactor = null;
      realtimeFactorLabel = "N/A (blocked)";
    }

    // Cost Breakdown with completedJobs scaling
    const cost = calculateStageCost({
      stage,
      status: detectedStatus,
      provider: detectedProvider,
      measuredDurationMs: wallClockDurationMs,
      mediaDurationSec: this.media.durationSec,
      completedJobs,
      pricing: this.pricing,
    });

    return {
      stage,
      status: detectedStatus,
      provider: detectedProvider,
      wallClockDurationMs: Number(wallClockDurationMs.toFixed(2)),
      warmupDurationMs: Number(warmupDurationMs.toFixed(2)),
      iterations: totalJobs,
      concurrency,
      latency: latencyMetrics,
      completedJobs,
      failedJobs,
      throughputJobsPerSec,
      realtimeFactor,
      realtimeFactorLabel,
      cost,
      notes: stageNotes,
      error: lastError,
    };
  }

  public async runEndToEnd(): Promise<EndToEndResult> {
    const { concurrency, iterations, warmup, stages } = this.config;
    const notes: string[] = [];

    // Warm-up
    const warmupStart = performance.now();
    for (let w = 0; w < warmup; w++) {
      for (const st of stages) {
        try {
          await this.dispatchStageWork(st);
        } catch {
          // Ignored
        }
      }
    }
    const warmupDurationMs = performance.now() - warmupStart;

    // Measured E2E
    const iterationLatenciesMs: number[] = [];
    let completedJobs = 0;
    let failedJobs = 0;
    let lastError: string | undefined;
    let overallStatus: StageExecutionStatus = "fixture";

    const measureStart = performance.now();
    const totalJobs = Math.max(1, iterations);

    for (let i = 0; i < totalJobs; i += concurrency) {
      const batchSize = Math.min(concurrency, totalJobs - i);
      const batchPromises = Array.from({ length: batchSize }).map(async () => {
        const iterStart = performance.now();
        let jobSuccess = true;

        for (const st of stages) {
          try {
            const out = await this.dispatchStageWork(st);
            if (out.status === "blocked") {
              jobSuccess = false;
              lastError = out.error || `${st} stage blocked`;
              break;
            }
            if (out.status === "real_inference") {
              overallStatus = "real_inference";
            }
          } catch (err: unknown) {
            jobSuccess = false;
            lastError = (err as Error).message || String(err);
            break;
          }
        }

        const iterDuration = performance.now() - iterStart;
        if (jobSuccess) {
          completedJobs++;
          iterationLatenciesMs.push(iterDuration);
        } else {
          failedJobs++;
        }
      });

      await Promise.allSettled(batchPromises);
    }

    const wallClockDurationMs = performance.now() - measureStart;
    const latencyMetrics = calculatePercentiles(iterationLatenciesMs);

    const wallClockSec = Math.max(0.001, wallClockDurationMs / 1000);
    const throughputJobsPerSec = Number((completedJobs / wallClockSec).toFixed(3));

    let realtimeFactor: number | null = null;
    let realtimeFactorLabel = "N/A (fixture)";

    if (
      (overallStatus as string) === "real_inference" &&
      completedJobs > 0 &&
      latencyMetrics.meanMs > 0
    ) {
      realtimeFactor = Number((this.media.durationSec / (latencyMetrics.meanMs / 1000)).toFixed(2));
      realtimeFactorLabel = `${realtimeFactor}�`;
    }

    const computeCost = (wallClockSec / 3600) * this.pricing.computeHourlyRateUsd;
    const mediaMinutes = this.media.durationSec / 60;
    let externalCost = 0;

    if ((overallStatus as string) === "real_inference" && completedJobs > 0) {
      const totalMediaMinutes = completedJobs * mediaMinutes;
      if (stages.includes("captions") && this.config.transcriptionProvider !== "fixture") {
        externalCost += totalMediaMinutes * this.pricing.transcriptionPerMinuteUsd;
      }
      if (stages.includes("dubbing") && this.config.dubbingProvider !== "fixture") {
        externalCost += totalMediaMinutes * this.pricing.dubbingPerMinuteUsd;
      }
    }

    const totalCost = computeCost + externalCost;
    const costPerCompletedJob =
      completedJobs > 0 ? Number((totalCost / completedJobs).toFixed(6)) : null;
    const costPerMinute =
      completedJobs > 0 && mediaMinutes > 0
        ? Number((totalCost / (completedJobs * mediaMinutes)).toFixed(6))
        : null;

    return {
      executed: true,
      status: overallStatus,
      wallClockDurationMs: Number(wallClockDurationMs.toFixed(2)),
      warmupDurationMs: Number(warmupDurationMs.toFixed(2)),
      iterations: totalJobs,
      concurrency,
      latency: latencyMetrics,
      completedJobs,
      failedJobs,
      throughputJobsPerSec,
      realtimeFactor,
      realtimeFactorLabel,
      cost: {
        measuredComputeDurationSec: Number(wallClockSec.toFixed(3)),
        computeCostUsd: Number(computeCost.toFixed(6)),
        externalApiCostUsd: Number(externalCost.toFixed(6)),
        totalCostUsd: Number(totalCost.toFixed(6)),
        costPerCompletedJobUsd: costPerCompletedJob,
        costPerMinuteUsd: costPerMinute,
      },
      notes,
      error: lastError,
    };
  }

  public async run(): Promise<BenchmarkRunReport> {
    try {
      this.telemetryCollector.start();
      const benchmarkStart = performance.now();

      const stageResults: Record<PipelineStage, StageResult | null> = {
        reframe: null,
        avs: null,
        captions: null,
        dubbing: null,
      };

      let totalWarmupMs = 0;

      for (const stage of this.config.stages) {
        const res = await this.runStage(stage);
        stageResults[stage] = res;
        totalWarmupMs += res.warmupDurationMs;
      }

      let endToEndResult: EndToEndResult | null = null;
      if (this.config.stages.length > 1) {
        endToEndResult = await this.runEndToEnd();
        totalWarmupMs += endToEndResult.warmupDurationMs;
      }

      const totalDurationMs = performance.now() - benchmarkStart;
      const hardwareTelemetry = this.telemetryCollector.getHardwareTelemetry();

      // Summary calculation
      const executedStages = Object.values(stageResults).filter(
        (r): r is StageResult => r !== null
      );
      const anyFailed = executedStages.some((r) => r.failedJobs > 0 || r.status === "blocked");
      const allFailed = executedStages.every((r) => r.failedJobs > 0 || r.status === "blocked");

      const overallStatus: "SUCCESS" | "PARTIAL" | "FAILED" = allFailed
        ? "FAILED"
        : anyFailed
          ? "PARTIAL"
          : "SUCCESS";

      // Aggregate costs across stages using completedJobs
      const maxCompletedJobs = Math.max(
        ...executedStages.map((s) => s.completedJobs),
        endToEndResult?.completedJobs || 0
      );
      const stageCosts = executedStages.map((s) => s.cost);
      const combinedCost = aggregateCosts(stageCosts, this.media.durationSec, maxCompletedJobs);

      const caveatsAndNotes: string[] = [
        `Pricing model: ${this.pricing.instanceType} ($${this.pricing.computeHourlyRateUsd}/hr) [Source: ${this.pricing.computeSource}]`,
        `Transcription provider: ${this.config.transcriptionProvider} ($${this.pricing.transcriptionPerMinuteUsd}/min)`,
        `Dubbing provider: ${this.config.dubbingProvider} ($${this.pricing.dubbingPerMinuteUsd}/min)`,
      ];

      if (hardwareTelemetry.gpu?.isAvailable === false) {
        caveatsAndNotes.push(
          "GPU is not available in current environment; measurements ran on CPU fallback."
        );
      }

      return {
        schemaVersion: "1.1.0",
        timestamp: new Date().toISOString(),
        totalDurationMs: Number(totalDurationMs.toFixed(2)),
        totalWarmupDurationMs: Number(totalWarmupMs.toFixed(2)),
        inputMedia: this.media,
        config: this.config,
        pricing: this.pricing,
        hardware: hardwareTelemetry,
        stages: stageResults,
        endToEnd: endToEndResult,
        summary: {
          totalCostUsd: combinedCost.totalCostUsd,
          costPerCompletedJobUsd: combinedCost.costPerCompletedJobUsd,
          totalCostPerMinuteUsd: combinedCost.costPerMinuteUsd,
          overallStatus,
          caveatsAndNotes,
        },
      };
    } finally {
      // Guaranteed telemetry timer cleanup on both success and error
      this.telemetryCollector.stop();
    }
  }

  private async dispatchStageWork(stage: PipelineStage): Promise<StageExecutionOutput> {
    switch (stage) {
      case "reframe":
        return executeReframeStage(this.media, this.config.reframeProvider || "fixture");
      case "avs":
        return executeAvsStage(this.media, this.config.avsProvider || "fixture");
      case "captions":
        return executeCaptionsStage(this.media, this.config.transcriptionProvider || "fixture");
      case "dubbing":
        return executeDubbingStage(this.media, this.config.dubbingProvider || "fixture");
      default:
        throw new Error(`Unknown stage: ${stage}`);
    }
  }
}
