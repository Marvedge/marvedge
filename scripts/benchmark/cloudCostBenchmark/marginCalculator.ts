/**
 * Task-00129: Pipeline Cost Engine, Unit Economics & Margin Calculator
 * -----------------------------------------------------------------------------
 * Provides deterministic mathematical models for:
 *   1. Stage-level compute and API cost calculations per media minute and arbitrary duration.
 *   2. Shared infrastructure overhead and optional persistent storage amortization.
 *   3. Gross profit, gross margin percentage, and break-even pricing across commercial scenarios.
 *   4. Multi-profile scenario modeling (Standard SaaS, Spot Cloud, Self-Hosted AI, Serverless GPU).
 *
 * Designed as a pure, side-effect-free calculation engine with zero cloud dependencies.
 */

import type { CloudProvider, PipelineStage, PricingTier } from "./types";

export type CostProvenance =
  | "measured_physical_gpu"
  | "measured_native_cpu"
  | "measured_external_api"
  | "modeled_estimate"
  | "unexecuted_assumption";

export interface StageEconomicsInput {
  stage: PipelineStage | string;
  name: string;
  provider: string;
  provenance: CostProvenance;
  /** Real-time factor: compute duration seconds / media duration seconds (e.g. 1.216 for TalkNet) */
  realtimeFactor?: number;
  /** Explicit compute wall-clock duration in seconds (optional; derived from RTF if omitted) */
  explicitComputeSec?: number;
  /** Cost in USD per input media minute for external APIs (e.g. 0.15 for ElevenLabs, 0.006 for Whisper) */
  apiCostPerMediaMinuteUsd?: number;
  notes?: string[];
}

export interface InfrastructureEconomicsInput {
  instanceType: string;
  hourlyComputeRateUsd: number;
  cloudProvider: CloudProvider;
  pricingTier: PricingTier;
  pricingSource: string;
  /** Fixed startup, idle or orchestration overhead in seconds per job (default: 0) */
  sharedOverheadSec?: number;
  /** Hypothetical concurrency divider for shared compute (default: 1.0 = single stream) */
  concurrencyFactor?: number;
  /** Explicitly flag whether concurrency is a hypothetical capacity scenario */
  isHypotheticalConcurrency?: boolean;
  /** Monthly persistent storage fee in USD (e.g., $9.60 for 100 GB gp3; default: 0) */
  monthlyStorageFeeUsd?: number;
  /** Expected monthly media minutes processed for storage amortization (default: 0 = unallocated) */
  monthlyProcessedMinutes?: number;
}

export interface StageEconomicsResult {
  stage: string;
  name: string;
  provider: string;
  provenance: CostProvenance;
  realtimeFactor: number;
  computeDurationSec: number;
  computeCostUsd: number;
  computeCostPerMinuteUsd: number;
  apiCostUsd: number;
  apiCostPerMinuteUsd: number;
  totalStageCostUsd: number;
  totalStageCostPerMinuteUsd: number;
  percentageOfTotal: number;
  notes: string[];
}

export interface PipelineEconomicsResult {
  mediaDurationSec: number;
  mediaDurationMinutes: number;
  infrastructure: InfrastructureEconomicsInput;
  stages: StageEconomicsResult[];
  computeCostUsd: number;
  computeCostPerMinuteUsd: number;
  externalApiCostUsd: number;
  externalApiCostPerMinuteUsd: number;
  sharedOverheadCostUsd: number;
  sharedOverheadCostPerMinuteUsd: number;
  totalIncrementalCostUsd: number;
  totalIncrementalCostPerMinuteUsd: number;
  allocatedStorageCostUsd: number;
  allocatedStorageCostPerMinuteUsd: number;
  totalCostWithStorageUsd: number;
  totalCostWithStoragePerMinuteUsd: number;
  dominantCostDriver: {
    stage: string;
    provider: string;
    costUsd: number;
    percentage: number;
  };
}

export interface MarginScenarioInput {
  sellingPricePerMinuteUsd: number;
  label?: string;
}

export interface MarginScenarioResult {
  label: string;
  sellingPricePerMinuteUsd: number;
  totalRevenueUsd: number;
  cogsIncrementalUsd: number;
  cogsTotalWithStorageUsd: number;
  grossProfitUsd: number;
  grossMarginPct: number;
  breakEvenPricePerMinuteUsd: number;
}

export interface PipelineMarginAnalysisReport {
  profileId: string;
  profileName: string;
  description: string;
  economics: PipelineEconomicsResult;
  marginScenarios: MarginScenarioResult[];
  breakEvenPricePerMinuteUsd: number;
  breakEvenPrice10MinUsd: number;
}

/**
 * Validates numeric inputs and sanitizes against negative values or division-by-zero.
 */
function sanitizeNonNegative(val: number | undefined, defaultVal = 0): number {
  if (val === undefined || isNaN(val) || !isFinite(val) || val < 0) {
    return defaultVal;
  }
  return val;
}

/**
 * Calculates end-to-end pipeline economics, stage breakdowns, and cost-per-minute metrics.
 */
export function calculatePipelineEconomics(
  mediaDurationSec: number,
  stages: StageEconomicsInput[],
  infrastructure: InfrastructureEconomicsInput
): PipelineEconomicsResult {
  const safeMediaSec = sanitizeNonNegative(mediaDurationSec, 0);
  const mediaDurationMinutes = safeMediaSec / 60;

  const hourlyRate = sanitizeNonNegative(infrastructure.hourlyComputeRateUsd, 0);
  const ratePerSecond = hourlyRate / 3600;
  const rawConcurrency = sanitizeNonNegative(infrastructure.concurrencyFactor, 1.0);
  const concurrency = rawConcurrency > 0 ? rawConcurrency : 1.0;

  let totalComputeCost = 0;
  let totalApiCost = 0;

  // First pass: compute stage costs
  const intermediateStages: Array<{
    stage: string;
    name: string;
    provider: string;
    provenance: CostProvenance;
    realtimeFactor: number;
    computeDurationSec: number;
    computeCostUsd: number;
    computeCostPerMinuteUsd: number;
    apiCostUsd: number;
    apiCostPerMinuteUsd: number;
    totalStageCostUsd: number;
    totalStageCostPerMinuteUsd: number;
    notes: string[];
  }> = [];

  for (const s of stages) {
    const notes: string[] = s.notes ? [...s.notes] : [];
    let rtf = 0;
    let computeSec = 0;

    if (s.explicitComputeSec !== undefined && s.explicitComputeSec >= 0) {
      computeSec = s.explicitComputeSec;
      rtf = safeMediaSec > 0 ? computeSec / safeMediaSec : 0;
    } else if (s.realtimeFactor !== undefined && s.realtimeFactor >= 0) {
      rtf = s.realtimeFactor;
      computeSec = safeMediaSec * rtf;
    }

    // Apply concurrency divider if applicable
    const effectiveComputeSec = computeSec / concurrency;
    const stageComputeCost = effectiveComputeSec * ratePerSecond;

    const apiRatePerMin = sanitizeNonNegative(s.apiCostPerMediaMinuteUsd, 0);
    const stageApiCost = mediaDurationMinutes * apiRatePerMin;

    const totalStageCost = stageComputeCost + stageApiCost;

    const computeCostPerMinute =
      mediaDurationMinutes > 0 ? stageComputeCost / mediaDurationMinutes : 0;
    const apiCostPerMinute = mediaDurationMinutes > 0 ? stageApiCost / mediaDurationMinutes : 0;
    const totalStageCostPerMinute =
      mediaDurationMinutes > 0 ? totalStageCost / mediaDurationMinutes : 0;

    totalComputeCost += stageComputeCost;
    totalApiCost += stageApiCost;

    intermediateStages.push({
      stage: s.stage,
      name: s.name,
      provider: s.provider,
      provenance: s.provenance,
      realtimeFactor: Number(rtf.toFixed(6)),
      computeDurationSec: Number(computeSec.toFixed(3)),
      computeCostUsd: Number(stageComputeCost.toFixed(6)),
      computeCostPerMinuteUsd: Number(computeCostPerMinute.toFixed(6)),
      apiCostUsd: Number(stageApiCost.toFixed(6)),
      apiCostPerMinuteUsd: Number(apiCostPerMinute.toFixed(6)),
      totalStageCostUsd: Number(totalStageCost.toFixed(6)),
      totalStageCostPerMinuteUsd: Number(totalStageCostPerMinute.toFixed(6)),
      notes,
    });
  }

  // Shared compute overhead (startup, orchestration, idle between stages)
  const overheadSec = sanitizeNonNegative(infrastructure.sharedOverheadSec, 0);
  const sharedOverheadCost = (overheadSec / concurrency) * ratePerSecond;
  const sharedOverheadCostPerMinute =
    mediaDurationMinutes > 0 ? sharedOverheadCost / mediaDurationMinutes : 0;

  const totalIncrementalCost = totalComputeCost + totalApiCost + sharedOverheadCost;
  const totalIncrementalCostPerMinute =
    mediaDurationMinutes > 0 ? totalIncrementalCost / mediaDurationMinutes : 0;

  // Storage amortization
  const monthlyStorageFee = sanitizeNonNegative(infrastructure.monthlyStorageFeeUsd, 0);
  const monthlyProcessedMin = sanitizeNonNegative(infrastructure.monthlyProcessedMinutes, 0);
  const allocatedStorageCostPerMinute =
    monthlyProcessedMin > 0 ? monthlyStorageFee / monthlyProcessedMin : 0;
  const allocatedStorageCost = allocatedStorageCostPerMinute * mediaDurationMinutes;

  const totalCostWithStorage = totalIncrementalCost + allocatedStorageCost;
  const totalCostWithStoragePerMinute =
    totalIncrementalCostPerMinute + allocatedStorageCostPerMinute;

  // Second pass: compute percentage of total for each stage
  let dominantCost = 0;
  let dominantDriver = {
    stage: "none",
    provider: "none",
    costUsd: 0,
    percentage: 0,
  };

  const finalStages: StageEconomicsResult[] = intermediateStages.map((st) => {
    const percentage =
      totalIncrementalCost > 0 ? (st.totalStageCostUsd / totalIncrementalCost) * 100 : 0;
    if (st.totalStageCostUsd > dominantCost) {
      dominantCost = st.totalStageCostUsd;
      dominantDriver = {
        stage: st.stage,
        provider: st.provider,
        costUsd: st.totalStageCostUsd,
        percentage: Number(percentage.toFixed(2)),
      };
    }
    return {
      ...st,
      percentageOfTotal: Number(percentage.toFixed(2)),
    };
  });

  return {
    mediaDurationSec: Number(safeMediaSec.toFixed(3)),
    mediaDurationMinutes: Number(mediaDurationMinutes.toFixed(4)),
    infrastructure,
    stages: finalStages,
    computeCostUsd: Number(totalComputeCost.toFixed(6)),
    computeCostPerMinuteUsd: Number(
      (mediaDurationMinutes > 0 ? totalComputeCost / mediaDurationMinutes : 0).toFixed(6)
    ),
    externalApiCostUsd: Number(totalApiCost.toFixed(6)),
    externalApiCostPerMinuteUsd: Number(
      (mediaDurationMinutes > 0 ? totalApiCost / mediaDurationMinutes : 0).toFixed(6)
    ),
    sharedOverheadCostUsd: Number(sharedOverheadCost.toFixed(6)),
    sharedOverheadCostPerMinuteUsd: Number(sharedOverheadCostPerMinute.toFixed(6)),
    totalIncrementalCostUsd: Number(totalIncrementalCost.toFixed(6)),
    totalIncrementalCostPerMinuteUsd: Number(totalIncrementalCostPerMinute.toFixed(6)),
    allocatedStorageCostUsd: Number(allocatedStorageCost.toFixed(6)),
    allocatedStorageCostPerMinuteUsd: Number(allocatedStorageCostPerMinute.toFixed(6)),
    totalCostWithStorageUsd: Number(totalCostWithStorage.toFixed(6)),
    totalCostWithStoragePerMinuteUsd: Number(totalCostWithStoragePerMinute.toFixed(6)),
    dominantCostDriver: dominantDriver,
  };
}

/**
 * Calculates gross margin and profit across a list of retail selling prices.
 */
export function calculateGrossMargins(
  economics: PipelineEconomicsResult,
  sellingPricesPerMinute: MarginScenarioInput[]
): MarginScenarioResult[] {
  const mediaMinutes = economics.mediaDurationMinutes;
  const cogsIncremental = economics.totalIncrementalCostUsd;
  const cogsWithStorage = economics.totalCostWithStorageUsd;
  const breakEvenPerMinute = economics.totalIncrementalCostPerMinuteUsd;

  return sellingPricesPerMinute.map((scenario) => {
    const pricePerMin = sanitizeNonNegative(scenario.sellingPricePerMinuteUsd, 0);
    const label = scenario.label || `$${pricePerMin.toFixed(2)}/min`;
    const totalRevenue = pricePerMin * mediaMinutes;

    // Gross profit relative to incremental COGS
    const grossProfit = totalRevenue - cogsIncremental;
    const grossMarginPct =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : grossProfit >= 0 ? 0 : -100;

    return {
      label,
      sellingPricePerMinuteUsd: Number(pricePerMin.toFixed(4)),
      totalRevenueUsd: Number(totalRevenue.toFixed(4)),
      cogsIncrementalUsd: Number(cogsIncremental.toFixed(4)),
      cogsTotalWithStorageUsd: Number(cogsWithStorage.toFixed(4)),
      grossProfitUsd: Number(grossProfit.toFixed(4)),
      grossMarginPct: Number(grossMarginPct.toFixed(2)),
      breakEvenPricePerMinuteUsd: Number(breakEvenPerMinute.toFixed(4)),
    };
  });
}

/**
 * Predefined production deployment profiles from Task-00128/129 specifications.
 */
export const DEPLOYMENT_PROFILES = {
  PROFILE_1_STANDARD_SAAS: {
    id: "profile_1_standard_saas",
    name: "Profile 1: Standard SaaS Production (AWS On-Demand + OpenAI + ElevenLabs)",
    description:
      "Production default configuration running on AWS EC2 g4dn.xlarge On-Demand, utilizing official OpenAI Whisper and ElevenLabs Dubbing commercial APIs.",
    infrastructure: {
      instanceType: "AWS EC2 g4dn.xlarge (T4 16GB) On-Demand",
      hourlyComputeRateUsd: 0.7104,
      cloudProvider: "aws" as CloudProvider,
      pricingTier: "ondemand" as PricingTier,
      pricingSource: "Official AWS Sydney (ap-southeast-2) published rate (2026-Q3)",
      sharedOverheadSec: 0,
      monthlyStorageFeeUsd: 9.6, // 100 GB gp3 root volume
      monthlyProcessedMinutes: 10000,
    },
    stages: [
      {
        stage: "reframe",
        name: "AutoFlip Aspect Ratio Conversion (9:16)",
        provider: "autoflip",
        provenance: "measured_native_cpu" as CostProvenance,
        realtimeFactor: 0.0065, // 0.052s on 8.0s media
        notes: ["Native MediaPipe C++ execution on host CPU (GPU acceleration unverified)"],
      },
      {
        stage: "avs",
        name: "TalkNet Active Speaker Detection",
        provider: "talknet",
        provenance: "measured_physical_gpu" as CostProvenance,
        realtimeFactor: 1.216, // 9.778s on 8.04s media
        notes: [
          "Verified PyTorch CUDA inference on Tesla T4; 77 telemetry samples, 54% peak GPU load",
        ],
      },
      {
        stage: "captions",
        name: "OpenAI Whisper Transcription & Alignment",
        provider: "whisper",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.006, // OpenAI official published rate
        notes: ["Commercial SaaS API rate ($0.006/min audio)"],
      },
      {
        stage: "dubbing",
        name: "ElevenLabs Dubbing & Speech Synthesis",
        provider: "elevenlabs",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.15, // ElevenLabs standard tier published rate
        notes: ["Production default dubbing provider ($0.150/min audio)"],
      },
    ],
  },

  PROFILE_2_SPOT_OPTIMIZED: {
    id: "profile_2_spot_optimized",
    name: "Profile 2: Cost-Optimized Cloud (AWS Spot + Groq Whisper + ElevenLabs)",
    description:
      "Cloud-optimized configuration using AWS Spot g4dn.xlarge (~70% discount) and ultra-fast Groq Cloud Whisper Large V3, retaining ElevenLabs for dubbing.",
    infrastructure: {
      instanceType: "AWS EC2 g4dn.xlarge (T4 16GB) Spot",
      hourlyComputeRateUsd: 0.22,
      cloudProvider: "aws" as CloudProvider,
      pricingTier: "spot" as PricingTier,
      pricingSource: "AWS EC2 Spot average reference rate in codebase",
      sharedOverheadSec: 0,
      monthlyStorageFeeUsd: 9.6,
      monthlyProcessedMinutes: 10000,
    },
    stages: [
      {
        stage: "reframe",
        name: "AutoFlip Aspect Ratio Conversion (9:16)",
        provider: "autoflip",
        provenance: "measured_native_cpu" as CostProvenance,
        realtimeFactor: 0.0065,
        notes: ["Native MediaPipe C++ execution on host CPU"],
      },
      {
        stage: "avs",
        name: "TalkNet Active Speaker Detection",
        provider: "talknet",
        provenance: "measured_physical_gpu" as CostProvenance,
        realtimeFactor: 1.216,
        notes: ["Verified PyTorch CUDA inference on Tesla T4"],
      },
      {
        stage: "captions",
        name: "Groq Cloud Whisper Large V3",
        provider: "groq",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.00185, // Groq published: $0.111 / hr audio
        notes: ["Measured 23.2x real-time speedup in Task-00128"],
      },
      {
        stage: "dubbing",
        name: "ElevenLabs Dubbing & Speech Synthesis",
        provider: "elevenlabs",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.15,
        notes: ["Commercial SaaS API rate"],
      },
    ],
  },

  PROFILE_3_SELF_HOSTED_AI: {
    id: "profile_3_self_hosted_ai",
    name: "Profile 3: Full Self-Hosted AI Pipeline (AWS Spot + Faster-Whisper + VoiceStudio)",
    description:
      "Fully sovereign open-source pipeline with zero external API fees: local Faster-Whisper and local VoiceStudio GPU speech generation.",
    infrastructure: {
      instanceType: "AWS EC2 g4dn.xlarge (T4 16GB) Spot",
      hourlyComputeRateUsd: 0.22,
      cloudProvider: "aws" as CloudProvider,
      pricingTier: "spot" as PricingTier,
      pricingSource: "AWS EC2 Spot average reference rate in codebase",
      sharedOverheadSec: 0,
      monthlyStorageFeeUsd: 9.6,
      monthlyProcessedMinutes: 10000,
    },
    stages: [
      {
        stage: "reframe",
        name: "AutoFlip Aspect Ratio Conversion (9:16)",
        provider: "autoflip",
        provenance: "measured_native_cpu" as CostProvenance,
        realtimeFactor: 0.0065,
        notes: ["Native MediaPipe C++ execution on host CPU"],
      },
      {
        stage: "avs",
        name: "TalkNet Active Speaker Detection",
        provider: "talknet",
        provenance: "measured_physical_gpu" as CostProvenance,
        realtimeFactor: 1.216,
        notes: ["Verified PyTorch CUDA inference on Tesla T4"],
      },
      {
        stage: "captions",
        name: "Local Faster-Whisper (CUDA)",
        provider: "faster-whisper",
        provenance: "modeled_estimate" as CostProvenance,
        realtimeFactor: 0.0667, // ~15x RT = 40s compute per 600s media
        apiCostPerMediaMinuteUsd: 0.0,
        notes: [
          "Modeled estimate based on standard Faster-Whisper T4 FP16 benchmark (~15x real-time)",
        ],
      },
      {
        stage: "dubbing",
        name: "VoiceStudio Local GPU Speech Synthesis",
        provider: "voicestudio",
        provenance: "unexecuted_assumption" as CostProvenance,
        realtimeFactor: 1.0, // Illustrative 1:1 RTF assumption
        apiCostPerMediaMinuteUsd: 0.0,
        notes: [
          "Illustrative 1.0x RTF assumption; physical inference telemetry unmeasured in Task-00128",
        ],
      },
    ],
  },

  PROFILE_4_SERVERLESS_GPU: {
    id: "profile_4_serverless_gpu",
    name: "Profile 4: Serverless GPU (GCP Cloud Run T4 $0.35/hr + Groq + ElevenLabs)",
    description:
      "Per-second billed serverless container deployment using Google Cloud Run NVIDIA T4 with zero idle instance cost.",
    infrastructure: {
      instanceType: "GCP Cloud Run NVIDIA T4 (16GB)",
      hourlyComputeRateUsd: 0.35,
      cloudProvider: "gcp" as CloudProvider,
      pricingTier: "standard" as PricingTier,
      pricingSource: "Google Cloud Run published pricing (Q3 2026)",
      sharedOverheadSec: 0,
      monthlyStorageFeeUsd: 0, // Serverless ephemeral storage (0 fixed monthly fee)
      monthlyProcessedMinutes: 10000,
    },
    stages: [
      {
        stage: "reframe",
        name: "AutoFlip Aspect Ratio Conversion (9:16)",
        provider: "autoflip",
        provenance: "measured_native_cpu" as CostProvenance,
        realtimeFactor: 0.0065,
        notes: ["Native MediaPipe C++ execution on host CPU"],
      },
      {
        stage: "avs",
        name: "TalkNet Active Speaker Detection",
        provider: "talknet",
        provenance: "measured_physical_gpu" as CostProvenance,
        realtimeFactor: 1.216,
        notes: ["PyTorch CUDA inference on T4"],
      },
      {
        stage: "captions",
        name: "Groq Cloud Whisper Large V3",
        provider: "groq",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.00185,
        notes: ["Groq Cloud published rate"],
      },
      {
        stage: "dubbing",
        name: "ElevenLabs Dubbing & Speech Synthesis",
        provider: "elevenlabs",
        provenance: "measured_external_api" as CostProvenance,
        apiCostPerMediaMinuteUsd: 0.15,
        notes: ["Commercial SaaS API rate"],
      },
    ],
  },
};

/**
 * Standard commercial selling price scenarios for margin analysis.
 */
export const STANDARD_SELLING_PRICE_SCENARIOS: MarginScenarioInput[] = [
  { sellingPricePerMinuteUsd: 0.25, label: "Tier 1: High-Volume / API ($0.25/min)" },
  { sellingPricePerMinuteUsd: 0.5, label: "Tier 2: Standard Creator ($0.50/min)" },
  { sellingPricePerMinuteUsd: 1.0, label: "Tier 3: Professional Business ($1.00/min)" },
  { sellingPricePerMinuteUsd: 2.5, label: "Tier 4: Enterprise White-Glove ($2.50/min)" },
];

/**
 * Evaluates full pipeline economics and gross margin report for a specific profile and media length.
 */
export function generateProfileMarginReport(
  profileKey: keyof typeof DEPLOYMENT_PROFILES,
  mediaDurationSec: number,
  customScenarios: MarginScenarioInput[] = STANDARD_SELLING_PRICE_SCENARIOS
): PipelineMarginAnalysisReport {
  const profile = DEPLOYMENT_PROFILES[profileKey];
  const economics = calculatePipelineEconomics(
    mediaDurationSec,
    profile.stages,
    profile.infrastructure
  );
  const marginScenarios = calculateGrossMargins(economics, customScenarios);

  return {
    profileId: profile.id,
    profileName: profile.name,
    description: profile.description,
    economics,
    marginScenarios,
    breakEvenPricePerMinuteUsd: economics.totalIncrementalCostPerMinuteUsd,
    breakEvenPrice10MinUsd: economics.totalIncrementalCostPerMinuteUsd * 10,
  };
}
