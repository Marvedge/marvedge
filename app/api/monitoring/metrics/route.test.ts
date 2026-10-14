import { beforeEach, describe, expect, it, vi } from "vitest";
import { Registry } from "@prometheus-io/client";

const mocks = vi.hoisted(() => ({
  collectQueueMetrics: vi.fn(),
  serializeMetrics: vi.fn(),
}));

vi.mock("../../../lib/queue", () => ({
  reframeQueue: { name: "reframe-processing" },
  dubbingQueue: { name: "dubbing-processing" },
}));

vi.mock("../../../lib/monitoring/queueMetrics", () => ({
  collectQueueMetrics: mocks.collectQueueMetrics,
}));

vi.mock("../../../lib/monitoring/metrics", () => ({
  metricsRegistry: {
    contentType: Registry.PROMETHEUS_CONTENT_TYPE,
    metrics: mocks.serializeMetrics,
  },
}));

import { dubbingQueue, reframeQueue } from "../../../lib/queue";
import { GET } from "./route";

const metricsText = [
  "# HELP marvedge_reframe_inference_duration_seconds Time spent performing reframe ML inference.",
  "# TYPE marvedge_reframe_inference_duration_seconds histogram",
  "# HELP marvedge_dubbing_duration_seconds Time spent processing dubbing jobs.",
  "# TYPE marvedge_dubbing_duration_seconds histogram",
  "# HELP marvedge_jobs_total Total number of Marvedge pipeline jobs processed.",
  "# TYPE marvedge_jobs_total counter",
  "# HELP marvedge_queue_depth Current number of BullMQ jobs in each state.",
  "# TYPE marvedge_queue_depth gauge",
].join("\n");

describe("GET /api/monitoring/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collectQueueMetrics.mockResolvedValue(undefined);
    mocks.serializeMetrics.mockResolvedValue(metricsText);
  });

  it("collects current queue counts and returns Prometheus exposition", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(Registry.PROMETHEUS_CONTENT_TYPE);
    const body = await response.text();
    expect(body).toContain("marvedge_reframe_inference_duration_seconds");
    expect(body).toContain("marvedge_dubbing_duration_seconds");
    expect(body).toContain("marvedge_jobs_total");
    expect(body).toContain("marvedge_queue_depth");
    expect(mocks.collectQueueMetrics).toHaveBeenCalledOnce();
    expect(mocks.collectQueueMetrics).toHaveBeenCalledWith({
      reframe: reframeQueue,
      dubbing: dubbingQueue,
    });
  });

  it("still returns registry metrics when queue collection fails", async () => {
    mocks.collectQueueMetrics.mockRejectedValue(new Error("Redis unavailable"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(metricsText);
    expect(logError).toHaveBeenCalledWith(
      "[monitoring] Queue metrics collection failed:",
      expect.any(Error)
    );
  });

  it("returns HTTP 500 if metrics serialization fails", async () => {
    mocks.serializeMetrics.mockRejectedValue(new Error("serialization failure"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Unable to serialize metrics");
    expect(logError).toHaveBeenCalledWith(
      "[monitoring] Metrics serialization failed:",
      expect.any(Error)
    );
  });
});
