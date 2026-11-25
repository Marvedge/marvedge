import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMonitoringAlertEvaluator,
  type MonitoringAlertConfig,
  type MonitoringAlertEvent,
} from "./alerts";
import { InMemoryAlertStateStore } from "./alertStateStore";
import { formatAlertMessage, sendExternalAlertNotification } from "./externalNotifications";

describe("Task-00130 Isolated Alert Validation Suite", () => {
  const baseTestConfig: MonitoringAlertConfig = {
    reframeInferenceLatencyThresholdSeconds: 10,
    dubbingLatencyThresholdSeconds: 120,
    reframeFailureRateThreshold: 0.2, // 20%
    dubbingFailureRateThreshold: 0.2, // 20%
    reframeQueueDepthThreshold: 100,
    dubbingQueueDepthThreshold: 50,
    failureRateObservationWindowSeconds: 300,
    failureRateMinimumJobs: 10,
    alertCooldownSeconds: 300,
    reframeStuckQueueThresholdSeconds: 300,
    dubbingStuckQueueThresholdSeconds: 600,
    gpuSpendThresholdUsd: 25.0,
    gpuHoursObservationWindowSeconds: 3600,
    gpuHourlyRateUsd: 0.7104,
    dubbingVendorSpendThresholdUsd: 50.0,
    dubbingVendorObservationWindowSeconds: 3600,
    dubbingVendorEstimatedUnitCostUsd: 0.0003,
    alertDryRun: true,
  };

  it("Scenario 1: Job Failure Rate - Firing, Cooldown Suppression, and Recovery", async () => {
    const store = new InMemoryAlertStateStore();
    const evaluator = createMonitoringAlertEvaluator(undefined, store);
    const eventsEmitted: MonitoringAlertEvent[] = [];

    const mockEmit = (event: MonitoringAlertEvent) => {
      eventsEmitted.push(event);
    };

    let currentTime = 1700000000000;

    // 1.1: Breach failure rate (3 failed out of 10 = 30% > 20% threshold)
    const firingEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      emit: mockEmit,
      failureRateWindowCounts: {
        reframe: { completed: 7, failed: 3, windowSeconds: 300 },
      },
    });

    const failureAlert = firingEvents.find((e) => e.name === "reframe_job_failure_rate");
    expect(failureAlert).toBeDefined();
    expect(failureAlert?.status).toBe("firing");
    expect(failureAlert?.observedValue).toBeCloseTo(0.3);
    expect(failureAlert?.threshold).toBe(0.2);

    // 1.2: Check formatting
    const formatted = formatAlertMessage(failureAlert!);
    expect(formatted.subject).toContain("[FIRING: WARNING] reframe_job_failure_rate (reframe)");
    expect(formatted.text).toContain("Observed Value: 30.0%");
    expect(formatted.text).toContain("Configured Threshold: 20.0%");

    // 1.3: Verify dry-run dispatch
    const dispatchResult = await sendExternalAlertNotification(failureAlert!, {
      alertDryRun: true,
      alertEmailRecipient: "test@example.com",
    });
    expect(dispatchResult.dryRun).toBe(true);
    expect(dispatchResult.emailSent).toBe(false);
    expect(dispatchResult.webhookSent).toBe(false);

    // 1.4: Cooldown suppression (100 seconds later, still breached)
    currentTime += 100_000;
    const suppressedEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      emit: mockEmit,
      failureRateWindowCounts: {
        reframe: { completed: 7, failed: 3, windowSeconds: 300 },
      },
    });
    expect(suppressedEvents.find((e) => e.name === "reframe_job_failure_rate")).toBeUndefined();

    // 1.5: Recovery (failure rate drops to 1 out of 10 = 10% <= 20% threshold)
    currentTime += 250_000; // Total 350s later
    const recoveryEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      emit: mockEmit,
      failureRateWindowCounts: {
        reframe: { completed: 9, failed: 1, windowSeconds: 300 },
      },
    });
    const recoveryAlert = recoveryEvents.find((e) => e.name === "reframe_job_failure_rate");
    expect(recoveryAlert).toBeDefined();
    expect(recoveryAlert?.status).toBe("resolved");
    expect(recoveryAlert?.observedValue).toBeCloseTo(0.1);

    const formattedRecovery = formatAlertMessage(recoveryAlert!);
    expect(formattedRecovery.subject).toContain(
      "[RESOLVED] reframe_job_failure_rate (reframe) recovered"
    );
    expect(formattedRecovery.text).toContain("Observed Value: 10.0%");
  });

  it("Scenario 2: Stuck Queue - Inactivity Safety, Firing, and Recovery", async () => {
    const store = new InMemoryAlertStateStore();
    const evaluator = createMonitoringAlertEvaluator(undefined, store);
    let currentTime = 1700000000000;

    // 2.1: Queue is empty / idle (age is 0s) -> Must NOT fire
    const idleEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      stuckQueueAges: { reframe: 0 },
    });
    expect(idleEvents.find((e) => e.name === "reframe_stuck_queue")).toBeUndefined();

    // 2.2: Queue stuck for 450 seconds (> 300s threshold) -> Must fire
    currentTime += 60_000;
    const firingEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      stuckQueueAges: { reframe: 450 },
    });
    const stuckAlert = firingEvents.find((e) => e.name === "reframe_stuck_queue");
    expect(stuckAlert).toBeDefined();
    expect(stuckAlert?.status).toBe("firing");
    expect(stuckAlert?.observedValue).toBe(450);

    const formatted = formatAlertMessage(stuckAlert!);
    expect(formatted.subject).toContain("[FIRING: WARNING] reframe_stuck_queue (reframe)");
    expect(formatted.text).toContain("Observed Value: 450.0s");

    // 2.3: Queue drains / completes -> Age returns to 0s -> Must recover
    currentTime += 60_000;
    const recoveryEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      stuckQueueAges: { reframe: 0 },
    });
    const recoveryAlert = recoveryEvents.find((e) => e.name === "reframe_stuck_queue");
    expect(recoveryAlert).toBeDefined();
    expect(recoveryAlert?.status).toBe("resolved");
    expect(recoveryAlert?.observedValue).toBe(0);
  });

  it("Scenario 3: GPU & Vendor Spend - Estimated Cost Notice, Firing, and Recovery", async () => {
    const store = new InMemoryAlertStateStore();
    const evaluator = createMonitoringAlertEvaluator(undefined, store);
    let currentTime = 1700000000000;

    // 3.1: GPU Spend breach ($35.52 > $25.00 threshold)
    // 180,000 active worker seconds = 50 hours * $0.7104/hr = $35.52
    const firingEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      costWindowData: {
        gpuJobDurationSeconds: 180_000,
        dubbingVendorUsage: 0,
      },
    });
    const spendAlert = firingEvents.find((e) => e.name === "gpu_spend_threshold");
    expect(spendAlert).toBeDefined();
    expect(spendAlert?.status).toBe("firing");
    expect(spendAlert?.observedValue).toBeCloseTo(35.52);

    // 3.2: Verify mandatory ESTIMATED COST NOTICE disclaimer in formatting
    const formatted = formatAlertMessage(spendAlert!);
    expect(formatted.subject).toContain("[FIRING: WARNING] gpu_spend_threshold (reframe)");
    expect(formatted.text).toContain("Observed Value: $35.52");
    expect(formatted.text).toContain("⚠️ ESTIMATED COST NOTICE");
    expect(formatted.text).toContain(
      "It represents an operational estimate, not an official cloud or vendor billing invoice."
    );
    expect(formatted.html).toContain("Estimated Cost Notice:");
    expect(
      formatted.slackPayload.blocks.some((b) =>
        JSON.stringify(b).includes("Note: Operational estimate")
      )
    ).toBe(true);

    // 3.3: Spend drops below threshold ($14.21 <= $25.00) -> Recovery
    currentTime += 60_000;
    const recoveryEvents = await evaluator({
      config: baseTestConfig,
      now: currentTime,
      costWindowData: {
        gpuJobDurationSeconds: 72_000, // 20 hours * $0.7104 = $14.21
        dubbingVendorUsage: 0,
      },
    });
    const recoveryAlert = recoveryEvents.find((e) => e.name === "gpu_spend_threshold");
    expect(recoveryAlert).toBeDefined();
    expect(recoveryAlert?.status).toBe("resolved");
    expect(recoveryAlert?.observedValue).toBeCloseTo(14.21);
  });

  it("Scenario 4: Missing Telemetry Safety - Never Treated as Healthy", async () => {
    const store = new InMemoryAlertStateStore();
    const evaluator = createMonitoringAlertEvaluator(undefined, store);

    // When monitoring data is unavailable, pipeline alerts must NOT fire or be marked healthy,
    // and monitoring_data_unavailable must fire.
    const events = await evaluator({
      config: baseTestConfig,
      monitoringDataUnavailable: true,
      monitoringDataUnavailableReason: "Redis connection timeout",
    });

    const unavailableAlert = events.find((e) => e.name === "monitoring_data_unavailable");
    expect(unavailableAlert).toBeDefined();
    expect(unavailableAlert?.status).toBe("firing");
    expect(unavailableAlert?.pipeline).toBe("monitoring");

    // Reframe / dubbing alerts should not be emitted
    expect(events.find((e) => e.name === "reframe_job_failure_rate")).toBeUndefined();
    expect(events.find((e) => e.name === "reframe_stuck_queue")).toBeUndefined();
    expect(events.find((e) => e.name === "gpu_spend_threshold")).toBeUndefined();
  });
});
