import { describe, expect, it } from "vitest";
import { calculatePercentiles, safeParseGpuMetric, TelemetryCollector } from "../telemetry";

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

describe("safeParseGpuMetric", () => {
  it("parses valid numeric values and floats", () => {
    expect(safeParseGpuMetric("45.6")).toBe(45.6);
    expect(safeParseGpuMetric("1200")).toBe(1200);
    expect(safeParseGpuMetric(78.5)).toBe(78.5);
  });

  it("preserves actual numeric 0 as 0 and does not convert to null", () => {
    expect(safeParseGpuMetric("0")).toBe(0);
    expect(safeParseGpuMetric("0.0")).toBe(0);
    expect(safeParseGpuMetric(0)).toBe(0);
  });

  it("safely strips trailing units", () => {
    expect(safeParseGpuMetric("1024 MiB")).toBe(1024);
    expect(safeParseGpuMetric("85 %")).toBe(85);
    expect(safeParseGpuMetric("65 C")).toBe(65);
    expect(safeParseGpuMetric("0 %")).toBe(0);
  });

  it("returns null for unsupported N/A variants", () => {
    expect(safeParseGpuMetric("N/A")).toBeNull();
    expect(safeParseGpuMetric("n/a")).toBeNull();
    expect(safeParseGpuMetric(" [Not Supported] ")).toBeNull();
    expect(safeParseGpuMetric("[NOT SUPPORTED]")).toBeNull();
    expect(safeParseGpuMetric("NOT SUPPORTED")).toBeNull();
  });

  it("returns null for empty or malformed strings and non-finite numbers", () => {
    expect(safeParseGpuMetric("")).toBeNull();
    expect(safeParseGpuMetric("   ")).toBeNull();
    expect(safeParseGpuMetric("invalid_str")).toBeNull();
    expect(safeParseGpuMetric(NaN)).toBeNull();
    expect(safeParseGpuMetric(Infinity)).toBeNull();
    expect(safeParseGpuMetric(null)).toBeNull();
    expect(safeParseGpuMetric(undefined)).toBeNull();
  });
});

describe("TelemetryCollector GPU Aggregation & Lifecycle", () => {
  it("calculates averages and peaks from valid numeric samples only", () => {
    const collector = new TelemetryCollector({ checkGpu: false });
    // Simulate detected GPU
    (collector as unknown as { gpuAvailable: boolean; gpuModelName: string }).gpuAvailable = true;
    (collector as unknown as { gpuModelName: string }).gpuModelName = "Test NVIDIA L4";

    // Record mixed valid, zero, and N/A samples
    collector.recordGpuSample({
      memUsedMib: "500",
      memTotalMib: "24000",
      gpuUtilPct: "0", // actual zero
      tempC: "45",
    });
    collector.recordGpuSample({
      memUsedMib: "N/A", // unsupported metric
      memTotalMib: "24000",
      gpuUtilPct: "50 %",
      tempC: "[Not Supported]",
    });
    collector.recordGpuSample({
      memUsedMib: "1500 MiB",
      memTotalMib: "24000",
      gpuUtilPct: "100",
      tempC: "55 C",
    });

    const tele = collector.getHardwareTelemetry();
    expect(tele.gpu?.isAvailable).toBe(true);
    expect(tele.gpu?.totalVramMib).toBe(24000);
    // VRAM used: average of 500 and 1500 = 1000
    expect(tele.gpu?.avgVramUsedMib).toBe(1000);
    expect(tele.gpu?.peakVramUsedMib).toBe(1500);
    // Util: 0, 50, 100 -> avg 50, peak 100
    expect(tele.gpu?.avgGpuUtilPct).toBe(50);
    expect(tele.gpu?.peakGpuUtilPct).toBe(100);
    // Temp: 45, 55 -> max 55
    expect(tele.gpu?.maxTempC).toBe(55);
  });

  it("reports null when no valid samples exist for a metric instead of fake zeroes", () => {
    const collector = new TelemetryCollector({ checkGpu: false });
    (collector as unknown as { gpuAvailable: boolean }).gpuAvailable = true;

    collector.recordGpuSample({
      memUsedMib: "N/A",
      memTotalMib: "[Not Supported]",
      gpuUtilPct: "N/A",
      tempC: "N/A",
    });

    const tele = collector.getHardwareTelemetry();
    expect(tele.gpu?.isAvailable).toBe(true);
    expect(tele.gpu?.totalVramMib).toBeNull();
    expect(tele.gpu?.avgVramUsedMib).toBeNull();
    expect(tele.gpu?.peakVramUsedMib).toBeNull();
    expect(tele.gpu?.avgGpuUtilPct).toBeNull();
    expect(tele.gpu?.peakGpuUtilPct).toBeNull();
    expect(tele.gpu?.maxTempC).toBeNull();
  });

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
      throw new Error("Simulated pipeline crash");
    } catch (err: unknown) {
      caughtError = err as Error;
    } finally {
      collector.stop();
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toBe("Simulated pipeline crash");
    expect(() => collector.stop()).not.toThrow();
  });
});
