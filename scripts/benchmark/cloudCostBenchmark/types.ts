/**
 * Task-00127: Cloud Cost Benchmark Schema & Types (v1.2.0)
 * Defines data structures for telemetry, hardware provenance, multi-cloud cost calculation,
 * stage execution, and reporting.
 */

export type PipelineStage = "reframe" | "avs" | "captions" | "dubbing";

export type StageExecutionStatus =
  | "real_inference"
  | "fixture"
  | "cpu_fallback"
  | "skipped"
  | "blocked";

export type CloudProvider = "aws" | "gcp" | "azure" | "local" | "unknown";
export type PricingTier = "ondemand" | "spot" | "standard";

export type HardwareVerificationStatus =
  | "verified_hardware"
  | "fixture_simulation"
  | "partially_verified"
  | "unknown";

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

export interface HardwareProvenance {
  containerized: boolean;
  executionEnvironment: "container" | "bare-metal";
  cloudProvider: CloudProvider;
  instanceType: string;
  pricingTier: PricingTier;
  verificationStatus: HardwareVerificationStatus;
  cpuModel: string;
  cpuCores: number;
  memoryTotalBytes: number;
  gpuModel: string | null;
  gpuMemoryTotalBytes: number | null;
  gpuAvailable: boolean;
  osPlatform: string;
  architecture: string;
  nodeVersion: string;
  pythonVersion: string | null;
  cudaVersion: string | null;
  gpuDriverVersion: string | null;
  dockerVersion: string | null;
  benchmarkTimestamp: string;
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
  cloudProvider?: CloudProvider;
  pricingTier?: PricingTier;
  pricingDate?: string;
  regionalLimitation?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outputArtifacts?: Record<string, any>;
}

export interface BenchmarkConfig {
  inputVideoPath?: string;
  stages: PipelineStage[];
  concurrency: number;
  iterations: number;
  warmup: number;
  gpuType: "L4" | "T4" | "custom" | "none" | "CPU" | string;
  cloudProvider?: CloudProvider;
  pricingTier?: PricingTier;
  hourlyRateUsd?: number;
  reframeProvider?: "fixture" | "autoflip";
  avsProvider?: "fixture" | "talknet";
  transcriptionProvider: "fixture" | "whisper" | "groq";
  dubbingProvider: "fixture" | "elevenlabs" | "voicestudio";
  voiceStudioUrl?: string;
  voiceStudioApiKey?: string;
  voiceStudioModel?: string;
  voiceStudioFallbackToPaid?: boolean;
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
  schemaVersion: "1.1.0" | "1.2.0";
  timestamp: string;
  totalDurationMs: number;
  totalWarmupDurationMs: number;
  inputMedia: InputMediaMetadata;
  config: BenchmarkConfig;
  pricing: PricingModel;
  hardware: HardwareTelemetry;
  provenance?: HardwareProvenance;
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
