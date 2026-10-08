import { beforeEach, describe, expect, it, vi } from "vitest";
import { queueDepth } from "./metrics";
import { collectQueueMetrics, type QueueMetricsSources } from "./queueMetrics";

function createQueue(counts: Record<string, number>): QueueMetricsSources["reframe"] {
  return {
    getJobCounts: vi.fn<QueueMetricsSources["reframe"]["getJobCounts"]>().mockResolvedValue(counts),
  };
}

function getQueueDepthValues() {
  return queueDepth.get().then(({ values }) =>
    values.map(({ labels, value }) => {
      const metricLabels = labels as Partial<Record<"pipeline" | "state", string | number>>;
      return {
        pipeline: metricLabels.pipeline,
        state: metricLabels.state,
        value,
      };
    })
  );
}

describe("collectQueueMetrics", () => {
  beforeEach(() => {
    queueDepth.reset();
    vi.restoreAllMocks();
  });

  it("collects waiting, active, delayed, and failed counts for both queues", async () => {
    const reframeQueue = createQueue({ waiting: 4, active: 2, delayed: 3, failed: 1 });
    const dubbingQueue = createQueue({ waiting: 8, active: 5, delayed: 6, failed: 7 });

    await collectQueueMetrics({ reframe: reframeQueue, dubbing: dubbingQueue });

    expect(reframeQueue.getJobCounts).toHaveBeenCalledWith(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    expect(dubbingQueue.getJobCounts).toHaveBeenCalledWith(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    expect(await getQueueDepthValues()).toEqual(
      expect.arrayContaining([
        { pipeline: "reframe", state: "waiting", value: 4 },
        { pipeline: "reframe", state: "active", value: 2 },
        { pipeline: "reframe", state: "delayed", value: 3 },
        { pipeline: "reframe", state: "failed", value: 1 },
        { pipeline: "dubbing", state: "waiting", value: 8 },
        { pipeline: "dubbing", state: "active", value: 5 },
        { pipeline: "dubbing", state: "delayed", value: 6 },
        { pipeline: "dubbing", state: "failed", value: 7 },
      ])
    );
  });

  it("sets queue state gauges to zero when their current counts are zero", async () => {
    const reframeGetJobCounts = vi
      .fn<QueueMetricsSources["reframe"]["getJobCounts"]>()
      .mockResolvedValue({ waiting: 4, active: 2, delayed: 3, failed: 1 });
    const queues = {
      reframe: { getJobCounts: reframeGetJobCounts },
      dubbing: createQueue({ waiting: 0, active: 0, delayed: 0, failed: 0 }),
    };

    await collectQueueMetrics(queues);
    reframeGetJobCounts.mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    });
    await collectQueueMetrics(queues);

    expect(await getQueueDepthValues()).toEqual(
      expect.arrayContaining(
        (["waiting", "active", "delayed", "failed"] as const).map((state) => ({
          pipeline: "reframe",
          state,
          value: 0,
        }))
      )
    );
  });

  it("logs queue errors without rejecting or blocking other queue metrics", async () => {
    const error = new Error("Redis unavailable");
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const queues = {
      reframe: {
        getJobCounts: vi
          .fn<QueueMetricsSources["reframe"]["getJobCounts"]>()
          .mockRejectedValue(error),
      },
      dubbing: createQueue({ waiting: 1, active: 2, delayed: 3, failed: 4 }),
    };

    await expect(collectQueueMetrics(queues)).resolves.toEqual({ reframe: false, dubbing: true });

    expect(logError).toHaveBeenCalledWith(
      "[monitoring] Failed to collect reframe queue metrics:",
      error
    );
    expect(await getQueueDepthValues()).toEqual(
      expect.arrayContaining([
        { pipeline: "dubbing", state: "waiting", value: 1 },
        { pipeline: "dubbing", state: "active", value: 2 },
        { pipeline: "dubbing", state: "delayed", value: 3 },
        { pipeline: "dubbing", state: "failed", value: 4 },
      ])
    );
    expect(await getQueueDepthValues()).toHaveLength(4);
  });
});
