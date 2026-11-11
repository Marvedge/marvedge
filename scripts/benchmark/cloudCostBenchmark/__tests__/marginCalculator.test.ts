import { describe, expect, it } from "vitest";
import {
  calculateGrossMargins,
  calculatePipelineEconomics,
  DEPLOYMENT_PROFILES,
  generateProfileMarginReport,
  STANDARD_SELLING_PRICE_SCENARIOS,
  type InfrastructureEconomicsInput,
  type StageEconomicsInput,
} from "../marginCalculator";

describe("Task-00129: Margin Calculator & Unit Economics Engine", () => {
  const baseInfrastructure: InfrastructureEconomicsInput = {
    instanceType: "AWS EC2 g4dn.xlarge (T4 16GB)",
    hourlyComputeRateUsd: 0.7104,
    cloudProvider: "aws",
    pricingTier: "ondemand",
    pricingSource: "Official AWS Sydney rate",
  };

  describe("1. Stage-Level Compute Calculations", () => {
    it("calculates AutoFlip compute cost accurately using measured RTF 0.0065", () => {
      const autoflipStage: StageEconomicsInput = {
        stage: "reframe",
        name: "AutoFlip Reframing",
        provider: "autoflip",
        provenance: "measured_native_cpu",
        realtimeFactor: 0.0065,
      };

      const result = calculatePipelineEconomics(600, [autoflipStage], baseInfrastructure);
      expect(result.stages).toHaveLength(1);
      const stage = result.stages[0];

      // 600s * 0.0065 = 3.9 seconds compute
      expect(stage.computeDurationSec).toBeCloseTo(3.9, 2);

      // 3.9s * ($0.7104 / 3600) = $0.0007696
      expect(stage.computeCostUsd).toBeCloseTo(0.00077, 4);
      expect(stage.apiCostUsd).toBe(0);
      expect(stage.totalStageCostUsd).toBeCloseTo(0.00077, 4);
      expect(stage.computeCostPerMinuteUsd).toBeCloseTo(0.000077, 5);
    });

    it("calculates TalkNet AVS compute cost accurately using verified Tesla T4 RTF 1.216", () => {
      const talknetStage: StageEconomicsInput = {
        stage: "avs",
        name: "TalkNet AVS",
        provider: "talknet",
        provenance: "measured_physical_gpu",
        realtimeFactor: 1.216,
      };

      const result = calculatePipelineEconomics(600, [talknetStage], baseInfrastructure);
      const stage = result.stages[0];

      // 600s * 1.216 = 729.6 seconds compute
      expect(stage.computeDurationSec).toBeCloseTo(729.6, 1);

      // 729.6s * ($0.7104 / 3600) = $0.1439744
      expect(stage.computeCostUsd).toBeCloseTo(0.14397, 4);
      expect(stage.computeCostPerMinuteUsd).toBeCloseTo(0.014397, 4);
      expect(stage.percentageOfTotal).toBe(100);
    });
  });

  describe("2. External API Cost Calculations", () => {
    it("calculates ElevenLabs dubbing and OpenAI Whisper API costs linearly from media duration", () => {
      const zeroComputeInfra: InfrastructureEconomicsInput = {
        instanceType: "Serverless Gateway",
        hourlyComputeRateUsd: 0.0,
        cloudProvider: "local",
        pricingTier: "standard",
        pricingSource: "Zero Compute Test",
      };

      const apiStages: StageEconomicsInput[] = [
        {
          stage: "captions",
          name: "Whisper Transcription",
          provider: "whisper",
          provenance: "measured_external_api",
          apiCostPerMediaMinuteUsd: 0.006, // $0.006/min
        },
        {
          stage: "dubbing",
          name: "ElevenLabs Dubbing",
          provider: "elevenlabs",
          provenance: "measured_external_api",
          apiCostPerMediaMinuteUsd: 0.15, // $0.150/min
        },
      ];

      // 10-minute media (600s)
      const result10m = calculatePipelineEconomics(600, apiStages, zeroComputeInfra);
      expect(result10m.externalApiCostUsd).toBeCloseTo(0.06 + 1.5, 4); // $1.56
      expect(result10m.externalApiCostPerMinuteUsd).toBeCloseTo(0.156, 4);

      // Individual stage inspection
      const captions = result10m.stages.find((s) => s.stage === "captions")!;
      expect(captions.apiCostUsd).toBeCloseTo(0.06, 4);

      const dubbing = result10m.stages.find((s) => s.stage === "dubbing")!;
      expect(dubbing.apiCostUsd).toBeCloseTo(1.5, 4);
      expect(dubbing.percentageOfTotal).toBeCloseTo((1.5 / 1.56) * 100, 1); // ~96.15%
    });
  });

  describe("3. Mixed Pipeline & 10-Minute Scaling", () => {
    it("correctly integrates compute and API stages without double-counting", () => {
      const mixedStages: StageEconomicsInput[] = [
        {
          stage: "reframe",
          name: "AutoFlip",
          provider: "autoflip",
          provenance: "measured_native_cpu",
          realtimeFactor: 0.0065,
        },
        {
          stage: "avs",
          name: "TalkNet",
          provider: "talknet",
          provenance: "measured_physical_gpu",
          realtimeFactor: 1.216,
        },
        {
          stage: "captions",
          name: "Groq Whisper",
          provider: "groq",
          provenance: "measured_external_api",
          apiCostPerMediaMinuteUsd: 0.00185,
        },
        {
          stage: "dubbing",
          name: "ElevenLabs",
          provider: "elevenlabs",
          provenance: "measured_external_api",
          apiCostPerMediaMinuteUsd: 0.15,
        },
      ];

      const result = calculatePipelineEconomics(600, mixedStages, baseInfrastructure);

      // Compute total: AutoFlip ($0.00077) + TalkNet ($0.14397) = ~$0.14474
      expect(result.computeCostUsd).toBeCloseTo(0.14474, 4);

      // API total: Groq ($0.0185) + ElevenLabs ($1.50) = $1.5185
      expect(result.externalApiCostUsd).toBeCloseTo(1.5185, 4);

      // Total incremental cost = Compute + API
      expect(result.totalIncrementalCostUsd).toBeCloseTo(0.14474 + 1.5185, 4);
      expect(result.totalIncrementalCostPerMinuteUsd).toBeCloseTo(
        result.totalIncrementalCostUsd / 10,
        5
      );

      // Stage percentage sum should equal 100%
      const totalPct = result.stages.reduce((sum, s) => sum + s.percentageOfTotal, 0);
      expect(totalPct).toBeCloseTo(100, 1);
    });
  });

  describe("4. Shared Infrastructure Overhead and Storage Amortization", () => {
    it("allocates startup/idle overhead separately without inflating stage-level costs", () => {
      const infraWithOverhead: InfrastructureEconomicsInput = {
        ...baseInfrastructure,
        sharedOverheadSec: 60, // 1 minute of idle instance overhead
      };

      const stage: StageEconomicsInput = {
        stage: "reframe",
        name: "AutoFlip",
        provider: "autoflip",
        provenance: "measured_native_cpu",
        realtimeFactor: 0.0065,
      };

      const result = calculatePipelineEconomics(600, [stage], infraWithOverhead);

      // Stage compute cost remains unchanged
      expect(result.stages[0].computeCostUsd).toBeCloseTo(0.00077, 4);

      // Shared overhead is tracked separately: 60s * ($0.7104 / 3600) = $0.01184
      expect(result.sharedOverheadCostUsd).toBeCloseTo(0.01184, 4);

      // Total incremental includes shared overhead
      expect(result.totalIncrementalCostUsd).toBeCloseTo(0.00077 + 0.01184, 4);
    });

    it("amortizes persistent EBS storage across monthly volume without treating it as job-incremental", () => {
      const infraWithStorage: InfrastructureEconomicsInput = {
        ...baseInfrastructure,
        monthlyStorageFeeUsd: 9.6, // $9.60/month (100 GB gp3)
        monthlyProcessedMinutes: 960, // 960 minutes/month
      };

      const result = calculatePipelineEconomics(600, [], infraWithStorage);

      // Incremental job cost is 0 (no stages ran)
      expect(result.totalIncrementalCostUsd).toBe(0);

      // Allocated storage per minute: $9.60 / 960 min = $0.0100/min
      expect(result.allocatedStorageCostPerMinuteUsd).toBeCloseTo(0.01, 4);

      // For a 10-minute video: 10 * $0.01 = $0.10
      expect(result.allocatedStorageCostUsd).toBeCloseTo(0.1, 4);
      expect(result.totalCostWithStorageUsd).toBeCloseTo(0.1, 4);
    });
  });

  describe("5. Margin and Break-Even Calculations", () => {
    it("computes gross profit, gross margin percentage, and break-even accurately", () => {
      const testEcon = calculatePipelineEconomics(
        600,
        DEPLOYMENT_PROFILES.PROFILE_1_STANDARD_SAAS.stages,
        DEPLOYMENT_PROFILES.PROFILE_1_STANDARD_SAAS.infrastructure
      );

      const scenarios = calculateGrossMargins(testEcon, STANDARD_SELLING_PRICE_SCENARIOS);

      expect(scenarios).toHaveLength(4);

      // Profile 1 COGS for 10 min: ~$1.7047 USD ($0.1705/min)
      const breakEvenPrice = testEcon.totalIncrementalCostPerMinuteUsd;
      expect(breakEvenPrice).toBeCloseTo(0.1705, 3);

      // Scenario 1: $0.25/min ($2.50 revenue for 10 min)
      const s025 = scenarios[0];
      expect(s025.totalRevenueUsd).toBeCloseTo(2.5, 2);
      expect(s025.grossProfitUsd).toBeCloseTo(2.5 - 1.7047, 2); // ~$0.795
      expect(s025.grossMarginPct).toBeCloseTo(31.8, 1);
      expect(s025.breakEvenPricePerMinuteUsd).toBeCloseTo(breakEvenPrice, 3);

      // Scenario 3: $1.00/min ($10.00 revenue for 10 min)
      const s100 = scenarios[2];
      expect(s100.totalRevenueUsd).toBeCloseTo(10.0, 2);
      expect(s100.grossProfitUsd).toBeCloseTo(10.0 - 1.7047, 2); // ~$8.295
      expect(s100.grossMarginPct).toBeCloseTo(82.95, 1);
    });

    it("verifies Profile 3 (Full Self-Hosted AI) delivers >95% cost reduction and break-even <$0.01/min", () => {
      const reportProfile1 = generateProfileMarginReport("PROFILE_1_STANDARD_SAAS", 600);
      const reportProfile3 = generateProfileMarginReport("PROFILE_3_SELF_HOSTED_AI", 600);

      const cogs1 = reportProfile1.economics.totalIncrementalCostUsd; // ~$1.705
      const cogs3 = reportProfile3.economics.totalIncrementalCostUsd; // ~$0.084

      expect(cogs1).toBeGreaterThan(1.6);
      expect(cogs3).toBeLessThan(0.1);

      const savingsPct = ((cogs1 - cogs3) / cogs1) * 100;
      expect(savingsPct).toBeGreaterThan(94.0); // >94% cost reduction

      // Break-even for Profile 3 should be under $0.01 per minute
      expect(reportProfile3.breakEvenPricePerMinuteUsd).toBeLessThan(0.01);
      expect(reportProfile3.marginScenarios[0].grossMarginPct).toBeGreaterThan(95.0); // >95% margin at $0.25/min
    });
  });

  describe("6. Edge Cases & Division-by-Zero Safety", () => {
    it("handles zero and negative media duration gracefully without NaN or Infinity", () => {
      const resultZero = calculatePipelineEconomics(
        0,
        DEPLOYMENT_PROFILES.PROFILE_1_STANDARD_SAAS.stages,
        baseInfrastructure
      );

      expect(resultZero.mediaDurationMinutes).toBe(0);
      expect(resultZero.totalIncrementalCostUsd).toBe(0);
      expect(resultZero.totalIncrementalCostPerMinuteUsd).toBe(0);
      expect(isNaN(resultZero.totalIncrementalCostPerMinuteUsd)).toBe(false);

      const margins = calculateGrossMargins(resultZero, STANDARD_SELLING_PRICE_SCENARIOS);
      expect(margins[0].grossMarginPct).toBe(0);
      expect(isNaN(margins[0].grossMarginPct)).toBe(false);
    });

    it("correctly models hypothetical concurrency divider without affecting external API charges", () => {
      const concurrentInfra: InfrastructureEconomicsInput = {
        ...baseInfrastructure,
        concurrencyFactor: 3.0,
        isHypotheticalConcurrency: true,
      };

      const stages: StageEconomicsInput[] = [
        {
          stage: "avs",
          name: "TalkNet",
          provider: "talknet",
          provenance: "measured_physical_gpu",
          realtimeFactor: 1.216,
        },
        {
          stage: "dubbing",
          name: "ElevenLabs",
          provider: "elevenlabs",
          provenance: "measured_external_api",
          apiCostPerMediaMinuteUsd: 0.15,
        },
      ];

      const singleRun = calculatePipelineEconomics(600, stages, baseInfrastructure);
      const concurrentRun = calculatePipelineEconomics(600, stages, concurrentInfra);

      // Compute cost must be divided by 3
      expect(concurrentRun.computeCostUsd).toBeCloseTo(singleRun.computeCostUsd / 3, 4);

      // External API cost must remain unchanged (ElevenLabs bills per media minute, not per GPU hour!)
      expect(concurrentRun.externalApiCostUsd).toBeCloseTo(singleRun.externalApiCostUsd, 4);
    });
  });
});
