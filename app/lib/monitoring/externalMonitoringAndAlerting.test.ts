import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createMonitoringAlertEvaluator,
  loadMonitoringAlertConfig,
  MonitoringAlertConfigurationError,
  type MonitoringAlertConfig,
} from "./alerts";
import * as externalNotifications from "./externalNotifications";

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

const now = Date.parse("2026-11-02T12:00:00.000Z");

describe("Task-00105: External Monitoring and Alerting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Configuration validation", () => {
    it("loads stuck queue and GPU spend thresholds from environment", () => {
      const config = loadMonitoringAlertConfig({
        ...baseEnv,
        MONITORING_REFRAME_STUCK_QUEUE_THRESHOLD_SECONDS: "180",
        MONITORING_DUBBING_STUCK_QUEUE_THRESHOLD_SECONDS: "300",
        MONITORING_GPU_SPEND_THRESHOLD_USD: "25.5",
        MONITORING_GPU_HOURLY_RATE_USD: "0.7104",
        MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "3600",
        MONITORING_ALERT_EMAIL_RECIPIENT: "oncall@marvedge.com",
        RESEND_API_KEY: "re_valid_key_123",
        MONITORING_ALERT_DRY_RUN: "true",
      });

      expect(config.reframeStuckQueueThresholdSeconds).toBe(180);
      expect(config.dubbingStuckQueueThresholdSeconds).toBe(300);
      expect(config.gpuSpendThresholdUsd).toBe(25.5);
      expect(config.gpuHourlyRateUsd).toBe(0.7104);
      expect(config.alertEmailRecipient).toBe("oncall@marvedge.com");
      expect(config.resendApiKey).toBe("re_valid_key_123");
      expect(config.alertDryRun).toBe(true);
    });

    it("rejects GPU spend threshold when hourly rate is missing", () => {
      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_GPU_SPEND_THRESHOLD_USD: "25.0",
          MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS: "3600",
        })
      ).toThrow(MonitoringAlertConfigurationError);
    });

    it("rejects email recipient when Resend API key is missing", () => {
      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_ALERT_EMAIL_RECIPIENT: "oncall@marvedge.com",
        })
      ).toThrow(MonitoringAlertConfigurationError);
    });

    it("rejects invalid webhook URL protocol", () => {
      expect(() =>
        loadMonitoringAlertConfig({
          ...baseEnv,
          MONITORING_ALERT_WEBHOOK_URL: "ftp://alerts.example.com/webhook",
        })
      ).toThrow(MonitoringAlertConfigurationError);
    });
  });

  describe("Stuck queue alert evaluation", () => {
    it("fires when queue age exceeds threshold and resolves when cleared", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        reframeStuckQueueThresholdSeconds: 120, // 2 minutes
        dubbingStuckQueueThresholdSeconds: 300, // 5 minutes
      };

      const sendNotificationSpy = vi
        .spyOn(externalNotifications, "sendExternalAlertNotification")
        .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

      const evaluate = createMonitoringAlertEvaluator(vi.fn());

      // Normal inactivity / below threshold: reframe age 45s, dubbing age 0s (idle)
      const belowEvents = await evaluate({
        config,
        now,
        stuckQueueAges: { reframe: 45, dubbing: 0 },
      });
      expect(belowEvents).toEqual([]);
      expect(sendNotificationSpy).not.toHaveBeenCalled();

      // Breach: reframe age 150s (> 120s) -> firing
      const firingEvents = await evaluate({
        config,
        now: now + 5000,
        stuckQueueAges: { reframe: 150, dubbing: 0 },
      });
      expect(firingEvents).toEqual([
        expect.objectContaining({
          name: "reframe_stuck_queue",
          pipeline: "reframe",
          observedValue: 150,
          threshold: 120,
          status: "firing",
        }),
      ]);
      expect(sendNotificationSpy).toHaveBeenCalledOnce();

      // Recovery: reframe age drops back to 10s -> resolved
      const resolvedEvents = await evaluate({
        config,
        now: now + 10_000,
        stuckQueueAges: { reframe: 10, dubbing: 0 },
      });
      expect(resolvedEvents).toEqual([
        expect.objectContaining({
          name: "reframe_stuck_queue",
          pipeline: "reframe",
          observedValue: 10,
          threshold: 120,
          status: "resolved",
        }),
      ]);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(2);
    });

    it("does not trigger false alert when queue is completely idle (0s age)", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        reframeStuckQueueThresholdSeconds: 60,
      };

      const evaluate = createMonitoringAlertEvaluator(vi.fn());

      // Idle queue: age 0
      const events = await evaluate({
        config,
        now,
        stuckQueueAges: { reframe: 0 },
      });
      expect(events).toEqual([]);
    });

    it("handles missing queue data without throwing or false alarming", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        reframeStuckQueueThresholdSeconds: 60,
        dubbingStuckQueueThresholdSeconds: 60,
      };

      const evaluate = createMonitoringAlertEvaluator(vi.fn());

      // Queues unavailable / disconnected
      const events = await evaluate({
        config,
        now,
        stuckQueueAges: undefined,
      });
      expect(events).toEqual([]);
    });
  });

  describe("GPU spend threshold alert evaluation", () => {
    it("fires when estimated GPU spend breaches threshold and resolves upon drop", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        gpuSpendThresholdUsd: 10.0, // $10 threshold
        gpuHourlyRateUsd: 2.0, // $2.00 / hour
        gpuHoursObservationWindowSeconds: 3600,
      };

      const sendNotificationSpy = vi
        .spyOn(externalNotifications, "sendExternalAlertNotification")
        .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

      const evaluate = createMonitoringAlertEvaluator(vi.fn());

      // 3 hours runtime * $2.00/hr = $6.00 (below $10 threshold)
      const belowEvents = await evaluate({
        config,
        now,
        costWindowData: { gpuJobDurationSeconds: 3 * 3600 },
      });
      expect(belowEvents).toEqual([]);

      // 6 hours runtime * $2.00/hr = $12.00 (breaches $10 threshold) -> firing
      const breachEvents = await evaluate({
        config,
        now: now + 1000,
        costWindowData: { gpuJobDurationSeconds: 6 * 3600 },
      });
      expect(breachEvents).toEqual([
        expect.objectContaining({
          name: "gpu_spend_threshold",
          pipeline: "reframe",
          observedValue: 12.0,
          threshold: 10.0,
          status: "firing",
        }),
      ]);
      expect(sendNotificationSpy).toHaveBeenCalledOnce();

      // Usage drops: 2 hours runtime * $2.00/hr = $4.00 -> resolved
      const resolvedEvents = await evaluate({
        config,
        now: now + 5000,
        costWindowData: { gpuJobDurationSeconds: 2 * 3600 },
      });
      expect(resolvedEvents).toEqual([
        expect.objectContaining({
          name: "gpu_spend_threshold",
          pipeline: "reframe",
          observedValue: 4.0,
          threshold: 10.0,
          status: "resolved",
        }),
      ]);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(2);
    });

    it("gracefully ignores evaluation when cost window data is missing", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        gpuSpendThresholdUsd: 10.0,
        gpuHourlyRateUsd: 2.0,
        gpuHoursObservationWindowSeconds: 3600,
      };

      const evaluate = createMonitoringAlertEvaluator(vi.fn());
      const events = await evaluate({
        config,
        now,
        costWindowData: undefined,
      });
      expect(events).toEqual([]);
    });
  });

  describe("Deduplication and cooldown", () => {
    it("suppresses repeated notifications during cooldown and emits recovery notification", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        reframeStuckQueueThresholdSeconds: 60,
        alertCooldownSeconds: 120, // 2 minutes cooldown
      };

      const sendNotificationSpy = vi
        .spyOn(externalNotifications, "sendExternalAlertNotification")
        .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

      const evaluate = createMonitoringAlertEvaluator(vi.fn());

      // First breach: firing (t = 0)
      const firstBreach = await evaluate({
        config,
        now,
        stuckQueueAges: { reframe: 100 },
      });
      expect(firstBreach).toHaveLength(1);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(1);

      // Second breach during cooldown (t = 30s): suppressed
      const duringCooldown = await evaluate({
        config,
        now: now + 30_000,
        stuckQueueAges: { reframe: 120 },
      });
      expect(duringCooldown).toHaveLength(0);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(1);

      // Third breach after cooldown (t = 130s): refires
      const afterCooldown = await evaluate({
        config,
        now: now + 130_000,
        stuckQueueAges: { reframe: 140 },
      });
      expect(afterCooldown).toHaveLength(1);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(2);

      // Queue clears (t = 150s): sends recovery
      const recovered = await evaluate({
        config,
        now: now + 150_000,
        stuckQueueAges: { reframe: 10 },
      });
      expect(recovered).toHaveLength(1);
      expect(recovered[0].status).toBe("resolved");
      expect(sendNotificationSpy).toHaveBeenCalledTimes(3);
    });

    it("resets deduplication state when a new evaluator instance is initialized", async () => {
      const config: MonitoringAlertConfig = {
        ...baseConfig,
        reframeStuckQueueThresholdSeconds: 60,
        alertCooldownSeconds: 300,
      };

      const sendNotificationSpy = vi
        .spyOn(externalNotifications, "sendExternalAlertNotification")
        .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

      // Instance 1 fires
      const eval1 = createMonitoringAlertEvaluator(vi.fn());
      await eval1({ config, now, stuckQueueAges: { reframe: 100 } });
      expect(sendNotificationSpy).toHaveBeenCalledTimes(1);

      // Instance 2 (e.g. process restart) fires again immediately because state is process-local
      const eval2 = createMonitoringAlertEvaluator(vi.fn());
      await eval2({ config, now: now + 10_000, stuckQueueAges: { reframe: 100 } });
      expect(sendNotificationSpy).toHaveBeenCalledTimes(2);
    });
  });
});
