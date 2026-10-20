import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createMonitoringAlertEvaluator,
  dispatchAlertWebhook,
  loadMonitoringAlertConfig,
  MonitoringAlertConfigurationError,
  type MonitoringAlertConfig,
  type MonitoringAlertEvent,
} from "./alerts";

const baseConfig: MonitoringAlertConfig = {
  reframeInferenceLatencyThresholdSeconds: 2,
  dubbingLatencyThresholdSeconds: 10,
  reframeFailureRateThreshold: 0.25,
  dubbingFailureRateThreshold: 0.2,
  reframeQueueDepthThreshold: 10,
  dubbingQueueDepthThreshold: 5,
  failureRateObservationWindowSeconds: 300,
  failureRateMinimumJobs: 4,
  alertCooldownSeconds: 60,
};

const baseEnv: Record<string, string> = {
  MONITORING_REFRAME_INFERENCE_LATENCY_THRESHOLD_SECONDS: "2",
  MONITORING_DUBBING_LATENCY_THRESHOLD_SECONDS: "10",
  MONITORING_REFRAME_FAILURE_RATE_THRESHOLD: "0.25",
  MONITORING_DUBBING_FAILURE_RATE_THRESHOLD: "0.2",
  MONITORING_REFRAME_QUEUE_DEPTH_THRESHOLD: "10",
  MONITORING_DUBBING_QUEUE_DEPTH_THRESHOLD: "5",
  MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS: "300",
  MONITORING_FAILURE_RATE_MINIMUM_JOBS: "4",
  MONITORING_ALERT_COOLDOWN_SECONDS: "60",
};

const now = Date.parse("2026-10-19T12:00:00.000Z");

describe("Cost and usage monitoring alerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fires when GPU hours threshold is breached and recovers when usage drops", async () => {
    const config: MonitoringAlertConfig = {
      ...baseConfig,
      gpuHoursThreshold: 2.0, // 2 hours
      gpuHoursObservationWindowSeconds: 3600,
    };

    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    // Below threshold: 1.5 hours (5400s)
    const belowEvents = await evaluate({
      config,
      now,
      costWindowData: { gpuJobDurationSeconds: 5400 },
    });
    expect(belowEvents).toEqual([]);

    // Above threshold: 2.5 hours (9000s) -> firing
    const breachEvents = await evaluate({
      config,
      now: now + 1000,
      costWindowData: { gpuJobDurationSeconds: 9000 },
    });
    expect(breachEvents).toEqual([
      expect.objectContaining({
        name: "gpu_hours_threshold",
        pipeline: "reframe",
        observedValue: 2.5,
        threshold: 2.0,
        status: "firing",
      }),
    ]);

    // Dropped back below threshold -> resolved
    const recoveryEvents = await evaluate({
      config,
      now: now + 5000,
      costWindowData: { gpuJobDurationSeconds: 3600 },
    });
    expect(recoveryEvents).toEqual([
      expect.objectContaining({
        name: "gpu_hours_threshold",
        pipeline: "reframe",
        observedValue: 1.0,
        status: "resolved",
      }),
    ]);
  });

  it("fires when dubbing vendor estimated spend breaches threshold", async () => {
    const config: MonitoringAlertConfig = {
      ...baseConfig,
      dubbingVendorSpendThresholdUsd: 15.0, // $15 threshold
      dubbingVendorEstimatedUnitCostUsd: 0.0002, // $0.0002 per char
      dubbingVendorObservationWindowSeconds: 3600,
    };

    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    // 50,000 characters * 0.0002 = $10 (below $15)
    expect(
      await evaluate({
        config,
        now,
        costWindowData: { dubbingVendorUsage: 50_000 },
      })
    ).toEqual([]);

    // 100,000 characters * 0.0002 = $20 (above $15) -> firing
    const events = await evaluate({
      config,
      now: now + 1000,
      costWindowData: { dubbingVendorUsage: 100_000 },
    });
    expect(events).toEqual([
      expect.objectContaining({
        name: "dubbing_vendor_spend_threshold",
        pipeline: "dubbing",
        observedValue: 20.0,
        threshold: 15.0,
        status: "firing",
      }),
    ]);
  });

  it("fires when dubbing vendor raw usage threshold is breached", async () => {
    const config: MonitoringAlertConfig = {
      ...baseConfig,
      dubbingVendorUsageThreshold: 50_000,
      dubbingVendorObservationWindowSeconds: 3600,
    };

    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    // 40,000 characters -> below
    expect(
      await evaluate({
        config,
        now,
        costWindowData: { dubbingVendorUsage: 40_000 },
      })
    ).toEqual([]);

    // 60,000 characters -> above
    const events = await evaluate({
      config,
      now: now + 1000,
      costWindowData: { dubbingVendorUsage: 60_000 },
    });
    expect(events).toEqual([
      expect.objectContaining({
        name: "dubbing_vendor_usage_threshold",
        pipeline: "dubbing",
        observedValue: 60_000,
        threshold: 50_000,
        status: "firing",
      }),
    ]);
  });

  it("suppresses repeated firing within cooldown interval and refires after cooldown", async () => {
    const config: MonitoringAlertConfig = {
      ...baseConfig,
      gpuHoursThreshold: 1.0,
      gpuHoursObservationWindowSeconds: 3600,
      alertCooldownSeconds: 60,
    };

    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    // Initial breach at t=0
    const first = await evaluate({
      config,
      now,
      costWindowData: { gpuJobDurationSeconds: 7200 }, // 2 hours
    });
    expect(first).toHaveLength(1);

    // Repeated evaluation at t=30s (still within 60s cooldown) -> suppressed
    const duringCooldown = await evaluate({
      config,
      now: now + 30_000,
      costWindowData: { gpuJobDurationSeconds: 7200 },
    });
    expect(duringCooldown).toEqual([]);

    // Evaluation after cooldown at t=65s -> fires again
    const afterCooldown = await evaluate({
      config,
      now: now + 65_000,
      costWindowData: { gpuJobDurationSeconds: 7200 },
    });
    expect(afterCooldown).toHaveLength(1);
    expect(afterCooldown[0]).toMatchObject({
      name: "gpu_hours_threshold",
      status: "firing",
    });
  });

  it("dispatches webhook notifications with bounded timeout and safe headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    const event: MonitoringAlertEvent = {
      name: "gpu_hours_threshold",
      pipeline: "reframe",
      severity: "warning",
      observedValue: 3.5,
      threshold: 2.0,
      timestamp: new Date(now).toISOString(),
      status: "firing",
    };

    const success = await dispatchAlertWebhook("https://monitoring.example.com/webhook", event);
    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://monitoring.example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })
    );
  });

  it("handles webhook failures gracefully without throwing", async () => {
    const logWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const event: MonitoringAlertEvent = {
      name: "dubbing_vendor_spend_threshold",
      pipeline: "dubbing",
      severity: "warning",
      observedValue: 50.0,
      threshold: 20.0,
      timestamp: new Date(now).toISOString(),
      status: "firing",
    };

    const success = await dispatchAlertWebhook("https://monitoring.example.com/webhook", event);
    expect(success).toBe(false);
    expect(logWarn).toHaveBeenCalled();
  });

  describe("Cost alert configuration validation", () => {
    it("loads valid GPU and dubbing vendor alert configuration", () => {
      const validEnv = {
        ...baseEnv,
        MONITORING_GPU_HOURS_THRESHOLD: "5.5",
        MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "3600",
        MONITORING_DUBBING_VENDOR_SPEND_THRESHOLD_USD: "50",
        MONITORING_DUBBING_VENDOR_USAGE_THRESHOLD: "200000",
        MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS: "3600",
        MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD: "0.00025",
        MONITORING_ALERT_WEBHOOK_URL: "https://alerts.internal.net/api",
      };

      const loaded = loadMonitoringAlertConfig(validEnv);
      expect(loaded.gpuHoursThreshold).toBe(5.5);
      expect(loaded.gpuHoursObservationWindowSeconds).toBe(3600);
      expect(loaded.dubbingVendorSpendThresholdUsd).toBe(50);
      expect(loaded.dubbingVendorUsageThreshold).toBe(200000);
      expect(loaded.dubbingVendorObservationWindowSeconds).toBe(3600);
      expect(loaded.dubbingVendorEstimatedUnitCostUsd).toBe(0.00025);
      expect(loaded.alertWebhookUrl).toBe("https://alerts.internal.net/api");
    });

    it("rejects missing pricing when spend threshold is configured", () => {
      const missingPricingEnv = {
        ...baseEnv,
        MONITORING_DUBBING_VENDOR_SPEND_THRESHOLD_USD: "50",
        MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS: "3600",
        // Notice MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD is missing!
      };

      expect(() => loadMonitoringAlertConfig(missingPricingEnv)).toThrow(
        MonitoringAlertConfigurationError
      );
    });

    it("rejects non-positive and invalid thresholds", () => {
      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_GPU_HOURS_THRESHOLD: "-1",
          MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "3600",
        })
      ).toThrow(MonitoringAlertConfigurationError);

      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_GPU_HOURS_THRESHOLD: "not_a_number",
          MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "3600",
        })
      ).toThrow(MonitoringAlertConfigurationError);

      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_GPU_HOURS_THRESHOLD: "5",
          MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "45", // not a whole minute
        })
      ).toThrow(MonitoringAlertConfigurationError);
    });

    it("rejects invalid webhook URLs", () => {
      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_ALERT_WEBHOOK_URL: "ftp://invalid-protocol",
        })
      ).toThrow(MonitoringAlertConfigurationError);

      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_ALERT_WEBHOOK_URL: "just-a-string-not-url",
        })
      ).toThrow(MonitoringAlertConfigurationError);
    });
  });
});
