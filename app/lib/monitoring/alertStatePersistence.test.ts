/* eslint-disable max-lines-per-function */
import type Redis from "ioredis";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMonitoringAlertEvaluator, type MonitoringAlertConfig } from "./alerts";
import {
  createAlertStateStore,
  RedisAlertStateStore,
  getAlertStateKey,
  transitionLuaScript,
} from "./alertStateStore";
import * as externalNotifications from "./externalNotifications";

class MockRedis {
  public hashes = new Map<string, Map<string, string>>();
  public status = "ready";
  public shouldFail = false;

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    isFiring: string,
    nowStr: string,
    cooldownStr: string,
    _ttlStr: string,
    observedStr: string,
    thresholdStr: string,
    pipelineStr: string
  ): Promise<string> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost (ECONNREFUSED)");
    }

    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map<string, string>();
      this.hashes.set(key, hash);
    }

    const now = Number(nowStr);
    const cooldownMs = Number(cooldownStr);
    const currentFiring = hash.get("firing");
    const lastFiringAt = Number(hash.get("lastFiringAt") || "0");
    const isCurrentlyFiring = currentFiring === "1";

    if (isFiring === "1") {
      const mayEmit = lastFiringAt === 0 || now - lastFiringAt >= cooldownMs;
      if (mayEmit) {
        hash.set("firing", "1");
        hash.set("lastFiringAt", String(now));
        hash.set("lastNotificationAt", String(now));
        hash.set("observedValue", observedStr);
        hash.set("threshold", thresholdStr);
        hash.set("pipeline", pipelineStr);
        return "EMIT_FIRING";
      } else {
        hash.set("firing", "1");
        hash.set("observedValue", observedStr);
        hash.set("threshold", thresholdStr);
        hash.set("pipeline", pipelineStr);
        return "SUPPRESSED";
      }
    } else {
      if (isCurrentlyFiring) {
        hash.set("firing", "0");
        hash.set("lastResolvedAt", String(now));
        hash.set("lastNotificationAt", String(now));
        hash.set("observedValue", observedStr);
        hash.set("threshold", thresholdStr);
        return "EMIT_RESOLVED";
      } else {
        return "NOOP";
      }
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost (ECONNREFUSED)");
    }
    const hash = this.hashes.get(key);
    if (!hash) {
      return {};
    }
    return Object.fromEntries(hash.entries());
  }

  async hset(key: string, ...args: string[]): Promise<number> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost (ECONNREFUSED)");
    }
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map<string, string>();
      this.hashes.set(key, hash);
    }
    for (let i = 0; i < args.length; i += 2) {
      hash.set(args[i], args[i + 1]);
    }
    return 1;
  }

  async del(key: string): Promise<number> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost (ECONNREFUSED)");
    }
    const deleted = this.hashes.delete(key);
    return deleted ? 1 : 0;
  }
}

describe("Task-00105: Redis-backed Alert State Persistence and Failure Modes", () => {
  const baseConfig: MonitoringAlertConfig = {
    reframeInferenceLatencyThresholdSeconds: 2,
    dubbingLatencyThresholdSeconds: 10,
    reframeFailureRateThreshold: 0.25,
    dubbingFailureRateThreshold: 0.25,
    reframeQueueDepthThreshold: 10,
    dubbingQueueDepthThreshold: 10,
    failureRateObservationWindowSeconds: 300,
    failureRateMinimumJobs: 4,
    alertCooldownSeconds: 300, // 5 minutes cooldown
    alertStateTtlSeconds: 604800,
    reframeStuckQueueThresholdSeconds: 60,
    dubbingStuckQueueThresholdSeconds: 60,
  };

  const now = Date.parse("2026-10-08T12:00:00.000Z");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stores alert state by stable alert identifier and exposes script", () => {
    const key = getAlertStateKey("reframe_stuck_queue");
    expect(key).toBe("marvedge:monitoring:alert:v1:state:reframe_stuck_queue");
    expect(transitionLuaScript).toContain('redis.call("HGET", key, "firing")');
  });

  it("suppresses duplicate alert notifications across evaluator restarts", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    // Evaluator Process 1 evaluates and fires
    const evalProcess1 = createMonitoringAlertEvaluator(
      vi.fn(),
      createAlertStateStore(sharedRedis)
    );
    const events1 = await evalProcess1({
      config: baseConfig,
      now,
      stuckQueueAges: { reframe: 120 },
    });
    expect(events1).toHaveLength(1);
    expect(events1[0].status).toBe("firing");
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // State is persisted in Redis
    const state = await createAlertStateStore(sharedRedis).getState("reframe_stuck_queue");
    expect(state).toBeDefined();
    expect(state?.firing).toBe(true);
    expect(state?.lastFiringAt).toBe(now);

    // Evaluator Process 2 starts up (e.g. after process restart) sharing the same Redis
    const evalProcess2 = createMonitoringAlertEvaluator(
      vi.fn(),
      createAlertStateStore(sharedRedis)
    );
    const events2 = await evalProcess2({
      config: baseConfig,
      now: now + 30_000, // 30s later (within 300s cooldown)
      stuckQueueAges: { reframe: 150 },
    });
    // Suppressed across restarts!
    expect(events2).toHaveLength(0);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate notifications from concurrent evaluator processes via atomic operations", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    // Create 5 concurrent evaluator instances running at the exact same moment
    const evaluators = Array.from({ length: 5 }, () =>
      createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis))
    );

    const results = await Promise.all(
      evaluators.map((ev) =>
        ev({
          config: baseConfig,
          now,
          stuckQueueAges: { dubbing: 90 },
        })
      )
    );

    // Flatten all emitted events
    const allEvents = results.flat();
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].name).toBe("dubbing_stuck_queue");
    expect(allEvents[0].status).toBe("firing");

    // Notification is sent exactly once across all 5 concurrent evaluators
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("persists cooldown across evaluator instances and refires after cooldown expires", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    // Instance 1 fires at T=0
    const eval1 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    await eval1({ config: baseConfig, now, stuckQueueAges: { reframe: 100 } });
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // Instance 2 evaluates at T = 200s (within 300s cooldown)
    const eval2 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    const events2 = await eval2({
      config: baseConfig,
      now: now + 200_000,
      stuckQueueAges: { reframe: 300 },
    });
    expect(events2).toHaveLength(0);
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // Instance 3 evaluates at T = 301s (after 300s cooldown expires)
    const eval3 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    const events3 = await eval3({
      config: baseConfig,
      now: now + 301_000,
      stuckQueueAges: { reframe: 400 },
    });
    expect(events3).toHaveLength(1);
    expect(events3[0].status).toBe("firing");
    expect(notificationSpy).toHaveBeenCalledTimes(2);
  });

  it("dispatches recovery notification exactly once across evaluators", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const eval1 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    // Breaches threshold
    await eval1({ config: baseConfig, now, stuckQueueAges: { reframe: 100 } });
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // Condition recovers
    const eval2 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    const recoveryEvents = await eval2({
      config: baseConfig,
      now: now + 30_000,
      stuckQueueAges: { reframe: 10 }, // Below 60s threshold
    });
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].status).toBe("resolved");
    expect(notificationSpy).toHaveBeenCalledTimes(2);

    // Subsequent evaluations remain healthy (NOOP)
    const eval3 = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));
    const subsequentEvents = await eval3({
      config: baseConfig,
      now: now + 40_000,
      stuckQueueAges: { reframe: 12 },
    });
    expect(subsequentEvents).toHaveLength(0);
    // Notification count stays at 2 (no duplicate recovery notification)
    expect(notificationSpy).toHaveBeenCalledTimes(2);
  });

  it("handles Redis unavailability explicitly by falling back without crashing", async () => {
    const mockRedis = new MockRedis();
    mockRedis.shouldFail = true; // Simulate Redis outage
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const store = new RedisAlertStateStore(sharedRedis);
    const evaluate = createMonitoringAlertEvaluator(vi.fn(), store);

    // Evaluator should not throw error or crash process
    await expect(
      evaluate({ config: baseConfig, now, stuckQueueAges: { reframe: 100 } })
    ).resolves.not.toThrow();

    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("treats expired alert state as a fresh breach after TTL", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const store = createAlertStateStore(sharedRedis);
    const evaluate = createMonitoringAlertEvaluator(vi.fn(), store);

    // Initial alert fires
    await evaluate({ config: baseConfig, now, stuckQueueAges: { reframe: 100 } });
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // Simulate TTL expiration in Redis
    await store.clear("reframe_stuck_queue");

    // Next evaluation after expiration
    const freshEvents = await evaluate({
      config: baseConfig,
      now: now + 10_000,
      stuckQueueAges: { reframe: 110 },
    });
    expect(freshEvents).toHaveLength(1);
    expect(freshEvents[0].status).toBe("firing");
    expect(notificationSpy).toHaveBeenCalledTimes(2);
  });

  it("evaluates monitoring-data-unavailable alert and emits recovery exactly once", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const evaluate = createMonitoringAlertEvaluator(vi.fn(), createAlertStateStore(sharedRedis));

    // Data unavailable breach
    const firingEvents = await evaluate({
      config: baseConfig,
      now,
      monitoringDataUnavailable: true,
    });

    expect(firingEvents).toHaveLength(1);
    expect(firingEvents[0]).toMatchObject({
      name: "monitoring_data_unavailable",
      pipeline: "monitoring",
      status: "firing",
      observedValue: 1,
      threshold: 0,
    });
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // Data recovers
    const recoveryEvents = await evaluate({
      config: baseConfig,
      now: now + 20_000,
      monitoringDataUnavailable: false,
    });

    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0]).toMatchObject({
      name: "monitoring_data_unavailable",
      pipeline: "monitoring",
      status: "resolved",
      observedValue: 0,
      threshold: 0,
    });
    expect(notificationSpy).toHaveBeenCalledTimes(2);

    // Consecutive healthy tick
    const noopEvents = await evaluate({
      config: baseConfig,
      now: now + 30_000,
      monitoringDataUnavailable: false,
    });
    expect(noopEvents).toHaveLength(0);
    expect(notificationSpy).toHaveBeenCalledTimes(2);
  });

  it("avoids notification storms when Redis reconnects", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const store = createAlertStateStore(sharedRedis);
    const evaluate = createMonitoringAlertEvaluator(vi.fn(), store);

    // 1. Alert fires normally at T=0
    await evaluate({ config: baseConfig, now, stuckQueueAges: { reframe: 100 } });
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // 2. Redis temporarily goes down
    mockRedis.shouldFail = true;
    await evaluate({ config: baseConfig, now: now + 30_000, stuckQueueAges: { reframe: 110 } });

    // 3. Redis comes back up at T=60s (within 300s cooldown)
    mockRedis.shouldFail = false;
    const reconnectedEvents = await evaluate({
      config: baseConfig,
      now: now + 60_000,
      stuckQueueAges: { reframe: 120 },
    });

    // Suppressed because cooldown is intact in Redis! No notification storm.
    expect(reconnectedEvents).toHaveLength(0);
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });

  it("retries notification delivery on the next cycle when external dispatch fails, preventing permanent suppression", async () => {
    const mockRedis = new MockRedis();
    const sharedRedis = mockRedis as unknown as Redis;

    const webhookConfig: MonitoringAlertConfig = {
      ...baseConfig,
      alertWebhookUrl: "https://alerts.example.com/webhook",
      alertCooldownSeconds: 300,
    };

    // First attempt fails due to webhook HTTP failure
    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValueOnce({
        emailSent: false,
        webhookSent: false,
        dryRun: false,
        errors: ["HTTP 500 Internal Server Error"],
      })
      // Second attempt 60s later succeeds
      .mockResolvedValueOnce({
        emailSent: false,
        webhookSent: true,
        dryRun: false,
        errors: [],
      });

    const store = createAlertStateStore(sharedRedis);
    const evaluate = createMonitoringAlertEvaluator(vi.fn(), store);

    // T = 0: breach occurs, notification attempt 1 fails
    const events1 = await evaluate({
      config: webhookConfig,
      now,
      stuckQueueAges: { reframe: 100 },
    });
    expect(events1).toHaveLength(1);
    expect(notificationSpy).toHaveBeenCalledTimes(1);

    // T = 60s (well before 300s cooldown): condition is still firing.
    // Because dispatch failed, cooldown was reset so the alert retries rather than being suppressed for 5 minutes!
    const events2 = await evaluate({
      config: webhookConfig,
      now: now + 60_000,
      stuckQueueAges: { reframe: 110 },
    });
    expect(events2).toHaveLength(1);
    expect(notificationSpy).toHaveBeenCalledTimes(2);

    // T = 120s: notification succeeded at T=60s, so normal cooldown is now strictly enforced!
    const events3 = await evaluate({
      config: webhookConfig,
      now: now + 120_000,
      stuckQueueAges: { reframe: 120 },
    });
    expect(events3).toHaveLength(0);
    expect(notificationSpy).toHaveBeenCalledTimes(2);
  });

  it("fires monitoring_data_unavailable and falls back gracefully when Redis itself is unreachable", async () => {
    const mockRedis = new MockRedis();
    mockRedis.shouldFail = true; // Redis daemon is down
    const sharedRedis = mockRedis as unknown as Redis;

    const notificationSpy = vi
      .spyOn(externalNotifications, "sendExternalAlertNotification")
      .mockResolvedValue({ emailSent: false, webhookSent: false, dryRun: false, errors: [] });

    const store = createAlertStateStore(sharedRedis);
    const evaluate = createMonitoringAlertEvaluator(vi.fn(), store);

    // When Redis is down, telemetry cannot be collected, so monitoringDataUnavailable is evaluated
    const events = await evaluate({
      config: baseConfig,
      now,
      monitoringDataUnavailable: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "monitoring_data_unavailable",
      pipeline: "monitoring",
      status: "firing",
    });
    // Notification dispatch over external HTTPS was still triggered despite local Redis being down
    expect(notificationSpy).toHaveBeenCalledTimes(1);
  });
});
