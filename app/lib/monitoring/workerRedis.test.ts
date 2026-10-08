import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkerMonitoringRedis,
  type MonitoringRedisFactory,
  monitoringRedisOptions,
} from "./workerRedis";
import { recordLatencyObservationBestEffort } from "./latencyWindowMetrics";

describe("worker monitoring Redis connection", () => {
  it("creates a separate connection with bounded command options", () => {
    const bullMqRedisConnection = { name: "bullmq" };
    const monitoringRedisConnection = {
      on: vi.fn(),
    } as unknown as Redis;
    const createClient: MonitoringRedisFactory = vi.fn().mockReturnValue(monitoringRedisConnection);

    const result = createWorkerMonitoringRedis("redis://localhost:6379", createClient);

    expect(result).toBe(monitoringRedisConnection);
    expect(result).not.toBe(bullMqRedisConnection);
    expect(createClient).toHaveBeenCalledWith("redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
      connectTimeout: 1000,
      enableOfflineQueue: false,
    });
    expect(monitoringRedisOptions).toEqual({
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
      connectTimeout: 1000,
      enableOfflineQueue: false,
    });
    expect(monitoringRedisConnection.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("reuses one monitoring client for multiple latency observations", async () => {
    const bullMqRedisConnection = { name: "bullmq" };
    const monitoringRedisConnection = {
      on: vi.fn(),
      eval: vi.fn().mockResolvedValue(1),
    } as unknown as Redis;
    const createClient: MonitoringRedisFactory = vi.fn().mockReturnValue(monitoringRedisConnection);
    const monitoringClient = createWorkerMonitoringRedis("redis://localhost:6379", createClient);

    recordLatencyObservationBestEffort(monitoringClient, "reframe", "success", 1, 300);
    recordLatencyObservationBestEffort(monitoringClient, "reframe", "failure", 2, 300);

    await vi.waitFor(() => {
      expect(monitoringRedisConnection.eval).toHaveBeenCalledTimes(2);
    });
    expect(monitoringClient).not.toBe(bullMqRedisConnection);
    expect(createClient).toHaveBeenCalledOnce();
  });

  it("swallows failed writes on the dedicated connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const monitoringRedisConnection = {
      on: vi.fn(),
      eval: vi.fn().mockRejectedValue(new Error("Command timed out")),
    } as unknown as Redis;
    const monitoringClient = createWorkerMonitoringRedis(
      "redis://localhost:6379",
      () => monitoringRedisConnection
    );

    expect(() =>
      recordLatencyObservationBestEffort(monitoringClient, "dubbing", "success", 5, 300)
    ).not.toThrow();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});
