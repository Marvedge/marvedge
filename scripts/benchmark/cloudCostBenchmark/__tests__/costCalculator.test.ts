import { describe, expect, it } from "vitest";
import { aggregateCosts, calculateStageCost, resolvePricingModel } from "../costCalculator";

describe("Cost Calculator & Pricing Resolver", () => {
  it("resolves default L4, T4, and CPU pricing", () => {
    const l4 = resolvePricingModel("L4");
    expect(l4.computeHourlyRateUsd).toBe(0.8);
    expect(l4.instanceType).toContain("L4");

    const t4 = resolvePricingModel("T4");
    expect(t4.computeHourlyRateUsd).toBe(0.35);
    expect(t4.instanceType).toContain("T4");

    const cpu = resolvePricingModel("CPU");
    expect(cpu.computeHourlyRateUsd).toBe(0.09);
    expect(cpu.instanceType).toContain("CPU");
  });

  it("applies explicit user overrides correctly", () => {
    const custom = resolvePricingModel("custom", {
      instanceType: "Custom On-Demand GPU",
      computeHourlyRateUsd: 1.25,
      dubbingPerMinuteUsd: 0.2,
      transcriptionPerMinuteUsd: 0.01,
    });

    expect(custom.instanceType).toBe("Custom On-Demand GPU");
    expect(custom.computeHourlyRateUsd).toBe(1.25);
    expect(custom.dubbingPerMinuteUsd).toBe(0.2);
    expect(custom.transcriptionPerMinuteUsd).toBe(0.01);
    expect(custom.computeIsAssumption).toBe(false);
  });

  it("charges strictly ZERO external API cost in fixture mode", () => {
    const pricing = resolvePricingModel("L4");
    const cost = calculateStageCost({
      stage: "dubbing",
      status: "fixture",
      provider: "fixture",
      measuredDurationMs: 5000,
      mediaDurationSec: 120,
      completedJobs: 1,
      pricing,
    });

    expect(cost.externalApiCostUsd).toBe(0);
    expect(cost.computeCostUsd).toBeGreaterThan(0);
    expect(cost.totalCostUsd).toBe(cost.computeCostUsd);
  });

  it("properly scales external API and compute costs across multiple iterations", () => {
    const pricing = resolvePricingModel("L4");
    const mediaSec = 60; // 1 minute of video
    const ratePerMin = pricing.dubbingPerMinuteUsd; // $0.15/min

    // 1 job taking 2 seconds
    const singleRun = calculateStageCost({
      stage: "dubbing",
      status: "real_inference",
      provider: "elevenlabs",
      measuredDurationMs: 2000,
      mediaDurationSec: mediaSec,
      completedJobs: 1,
      pricing,
    });

    // 5 iterations taking 10 seconds total
    const multiRun = calculateStageCost({
      stage: "dubbing",
      status: "real_inference",
      provider: "elevenlabs",
      measuredDurationMs: 10000,
      mediaDurationSec: mediaSec,
      completedJobs: 5,
      pricing,
    });

    // Compute cost should scale 5x
    expect(multiRun.computeCostUsd).toBeCloseTo(singleRun.computeCostUsd * 5, 4);

    // External API cost must scale with 5 billable jobs (5 * 1 min * $0.15 = $0.75)
    expect(multiRun.externalApiCostUsd).toBeCloseTo(ratePerMin * 5, 4);

    // Cost per completed job should be equal between single and multi-run
    expect(multiRun.costPerCompletedJobUsd).toBeCloseTo(singleRun.costPerCompletedJobUsd!, 4);

    // Cost per minute of processed media must NOT be inflated by 5x!
    expect(multiRun.costPerMinuteUsd).toBeCloseTo(singleRun.costPerMinuteUsd!, 4);
  });

  it("handles zero or negative duration media without division by zero errors", () => {
    const pricing = resolvePricingModel("none");
    const costZero = calculateStageCost({
      stage: "captions",
      status: "fixture",
      provider: "fixture",
      measuredDurationMs: 1000,
      mediaDurationSec: 0,
      completedJobs: 1,
      pricing,
    });

    expect(costZero.costPerMinuteUsd).toBeNull();
    expect(costZero.costPerCompletedJobUsd).toBe(costZero.totalCostUsd);
    expect(Number.isFinite(costZero.totalCostUsd)).toBe(true);
  });

  it("assigns ZERO cost to skipped or blocked stages and returns null per-job metric", () => {
    const pricing = resolvePricingModel("L4");
    const costBlocked = calculateStageCost({
      stage: "avs",
      status: "blocked",
      provider: "talknet",
      measuredDurationMs: 15,
      mediaDurationSec: 60,
      completedJobs: 0,
      pricing,
    });

    expect(costBlocked.computeCostUsd).toBe(0);
    expect(costBlocked.externalApiCostUsd).toBe(0);
    expect(costBlocked.totalCostUsd).toBe(0);
    expect(costBlocked.costPerCompletedJobUsd).toBeNull();
    expect(costBlocked.costPerMinuteUsd).toBeNull();
  });

  it("aggregates multiple stages into coherent totals without double counting", () => {
    const pricing = resolvePricingModel("L4");
    const reframeCost = calculateStageCost({
      stage: "reframe",
      status: "fixture",
      provider: "fixture",
      measuredDurationMs: 10000,
      mediaDurationSec: 60,
      completedJobs: 2,
      pricing,
    });
    const captionsCost = calculateStageCost({
      stage: "captions",
      status: "fixture",
      provider: "fixture",
      measuredDurationMs: 2000,
      mediaDurationSec: 60,
      completedJobs: 2,
      pricing,
    });

    const aggregate = aggregateCosts([reframeCost, captionsCost], 60, 2);

    expect(aggregate.computeCostUsd).toBeCloseTo(
      reframeCost.computeCostUsd + captionsCost.computeCostUsd
    );
    expect(aggregate.externalApiCostUsd).toBe(0);
    expect(aggregate.costPerCompletedJobUsd).toBeCloseTo(aggregate.totalCostUsd / 2);
  });
});
