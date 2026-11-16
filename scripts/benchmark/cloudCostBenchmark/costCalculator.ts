/**
 * Task-0127: Multi-Cloud Cost Accounting Engine (Schema 1.2.0)
 * Calculates compute infrastructure costs across GCP, AWS, Azure, and local CPU
 * with transparent pricing assumptions, spot vs on-demand tiering,
 * multi-iteration scaling, and division-by-zero protection.
 */

import type {
  CloudProvider,
  PricingModel,
  PricingTier,
  StageCostBreakdown,
  StageExecutionStatus,
} from "./types";

export interface PricingOverrides {
  instanceType?: string;
  computeHourlyRateUsd?: number;
  transcriptionPerMinuteUsd?: number;
  dubbingPerMinuteUsd?: number;
  cloudProvider?: CloudProvider;
  pricingTier?: PricingTier;
}

/**
 * Standard baseline pricing configurations referenced in docs/GPU_COST_CONCURRENCY.md
 * and Task-00127 multi-cloud benchmarks.
 */
export const DEFAULT_PRICING_MODELS: Record<string, PricingModel> = {
  // GCP Presets
  L4: {
    instanceType: "Cloud Run NVIDIA L4 (24GB)",
    computeHourlyRateUsd: 0.8,
    computeSource: "docs/GPU_COST_CONCURRENCY.md (Google Cloud Run Q3 2026)",
    computeIsAssumption: false,
    cloudProvider: "gcp",
    pricingTier: "standard",
    pricingDate: "2026-Q3",
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
    cloudProvider: "gcp",
    pricingTier: "standard",
    pricingDate: "2026-Q3",
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  // AWS Presets
  AWS_G4DN_ONDEMAND: {
    instanceType: "AWS EC2 g4dn.xlarge (T4 16GB) On-Demand",
    computeHourlyRateUsd: 0.7104,
    computeSource: "AWS EC2 On-Demand Sydney (ap-southeast-2) reference",
    computeIsAssumption: false,
    cloudProvider: "aws",
    pricingTier: "ondemand",
    pricingDate: "2026-Q3",
    regionalLimitation: "Sydney (ap-southeast-2) reference rate. US regions typically ~$0.526/hr.",
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  AWS_G4DN_SPOT: {
    instanceType: "AWS EC2 g4dn.xlarge (T4 16GB) Spot",
    computeHourlyRateUsd: 0.22,
    computeSource: "AWS EC2 Spot Instance average reference (~70% discount)",
    computeIsAssumption: false,
    cloudProvider: "aws",
    pricingTier: "spot",
    pricingDate: "2026-Q3",
    regionalLimitation: "Spot rates fluctuate dynamically based on regional capacity.",
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  // Azure Preset
  AZURE_NCAST4: {
    instanceType: "Azure Standard_NC4as_T4_v3 (T4 16GB)",
    computeHourlyRateUsd: 0.526,
    computeSource: "Azure Linux Pay-As-You-Go pricing reference",
    computeIsAssumption: false,
    cloudProvider: "azure",
    pricingTier: "standard",
    pricingDate: "2026-Q3",
    regionalLimitation: "Reference rate based on US East / standard zone availability.",
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
  // Generic CPU Baseline
  CPU: {
    instanceType: "Cloud Run 4 vCPU / 16GB RAM",
    computeHourlyRateUsd: 0.09,
    computeSource: "Cloud Run general compute rate assumption",
    computeIsAssumption: true,
    cloudProvider: "local",
    pricingTier: "standard",
    pricingDate: "2026-Q3",
    transcriptionPerMinuteUsd: 0.006,
    transcriptionSource: "OpenAI Whisper API public tier reference",
    transcriptionIsAssumption: true,
    dubbingPerMinuteUsd: 0.15,
    dubbingSource: "ElevenLabs Dubbing API standard tier assumption",
    dubbingIsAssumption: true,
  },
};

export function resolvePricingModel(
  gpuType: "L4" | "T4" | "custom" | "none" | "CPU" | string,
  overrides?: PricingOverrides
): PricingModel {
  let base: PricingModel = DEFAULT_PRICING_MODELS.CPU;

  const cloud = overrides?.cloudProvider?.toLowerCase();
  const tier = overrides?.pricingTier?.toLowerCase();

  if (cloud === "aws") {
    base =
      tier === "spot"
        ? DEFAULT_PRICING_MODELS.AWS_G4DN_SPOT
        : DEFAULT_PRICING_MODELS.AWS_G4DN_ONDEMAND;
  } else if (cloud === "azure") {
    base = DEFAULT_PRICING_MODELS.AZURE_NCAST4;
  } else if (cloud === "gcp") {
    base = gpuType === "T4" ? DEFAULT_PRICING_MODELS.T4 : DEFAULT_PRICING_MODELS.L4;
  } else {
    // Default / legacy fallback by gpuType
    if (gpuType === "L4") {
      base = DEFAULT_PRICING_MODELS.L4;
    } else if (gpuType === "T4") {
      base = tier === "spot" ? DEFAULT_PRICING_MODELS.AWS_G4DN_SPOT : DEFAULT_PRICING_MODELS.T4;
    } else {
      base = DEFAULT_PRICING_MODELS.CPU;
    }
  }

  const effectiveCloud = overrides?.cloudProvider ?? base.cloudProvider;
  const effectiveTier = overrides?.pricingTier ?? base.pricingTier;

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
    cloudProvider: effectiveCloud,
    pricingTier: effectiveTier,
    pricingDate: base.pricingDate,
    regionalLimitation: base.regionalLimitation,

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
