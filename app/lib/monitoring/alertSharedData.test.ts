import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMonitoringAlertEvaluator, type MonitoringAlertConfig } from "./alerts";
import { dubbingDurationSeconds, queueDepth, reframeInferenceDurationSeconds } from "./metrics";

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

describe("monitoring alerts with shared observations", () => {
  beforeEach(() => {
    reframeInferenceDurationSeconds.reset();
    dubbingDurationSeconds.reset();
    queueDepth.reset();
  });

  it("prefers the shared Redis latency window over process-local histograms", async () => {
    reframeInferenceDurationSeconds.observe({ status: "success" }, 50);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(
      evaluate({
        config,
        latencyWindowMeans: { reframe: 1, dubbing: 14 },
      })
    ).resolves.toContainEqual(
      expect.objectContaining({
        name: "dubbing_processing_latency",
        observedValue: 14,
        status: "firing",
      })
    );
  });

  it("skips queue-depth evaluation when the latest Redis collection failed", async () => {
    queueDepth.set({ pipeline: "reframe", state: "waiting" }, 50);
    const evaluate = createMonitoringAlertEvaluator(vi.fn());

    await expect(
      evaluate({
        config,
        queueDepthAvailability: { reframe: false, dubbing: true },
      })
    ).resolves.toEqual([]);
  });
});
