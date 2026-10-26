/**
 * Task-0102: Cloud Cost Benchmark Schema & Types
 * Defines data structures for telemetry, cost calculation, stage execution, and reports.
 */

export type PipelineStage = "reframe" | "avs" | "captions" | "dubbing";

export type StageExecutionStatus =
  | "real_inference"
  | "fixture"
  | "cpu_fallback"
  | "skipped"
  | "blocked";

export interface CpuTelemetry {
  model: string;
  cores: number;
  avgUtilizationPct: number | null;
  peakUtilizationPct: number | null;
}

export interface MemoryTelemetry {
  totalBytes: number;
  freeBytes: number;
  processPeakRssBytes: number;
  processAvgRssBytes: number;
}

export interface GpuTelemetry {
  isAvailable: boolean;
  modelName: string | null;
  driverVersion: string | null;
  cudaVersion: string | null;
  totalVramMib: number | null;
  peakVramUsedMib: number | null;
  avgVramUsedMib: number | null;
  avgGpuUtilPct: number | null;
  peakGpuUtilPct: number | null;
  maxTempC: number | null;
  samplingError?: string | null;
}

export interface HardwareTelemetry {
  os: {
    platform: string;
    arch: string;
    release: string;
  };
  runtime: {
    nodeVersion: string;
    v8Version: string;
  };
  cpu: CpuTelemetry;
  memory: MemoryTelemetry;
  gpu: GpuTelemetry | null;
}

export interface LatencyMetrics {
  count: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  stdDevMs: number;
  rawLatenciesMs: number[];
}

export interface StageCostBreakdown {
  measuredComputeDurationSec: number;
  computeCostUsd: number;
  externalApiCostUsd: number;
  totalCostUsd: number;
  costPerCompletedJobUsd: number | null;
  costPerMinuteUsd: number | null;
}

export interface PricingModel {
  instanceType: string;
  computeHourlyRateUsd: number;
  computeSource: string;
  computeIsAssumption: boolean;
  transcriptionPerMinuteUsd: number;
  transcriptionSource: string;
  transcriptionIsAssumption: boolean;
  dubbingPerMinuteUsd: number;
  dubbingSource: string;
  dubbingIsAssumption: boolean;
}

export interface StageResult {
  stage: PipelineStage;
  status: StageExecutionStatus;
  provider: string;
  wallClockDurationMs: number;
  warmupDurationMs: number;
  iterations: number;
  concurrency: number;
  latency: LatencyMetrics;
  completedJobs: number;
  failedJobs: number;
  throughputJobsPerSec: number;
  realtimeFactor: number | null;
  realtimeFactorLabel: string;
  cost: StageCostBreakdown;
  notes?: string[];
  error?: string;
}

export interface BenchmarkConfig {
  inputVideoPath?: string;
  stages: PipelineStage[];
  concurrency: number;
  iterations: number;
  warmup: number;
  gpuType: "L4" | "T4" | "custom" | "none" | "CPU";
  hourlyRateUsd?: number;
  reframeProvider?: "fixture" | "autoflip";
  avsProvider?: "fixture" | "talknet";
  transcriptionProvider: "fixture" | "whisper" | "groq";
  dubbingProvider: "fixture" | "elevenlabs";
  outputJsonPath?: string;
  outputMarkdownPath?: string;
  verbose?: boolean;
}

export interface InputMediaMetadata {
  path: string;
  durationSec: number;
  fileSizeBytes: number;
  isSynthetic: boolean;
}

export interface EndToEndResult {
  executed: boolean;
  status: StageExecutionStatus;
  wallClockDurationMs: number;
  warmupDurationMs: number;
  iterations: number;
  concurrency: number;
  latency: LatencyMetrics;
  completedJobs: number;
  failedJobs: number;
  throughputJobsPerSec: number;
  realtimeFactor: number | null;
  realtimeFactorLabel: string;
  cost: StageCostBreakdown;
  notes?: string[];
  error?: string;
}

export interface BenchmarkRunReport {
  schemaVersion: "1.1.0";
  timestamp: string;
  totalDurationMs: number;
  totalWarmupDurationMs: number;
  inputMedia: InputMediaMetadata;
  config: BenchmarkConfig;
  pricing: PricingModel;
  hardware: HardwareTelemetry;
  stages: Record<PipelineStage, StageResult | null>;
  endToEnd: EndToEndResult | null;
  summary: {
    totalCostUsd: number;
    costPerCompletedJobUsd: number | null;
    totalCostPerMinuteUsd: number | null;
    overallStatus: "SUCCESS" | "PARTIAL" | "FAILED";
    caveatsAndNotes: string[];
  };
}
