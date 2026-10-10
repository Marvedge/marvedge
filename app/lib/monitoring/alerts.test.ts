import { beforeEach, describe, expect, it, vi } from "vitest";
import { dubbingDurationSeconds, queueDepth, reframeInferenceDurationSeconds } from "./metrics";
import {
  calculateWindowedFailureRate,
  createMonitoringAlertEvaluator,
  evaluateMonitoringAlerts,
  loadMonitoringAlertConfig,
  MonitoringAlertConfigurationError,
  type MonitoringAlertConfig,
} from "./alerts";

const config: MonitoringAlertConfig = {
  reframeInferenceLatencyThresholdSeconds: 2,
  dubbingLatencyThresholdSeconds: 10,
  reframeFailureRateThreshold: 0.25,
  dubbingFailureRateThreshold: 0.25,
  reframeQueueDepthThreshold: 10,
  dubbingQueueDepthThreshold: 10,
  failureRateObservationWindowSeconds: 300,
  failureRateMinimumJobs: 4,
  alertCooldownSeconds: 60,
};

const completeEnvironment: Record<string, string | undefined> = {
  MONITORING_REFRAME_INFERENCE_LATENCY_THRESHOLD_SECONDS: "2",
  MONITORING_DUBBING_LATENCY_THRESHOLD_SECONDS: "10",
  MONITORING_REFRAME_FAILURE_RATE_THRESHOLD: "0.25",
  MONITORING_DUBBING_FAILURE_RATE_THRESHOLD: "0.25",
  MONITORING_REFRAME_QUEUE_DEPTH_THRESHOLD: "10",
  MONITORING_DUBBING_QUEUE_DEPTH_THRESHOLD: "10",
  MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS: "300",
  MONITORING_FAILURE_RATE_MINIMUM_JOBS: "4",
  MONITORING_ALERT_COOLDOWN_SECONDS: "60",
};

const now = Date.parse("2026-10-08T12:00:00.000Z");

describe("monitoring alert evaluation", () => {
  beforeEach(() => {
    reframeInferenceDurationSeconds.reset();
    dubbingDurationSeconds.reset();
    queueDepth.reset();
  });

  it("does not fire for reframe inference latency below its mean threshold", async () => {
    reframeInferenceDurationSeconds.observe({ status: "success" }, 1);
    reframeInferenceDurationSeconds.observe({ status: "failure" }, 1.5);

    const evaluate = createMonitoringAlertEvaluator(vi.fn());
    await expect(evaluate({ config, now })).resolves.toEqual([]);
  });

  it("fires for reframe inference latency above its mean threshold", async () => {
    reframeInferenceDurationSeconds.observe({ status: "success" }, 4);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(evaluate({ config, now })).resolves.toEqual([
      expect.objectContaining({
        name: "reframe_inference_latency",
        pipeline: "reframe",
        observedValue: 4,
        threshold: 2,
        status: "firing",
      }),
    ]);
  });

  it("does not fire for dubbing latency below its mean threshold", async () => {
    dubbingDurationSeconds.observe({ status: "success" }, 5);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(evaluate({ config, now })).resolves.toEqual([]);
  });

  it("fires for dubbing latency above its mean threshold", async () => {
    dubbingDurationSeconds.observe({ status: "failure" }, 15);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(evaluate({ config, now })).resolves.toEqual([
      expect.objectContaining({
        name: "dubbing_processing_latency",
        pipeline: "dubbing",
        observedValue: 15,
        threshold: 10,
        status: "firing",
      }),
    ]);
  });

  it("calculates reframe failure rate inside the configured window", async () => {
    const evaluate = createMonitoringAlertEvaluator(vi.fn());
    const base = { completed: 8, failed: 1, windowSeconds: 300 };

    await expect(
      evaluate({
        config,
        now,
        failureRateWindowCounts: { reframe: base },
      })
    ).resolves.toEqual([]);

    const events = await evaluate({
      config,
      now: now + 1000,
      failureRateWindowCounts: {
        reframe: { completed: 3, failed: 2, windowSeconds: 300 },
      },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "reframe_job_failure_rate",
        pipeline: "reframe",
        observedValue: 0.4,
        threshold: 0.25,
        status: "firing",
      })
    );
  });

  it("does not alert for zero jobs or insufficient window observations", async () => {
    expect(
      calculateWindowedFailureRate({ completed: 0, failed: 0, windowSeconds: 300 }, 4, 300)
    ).toBeUndefined();
    expect(
      calculateWindowedFailureRate({ completed: 2, failed: 1, windowSeconds: 300 }, 4, 300)
    ).toBeUndefined();

    const evaluate = createMonitoringAlertEvaluator(vi.fn());
    await expect(
      evaluate({
        config,
        now,
        failureRateWindowCounts: {
          reframe: { completed: 0, failed: 0, windowSeconds: 300 },
        },
      })
    ).resolves.toEqual([]);
  });

  it("calculates dubbing failure rate below and above threshold", async () => {
    const evaluate = createMonitoringAlertEvaluator(vi.fn());
    await expect(
      evaluate({
        config,
        now,
        failureRateWindowCounts: {
          dubbing: { completed: 9, failed: 1, windowSeconds: 300 },
        },
      })
    ).resolves.toEqual([]);

    await expect(
      evaluate({
        config,
        now: now + 1000,
        failureRateWindowCounts: {
          dubbing: { completed: 4, failed: 2, windowSeconds: 300 },
        },
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        name: "dubbing_job_failure_rate",
        pipeline: "dubbing",
        observedValue: 1 / 3,
        status: "firing",
      })
    );
  });

  it("collects BullMQ window data for the production alert evaluation path", async () => {
    const createOutcomeQueue = (failed: number[]) => ({
      getMetrics: vi.fn(async (type: "completed" | "failed") => ({
        meta: { count: 10, prevTS: now - 30_000, prevCount: 5 },
        data: type === "completed" ? [1, 1, 1, 1, 1] : failed,
        count: 5,
      })),
    });
    const reframe = createOutcomeQueue([2, 0, 0, 0, 0]);
    const dubbing = createOutcomeQueue([0, 0, 0, 0, 0]);

    const events = await evaluateMonitoringAlerts({
      config,
      now,
      failureRateQueues: { reframe, dubbing },
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        name: "reframe_job_failure_rate",
        observedValue: 2 / 7,
        status: "firing",
      })
    );
  });

  it("uses waiting queue depth and handles below-threshold and zero depths", async () => {
    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 9);
    queueDepth.set({ pipeline: "dubbing", state: "waiting" }, 0);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(evaluate({ config, now })).resolves.toEqual([]);
  });

  it("fires when either pipeline waiting queue exceeds its threshold", async () => {
    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 11);
    queueDepth.set({ pipeline: "dubbing", state: "waiting" }, 12);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(evaluate({ config, now })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "reframe_queue_depth",
          pipeline: "reframe",
          observedValue: 11,
          status: "firing",
        }),
        expect.objectContaining({
          name: "dubbing_queue_depth",
          pipeline: "dubbing",
          observedValue: 12,
          status: "firing",
        }),
      ])
    );
  });

  it("suppresses repeated firing, emits resolution, and can fire after cooldown", async () => {
    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 11);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    const first = await evaluate({ config, now });
    expect(first).toHaveLength(1);
    expect(await evaluate({ config, now: now + 10_000 })).toEqual([]);

    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 0);
    await expect(evaluate({ config, now: now + 20_000 })).resolves.toContainEqual(
      expect.objectContaining({ name: "reframe_queue_depth", status: "resolved" })
    );

    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 12);
    await expect(evaluate({ config, now: now + 30_000 })).resolves.toEqual([]);
    await expect(evaluate({ config, now: now + 61_000 })).resolves.toContainEqual(
      expect.objectContaining({
        name: "reframe_queue_depth",
        status: "firing",
        observedValue: 12,
      })
    );
  });

  it("requires all configured variables and rejects invalid values", () => {
    expect(loadMonitoringAlertConfig(completeEnvironment)).toEqual(config);

    const missing = { ...completeEnvironment };
    delete missing.MONITORING_DUBBING_LATENCY_THRESHOLD_SECONDS;
    expect(() => loadMonitoringAlertConfig(missing)).toThrow(MonitoringAlertConfigurationError);

    expect(() =>
      loadMonitoringAlertConfig({
        ...completeEnvironment,
        MONITORING_REFRAME_FAILURE_RATE_THRESHOLD: "1.2",
      })
    ).toThrow(MonitoringAlertConfigurationError);
    expect(() =>
      loadMonitoringAlertConfig({
        ...completeEnvironment,
        MONITORING_REFRAME_QUEUE_DEPTH_THRESHOLD: "0",
      })
    ).toThrow(MonitoringAlertConfigurationError);
    expect(() =>
      loadMonitoringAlertConfig({
        ...completeEnvironment,
        MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS: "90",
      })
    ).toThrow(MonitoringAlertConfigurationError);
  });
});
