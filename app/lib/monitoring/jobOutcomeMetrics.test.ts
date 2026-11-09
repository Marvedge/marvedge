import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import {
  collectJobOutcomeWindowCounts,
  getJobOutcomeMetricsMaxDataPoints,
} from "./jobOutcomeMetrics";

const now = Date.parse("2026-10-08T12:00:00.000Z");

function createQueue(
  completed: number[],
  failed: number[],
  prevTS: number = now - 30_000,
  count: number = 6
): Pick<Queue, "getMetrics"> {
  return {
    getMetrics: vi.fn(async (type: "completed" | "failed") => ({
      meta: { count: count * 2, prevTS, prevCount: 0 },
      data: type === "completed" ? completed : failed,
      count,
    })),
  };
}

describe("BullMQ job outcome metrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("configures Redis retention for the requested window plus a boundary point", () => {
    expect(
      getJobOutcomeMetricsMaxDataPoints({
        MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS: "300",
      })
    ).toBe(6);
    expect(getJobOutcomeMetricsMaxDataPoints({})).toBeUndefined();
    expect(
      getJobOutcomeMetricsMaxDataPoints({
        MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS: "90",
      })
    ).toBeUndefined();
  });

  it("sums completed and final-failed minute buckets for both queues", async () => {
    const reframe = createQueue([3, 2, 1, 0, 1], [1, 0, 0, 0, 0]);
    const dubbing = createQueue([8, 1, 3, 2, 0], [2, 0, 1, 0, 0]);

    await expect(collectJobOutcomeWindowCounts({ reframe, dubbing }, 300, now)).resolves.toEqual({
      reframe: { completed: 7, failed: 1, windowSeconds: 300 },
      dubbing: { completed: 14, failed: 3, windowSeconds: 300 },
    });
    expect(reframe.getMetrics).toHaveBeenCalledWith("completed", 0, 4);
    expect(reframe.getMetrics).toHaveBeenCalledWith("failed", 0, 4);
    expect(dubbing.getMetrics).toHaveBeenCalledWith("completed", 0, 4);
    expect(dubbing.getMetrics).toHaveBeenCalledWith("failed", 0, 4);
  });

  it("does not return a rate until BullMQ has a complete window of data points", async () => {
    const reframe = createQueue([2, 1], [1, 0], now - 30_000, 2);
    const dubbing = createQueue([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], now - 30_000, 5);

    await expect(collectJobOutcomeWindowCounts({ reframe, dubbing }, 300, now)).resolves.toEqual({
      dubbing: { completed: 0, failed: 0, windowSeconds: 300 },
    });
  });

  it("treats stale queue history as zero activity in the current window", async () => {
    const staleQueue = createQueue([10, 10, 10, 10, 10], [3, 3, 3, 3, 3], now - 600_000);

    await expect(
      collectJobOutcomeWindowCounts({ reframe: staleQueue, dubbing: staleQueue }, 300, now)
    ).resolves.toEqual({
      reframe: { completed: 0, failed: 0, windowSeconds: 300 },
      dubbing: { completed: 0, failed: 0, windowSeconds: 300 },
    });
  });

  it("logs per-queue BullMQ errors and continues collecting the other pipeline", async () => {
    const error = new Error("Redis unavailable");
    const reframe = {
      getMetrics: vi.fn().mockRejectedValue(error),
    } as unknown as Pick<Queue, "getMetrics">;
    const dubbing = createQueue([5, 4, 3, 2, 1], [1, 0, 0, 0, 0]);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(collectJobOutcomeWindowCounts({ reframe, dubbing }, 300, now)).resolves.toEqual({
      dubbing: { completed: 15, failed: 1, windowSeconds: 300 },
    });
    expect(logError).toHaveBeenCalledWith(
      "[monitoring] Failed to collect reframe job outcome metrics:",
      error
    );
  });

  it("rejects windows that do not match BullMQ's one-minute resolution", async () => {
    const queue = createQueue([], []);

    await expect(
      collectJobOutcomeWindowCounts({ reframe: queue, dubbing: queue }, 90, now)
    ).rejects.toThrow("positive whole-minute value");
  });
});
