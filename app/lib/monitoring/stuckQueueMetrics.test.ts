import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import { calculateStuckQueueAgeSeconds, collectStuckQueueMetrics } from "./stuckQueueMetrics";

describe("stuckQueueMetrics", () => {
  it("returns 0 for an empty / idle queue without false alerting during inactivity", async () => {
    const fakeQueue = {
      getJobs: vi.fn().mockResolvedValue([]),
    } as unknown as Pick<Queue, "getJobs">;

    const age = await calculateStuckQueueAgeSeconds(fakeQueue, 1_000_000);
    expect(age).toBe(0);
    expect(fakeQueue.getJobs).toHaveBeenCalledWith(["active", "waiting"]);
  });

  it("calculates age from the oldest waiting job", async () => {
    const now = 1_000_000;
    const fakeQueue = {
      getJobs: vi.fn().mockResolvedValue([
        { id: "job-1", timestamp: now - 30_000 }, // 30s ago
        { id: "job-2", timestamp: now - 120_000 }, // 120s ago (oldest)
        { id: "job-3", timestamp: now - 10_000 }, // 10s ago
      ]),
    } as unknown as Pick<Queue, "getJobs">;

    const age = await calculateStuckQueueAgeSeconds(fakeQueue, now);
    expect(age).toBe(120);
  });

  it("calculates age from active jobs using processedOn if present", async () => {
    const now = 1_000_000;
    const fakeQueue = {
      getJobs: vi.fn().mockResolvedValue([
        { id: "job-1", timestamp: now - 50_000, processedOn: now - 45_000 },
        { id: "job-2", timestamp: now - 200_000, processedOn: now - 180_000 }, // 180s active
      ]),
    } as unknown as Pick<Queue, "getJobs">;

    const age = await calculateStuckQueueAgeSeconds(fakeQueue, now);
    expect(age).toBe(180);
  });

  it("collects metrics for available pipelines and handles failures gracefully", async () => {
    const now = 1_000_000;
    const reframeQueue = {
      getJobs: vi.fn().mockResolvedValue([{ id: "rf-1", timestamp: now - 60_000 }]),
    } as unknown as Pick<Queue, "getJobs">;

    const dubbingQueue = {
      getJobs: vi.fn().mockRejectedValue(new Error("Redis disconnected")),
    } as unknown as Pick<Queue, "getJobs">;

    const metrics = await collectStuckQueueMetrics(
      { reframe: reframeQueue, dubbing: dubbingQueue },
      now
    );

    expect(metrics.reframe).toBe(60);
    expect(metrics.dubbing).toBeUndefined();
  });
});
