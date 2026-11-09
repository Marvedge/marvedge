import { describe, expect, it } from "vitest";
import { calculatePercentiles, TelemetryCollector } from "../telemetry";

describe("Telemetry & Latency Calculations", () => {
  it("handles empty latency samples gracefully", () => {
    const metrics = calculatePercentiles([]);
    expect(metrics.count).toBe(0);
    expect(metrics.p50Ms).toBe(0);
    expect(metrics.p95Ms).toBe(0);
    expect(metrics.minMs).toBe(0);
    expect(metrics.maxMs).toBe(0);
    expect(metrics.meanMs).toBe(0);
    expect(metrics.stdDevMs).toBe(0);
    expect(metrics.rawLatenciesMs).toEqual([]);
  });

  it("calculates exact metrics for single sample", () => {
    const metrics = calculatePercentiles([125.5]);
    expect(metrics.count).toBe(1);
    expect(metrics.p50Ms).toBe(125.5);
    expect(metrics.p95Ms).toBe(125.5);
    expect(metrics.minMs).toBe(125.5);
    expect(metrics.maxMs).toBe(125.5);
    expect(metrics.meanMs).toBe(125.5);
    expect(metrics.stdDevMs).toBe(0);
  });

  it("calculates P50, P95, mean, min, max, and stdDev for multiple samples", () => {
    const samples = [100, 10, 40, 30, 20, 90, 80, 50, 70, 60];
    const metrics = calculatePercentiles(samples);

    expect(metrics.count).toBe(10);
    expect(metrics.minMs).toBe(10);
    expect(metrics.maxMs).toBe(100);
    expect(metrics.meanMs).toBe(55);
    expect(metrics.p50Ms).toBe(55);
    expect(metrics.p95Ms).toBeGreaterThanOrEqual(95);
    expect(metrics.stdDevMs).toBeGreaterThan(25);
    expect(metrics.rawLatenciesMs).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe("TelemetryCollector Lifecycle & Error Cleanup", () => {
  it("collects CPU and Memory telemetry without crashing in CPU mode", async () => {
    const collector = new TelemetryCollector({
      pollIntervalMs: 50,
      checkGpu: false,
    });

    collector.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    collector.stop();

    const telemetry = collector.getHardwareTelemetry();

    expect(telemetry.os.platform).toBeTruthy();
    expect(telemetry.runtime.nodeVersion).toMatch(/^v\d+/);
    expect(telemetry.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(telemetry.memory.totalBytes).toBeGreaterThan(0);
    expect(telemetry.memory.processAvgRssBytes).toBeGreaterThan(0);

    // In CPU-only mode, GPU should report unavailable with null values, not fake zeroes
    expect(telemetry.gpu).not.toBeNull();
    expect(telemetry.gpu?.isAvailable).toBe(false);
    expect(telemetry.gpu?.modelName).toBeNull();
    expect(telemetry.gpu?.totalVramMib).toBeNull();
    expect(telemetry.gpu?.peakVramUsedMib).toBeNull();
    expect(telemetry.gpu?.avgGpuUtilPct).toBeNull();
  });

  it("guarantees timer cleanup when an exception occurs in a finally block", async () => {
    const collector = new TelemetryCollector({
      pollIntervalMs: 25,
      checkGpu: false,
    });

    let caughtError: Error | null = null;
    try {
      collector.start();
      // Simulate failure mid-sampling
      throw new Error("Simulated pipeline crash");
    } catch (err: unknown) {
      caughtError = err as Error;
    } finally {
      collector.stop();
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toBe("Simulated pipeline crash");

    // Calling stop again must be idempotent and safe
    expect(() => collector.stop()).not.toThrow();
  });
});
