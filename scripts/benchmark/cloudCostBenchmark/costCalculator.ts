/**
 * Task-0102: Cost Accounting Engine
 * Calculates compute infrastructure costs and external provider API costs
 * with configurable rates, transparent assumptions, multi-iteration scaling,
 * and division-by-zero protection.
 */

import type { PricingModel, StageCostBreakdown, StageExecutionStatus } from "./types";

export interface PricingOverrides {
  instanceType?: string;
  computeHourlyRateUsd?: number;
  transcriptionPerMinuteUsd?: number;
  dubbingPerMinuteUsd?: number;
}

/**
 * Standard baseline pricing configurations referenced in docs/GPU_COST_CONCURRENCY.md
 */
export const DEFAULT_PRICING_MODELS: Record<string, PricingModel> = {
  L4: {
    instanceType: "Cloud Run NVIDIA L4 (24GB)",
    computeHourlyRateUsd: 0.8,
    computeSource: "docs/GPU_COST_CONCURRENCY.md (Google Cloud Run Q3 2026)",
    computeIsAssumption: false,
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  T4: {
    instanceType: "Cloud Run NVIDIA T4 (16GB)",
    computeHourlyRateUsd: 0.35,
    computeSource: "docs/GPU_COST_CONCURRENCY.md (Google Cloud Run Q3 2026)",
    computeIsAssumption: false,
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  CPU: {
    instanceType: "Cloud Run 4 vCPU / 16GB RAM",
    computeHourlyRateUsd: 0.09,
    computeSource: "Cloud Run general compute rate assumption",
    computeIsAssumption: true,
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
};

export function resolvePricingModel(
  gpuType: "L4" | "T4" | "custom" | "none" | "CPU",
  overrides?: PricingOverrides
): PricingModel {
  let baseKey = "CPU";
  if (gpuType === "L4") {
    baseKey = "L4";
  } else if (gpuType === "T4") {
    baseKey = "T4";
  }

  const base = DEFAULT_PRICING_MODELS[baseKey] || DEFAULT_PRICING_MODELS.CPU;

  return {
    instanceType: overrides?.instanceType ?? base.instanceType,
    computeHourlyRateUsd:
      overrides?.computeHourlyRateUsd !== undefined
        ? overrides.computeHourlyRateUsd
        : base.computeHourlyRateUsd,
    computeSource:
      overrides?.computeHourlyRateUsd !== undefined
        ? "Explicit user CLI/config override"
        : base.computeSource,
    computeIsAssumption:
      overrides?.computeHourlyRateUsd !== undefined ? false : base.computeIsAssumption,

    transcriptionPerMinuteUsd:
      overrides?.transcriptionPerMinuteUsd !== undefined
        ? overrides.transcriptionPerMinuteUsd
        : base.transcriptionPerMinuteUsd,
    transcriptionSource:
      overrides?.transcriptionPerMinuteUsd !== undefined
        ? "Explicit user CLI/config override"
        : base.transcriptionSource,
    transcriptionIsAssumption:
      overrides?.transcriptionPerMinuteUsd !== undefined ? false : base.transcriptionIsAssumption,

    dubbingPerMinuteUsd:
      overrides?.dubbingPerMinuteUsd !== undefined
        ? overrides.dubbingPerMinuteUsd
        : base.dubbingPerMinuteUsd,
    dubbingSource:
      overrides?.dubbingPerMinuteUsd !== undefined
        ? "Explicit user CLI/config override"
        : base.dubbingSource,
    dubbingIsAssumption:
      overrides?.dubbingPerMinuteUsd !== undefined ? false : base.dubbingIsAssumption,
  };
}

export interface CalculateStageCostOptions {
  stage: "reframe" | "avs" | "captions" | "dubbing";
  status: StageExecutionStatus;
  provider: string;
  measuredDurationMs: number;
  mediaDurationSec: number;
  completedJobs: number;
  pricing: PricingModel;
}

export function calculateStageCost(options: CalculateStageCostOptions): StageCostBreakdown {
  const { stage, status, provider, measuredDurationMs, mediaDurationSec, completedJobs, pricing } =
    options;

  const durationSec = Math.max(0, measuredDurationMs / 1000);
  const mediaMinutes = Math.max(0, mediaDurationSec / 60);
  const validJobs = Math.max(0, completedJobs);

  // 1. Measured Compute Cost
  // For skipped or blocked stages where no work ran, compute cost is strictly 0
  const computeCost =
    status === "skipped" || status === "blocked"
      ? 0
      : (durationSec / 3600) * pricing.computeHourlyRateUsd;

  // 2. External Provider API Cost
  // In fixture mode or CPU fallback without external calls, external spend is strictly 0!
  // In real inference mode, billable quantity scales with completed jobs * media duration
  let externalCost = 0;
  if (status === "real_inference" && validJobs > 0) {
    const totalMediaMinutes = validJobs * mediaMinutes;
    if (stage === "captions" && provider !== "fixture") {
      externalCost = totalMediaMinutes * pricing.transcriptionPerMinuteUsd;
    } else if (stage === "dubbing" && provider !== "fixture" && provider !== "voicestudio") {
      externalCost = totalMediaMinutes * pricing.dubbingPerMinuteUsd;
    }
  }

  const totalCost = computeCost + externalCost;

  // 3. Normalized Per-Job and Per-Minute Metrics
  // Avoid inflating cost per minute when running N iterations:
  // costPerCompletedJob = totalCost / completedJobs
  // costPerMinute = costPerCompletedJob / mediaMinutes = totalCost / (completedJobs * mediaMinutes)
  const costPerCompletedJob = validJobs > 0 ? Number((totalCost / validJobs).toFixed(6)) : null;

  const costPerMinute =
    validJobs > 0 && mediaMinutes > 0
      ? Number((totalCost / (validJobs * mediaMinutes)).toFixed(6))
      : null;

  return {
    measuredComputeDurationSec: Number(durationSec.toFixed(3)),
    computeCostUsd: Number(computeCost.toFixed(6)),
    externalApiCostUsd: Number(externalCost.toFixed(6)),
    totalCostUsd: Number(totalCost.toFixed(6)),
    costPerCompletedJobUsd: costPerCompletedJob,
    costPerMinuteUsd: costPerMinute,
  };
}

export function aggregateCosts(
  costs: StageCostBreakdown[],
  mediaDurationSec: number,
  completedJobs: number
): StageCostBreakdown {
  let totalCompute = 0;
  let totalExternal = 0;
  let totalDurationSec = 0;

  for (const c of costs) {
    totalCompute += c.computeCostUsd;
    totalExternal += c.externalApiCostUsd;
    totalDurationSec += c.measuredComputeDurationSec;
  }

  const totalCost = totalCompute + totalExternal;
  const mediaMinutes = Math.max(0, mediaDurationSec / 60);
  const validJobs = Math.max(0, completedJobs);

  const costPerCompletedJob = validJobs > 0 ? Number((totalCost / validJobs).toFixed(6)) : null;

  const costPerMinute =
    validJobs > 0 && mediaMinutes > 0
      ? Number((totalCost / (validJobs * mediaMinutes)).toFixed(6))
      : null;

  return {
    measuredComputeDurationSec: Number(totalDurationSec.toFixed(3)),
    computeCostUsd: Number(totalCompute.toFixed(6)),
    externalApiCostUsd: Number(totalExternal.toFixed(6)),
    totalCostUsd: Number(totalCost.toFixed(6)),
    costPerCompletedJobUsd: costPerCompletedJob,
    costPerMinuteUsd: costPerMinute,
  };
}
