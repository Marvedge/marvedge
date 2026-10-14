import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import {
  collectLatencyWindowMeans,
  recordLatencyObservation,
  recordLatencyObservationBestEffort,
} from "./latencyWindowMetrics";

describe("Redis-backed latency window metrics", () => {
  it("stores low-cardinality duration aggregates in a minute bucket with expiry", async () => {
    const evalScript = vi.fn().mockResolvedValue(1);
    const redis = { eval: evalScript } as unknown as Redis;

    await recordLatencyObservation(redis, "reframe", "failure", 2.5, 121_000, 300);

    expect(evalScript).toHaveBeenCalledOnce();
    expect(evalScript.mock.calls[0].slice(1)).toEqual([
      1,
      "marvedge:monitoring:latency:v1:reframe:2",
      "failure",
      "2.5",
      "420",
    ]);
  });

  it("combines success and failure aggregates from both pipeline windows", async () => {
    const results = [
      [null, ["2", "4", "1", "3"]],
      [null, ["0", "0", "0", "0"]],
      [null, ["1", "5", "1", "1"]],
      [null, ["0", "0", "0", "0"]],
    ];
    const chained = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(results),
    };
    const redis = { pipeline: vi.fn().mockReturnValue(chained) } as unknown as Redis;

    await expect(collectLatencyWindowMeans(redis, 60, 120_000)).resolves.toEqual({
      reframe: 7 / 3,
      dubbing: 3,
    });
    expect(chained.hmget).toHaveBeenCalledTimes(4);
    expect(chained.hmget).toHaveBeenCalledWith(
      "marvedge:monitoring:latency:v1:reframe:1",
      "success_count",
      "success_sum",
      "failure_count",
      "failure_sum"
    );
    expect(chained.hmget).toHaveBeenCalledWith(
      "marvedge:monitoring:latency:v1:dubbing:2",
      "success_count",
      "success_sum",
      "failure_count",
      "failure_sum"
    );
  });

  it("omits latency observations when Redis is unavailable", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pipeline = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const redis = {
      pipeline: vi.fn().mockReturnValue(pipeline),
    } as unknown as Redis;

    await expect(collectLatencyWindowMeans(redis, 60, 120_000)).resolves.toEqual({});
    expect(logError).toHaveBeenCalled();
  });

  it("contains best-effort write failures instead of throwing to a worker", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as Redis;

    expect(() =>
      recordLatencyObservationBestEffort(redis, "dubbing", "success", 5, 300)
    ).not.toThrow();
    await vi.waitFor(() => expect(logError).toHaveBeenCalled());
  });
});
