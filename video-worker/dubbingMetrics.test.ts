import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Redis from "ioredis";
import { dubbingDurationSeconds, jobsTotal } from "../app/lib/monitoring/metrics";
import { recordLatencyObservationBestEffort } from "../app/lib/monitoring/latencyWindowMetrics";
import {
  recordDubbingJobCompleted,
  recordFinalDubbingJobFailure,
  runDubbingJobWithMetrics,
} from "./dubbingMetrics";

describe("dubbing worker metrics", () => {
  beforeEach(() => {
    dubbingDurationSeconds.reset();
    jobsTotal.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records successful processing duration in seconds", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(4250);
    const onDuration = vi.fn();

    await expect(runDubbingJobWithMetrics(async () => "done", onDuration)).resolves.toBe("done");
    expect(onDuration).toHaveBeenCalledWith("success", 3.25);

    const metric = await dubbingDurationSeconds.get();
    expect(
      metric.values.find((value) => value.metricName === "marvedge_dubbing_duration_seconds_sum")
    ).toMatchObject({ labels: { status: "success" }, value: 3.25 });
  });

  it("records failed processing duration and rethrows the original error", async () => {
    const processingError = new Error("processing failed");
    vi.spyOn(performance, "now").mockReturnValueOnce(2000).mockReturnValueOnce(3500);

    await expect(
      runDubbingJobWithMetrics(async () => {
        throw processingError;
      })
    ).rejects.toBe(processingError);

    const metric = await dubbingDurationSeconds.get();
    expect(
      metric.values.find((value) => value.metricName === "marvedge_dubbing_duration_seconds_sum")
    ).toMatchObject({ labels: { status: "failure" }, value: 1.5 });
  });

  it("does not fail dubbing if the shared-observation hook throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runDubbingJobWithMetrics(
        async () => "done",
        () => {
          throw new Error("metrics storage unavailable");
        }
      )
    ).resolves.toBe("done");
  });

  it("does not fail dubbing when its monitoring Redis write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const monitoringRedis = {
      eval: vi.fn().mockRejectedValue(new Error("Command timed out")),
    } as unknown as Redis;

    await expect(
      runDubbingJobWithMetrics(
        async () => "done",
        (status, durationSeconds) => {
          recordLatencyObservationBestEffort(
            monitoringRedis,
            "dubbing",
            status,
            durationSeconds,
            300
          );
        }
      )
    ).resolves.toBe("done");
  });

  it("counts a completed job", async () => {
    recordDubbingJobCompleted();

    const metric = await jobsTotal.get();
    expect(metric.values).toContainEqual(
      expect.objectContaining({
        labels: { pipeline: "dubbing", status: "completed" },
        value: 1,
      })
    );
  });

  it("excludes intermediate failed attempts and counts the final failure", async () => {
    const job = { attemptsMade: 1, opts: { attempts: 3 } };
    expect(recordFinalDubbingJobFailure(job, new Error("retryable"))).toBe(false);

    expect(recordFinalDubbingJobFailure({ ...job, attemptsMade: 3 }, new Error("exhausted"))).toBe(
      true
    );

    const metric = await jobsTotal.get();
    expect(metric.values).toContainEqual(
      expect.objectContaining({
        labels: { pipeline: "dubbing", status: "failed" },
        value: 1,
      })
    );
  });

  it("counts unrecoverable failures before the retry limit", async () => {
    const error = new Error("deterministic failure");
    error.name = "UnrecoverableError";

    expect(recordFinalDubbingJobFailure({ attemptsMade: 1, opts: { attempts: 3 } }, error)).toBe(
      true
    );
  });
});
