import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import {
  collectCostWindowSum,
  collectCostWindowSums,
  costObservationKey,
  formatMetricKey,
  recordCostObservation,
  recordCostObservationBestEffort,
} from "./costWindowMetrics";

describe("Redis-backed cost window metrics", () => {
  it("stores usage aggregate in a minute bucket with TTL and proper key format", async () => {
    const evalScript = vi.fn().mockResolvedValue(1);
    const redis = { eval: evalScript } as unknown as Redis;

    const result = await recordCostObservation(redis, {
      category: "gpu_worker",
      provider: "reframe",
      unit: "seconds",
      amount: 14.5,
      timestampMs: 125_000, // bucket 2
      windowSeconds: 300,
    });

    expect(result).toBe(true);
    expect(evalScript).toHaveBeenCalledOnce();
    expect(evalScript.mock.calls[0].slice(1)).toEqual([
      1,
      "marvedge:monitoring:cost:v1:gpu_worker:reframe:seconds:2",
      "14.5",
      "3600", // Math.max(300 + 300, 3600)
      "",
      "86400",
    ]);
  });

  it("handles duplicate recording with idempotency key", async () => {
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const redis = { eval: evalScript } as unknown as Redis;

    const input = {
      category: "dubbing",
      provider: "elevenlabs",
      unit: "characters",
      amount: 450,
      timestampMs: 65_000,
      windowSeconds: 3600,
      idempotencyKey: "job-123:attempt-0",
    };

    const first = await recordCostObservation(redis, input);
    const second = await recordCostObservation(redis, input);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(evalScript).toHaveBeenCalledTimes(2);
    expect(evalScript.mock.calls[0][5]).toBe("dubbing:elevenlabs:characters:job-123:attempt-0");
    expect(evalScript.mock.calls[0][6]).toBe("86400");
  });

  it("accumulates rolling window sums across multiple minute buckets", async () => {
    // 5 buckets evaluated for window 240s: buckets 1, 2, 3, 4, 5
    const results = [
      [null, ["10.5", "1"]],
      [null, ["20.0", "2"]],
      [null, ["0", "0"]],
      [null, ["5.5", "1"]],
      [null, ["14.0", "1"]],
    ];
    const chained = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(results),
    };
    const redis = { pipeline: vi.fn().mockReturnValue(chained) } as unknown as Redis;

    const sum = await collectCostWindowSum(
      redis,
      { category: "gpu_worker", provider: "reframe", unit: "seconds" },
      240,
      300_000 // now = 300s -> bucket 5; firstBucket = (300 - 240) / 60 = 1
    );

    expect(sum).toBe(50.0);
    expect(chained.hmget).toHaveBeenCalledTimes(5);
  });

  it("isolates metrics by provider and billable unit", async () => {
    const results = [
      // Provider 1 (elevenlabs:characters): 2 buckets
      [null, ["500", "1"]],
      [null, ["700", "1"]],
      // Provider 2 (deepgram:audio_seconds): 2 buckets
      [null, ["45.2", "1"]],
      [null, ["15.8", "1"]],
    ];
    const chained = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(results),
    };
    const redis = { pipeline: vi.fn().mockReturnValue(chained) } as unknown as Redis;

    const metrics = [
      { category: "dubbing", provider: "elevenlabs", unit: "characters" },
      { category: "stt", provider: "deepgram", unit: "audio_seconds" },
    ];

    const totals = await collectCostWindowSums(redis, metrics, 60, 120_000);
    expect(totals).toEqual({
      "dubbing:elevenlabs:characters": 1200,
      "stt:deepgram:audio_seconds": 61.0,
    });
  });

  it("validates invalid values and throws appropriate errors", async () => {
    const redis = { eval: vi.fn() } as unknown as Redis;

    // Negative amount
    await expect(
      recordCostObservation(redis, {
        category: "gpu_worker",
        provider: "reframe",
        unit: "seconds",
        amount: -5,
        windowSeconds: 300,
      })
    ).rejects.toThrow(RangeError);

    // Non-finite amount
    await expect(
      recordCostObservation(redis, {
        category: "gpu_worker",
        provider: "reframe",
        unit: "seconds",
        amount: Number.NaN,
        windowSeconds: 300,
      })
    ).rejects.toThrow(RangeError);

    // Invalid window seconds (not positive whole minute)
    await expect(
      recordCostObservation(redis, {
        category: "gpu_worker",
        provider: "reframe",
        unit: "seconds",
        amount: 10,
        windowSeconds: 45,
      })
    ).rejects.toThrow(RangeError);

    // Invalid category / provider / unit identifier
    await expect(
      recordCostObservation(redis, {
        category: "invalid category with spaces!",
        provider: "reframe",
        unit: "seconds",
        amount: 10,
        windowSeconds: 60,
      })
    ).rejects.toThrow(TypeError);
  });

  it("handles Redis failures gracefully in collectCostWindowSums", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pipeline = {
      hmget: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
    };
    const redis = {
      pipeline: vi.fn().mockReturnValue(pipeline),
    } as unknown as Redis;

    const totals = await collectCostWindowSums(
      redis,
      [{ category: "gpu_worker", provider: "reframe", unit: "seconds" }],
      60,
      120_000
    );

    expect(totals).toEqual({});
    expect(logError).toHaveBeenCalled();
  });

  it("contains best-effort write failures without throwing", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("Redis offline")),
    } as unknown as Redis;

    expect(() =>
      recordCostObservationBestEffort(redis, {
        category: "gpu_worker",
        provider: "reframe",
        unit: "seconds",
        amount: 12.3,
        windowSeconds: 300,
      })
    ).not.toThrow();

    await vi.waitFor(() => expect(logError).toHaveBeenCalled());
  });
});
