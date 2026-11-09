import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMonitoringAlertEvaluationIntervalMs,
  MonitoringAlertIntervalError,
  startMonitoringAlertLoop,
  type MonitoringAlertLoop,
} from "./alertLoop";

describe("monitoring alert loop", () => {
  let loop: MonitoringAlertLoop | undefined;

  afterEach(async () => {
    await loop?.stop();
    loop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the configured interval between completed evaluations", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const evaluate = vi.fn().mockResolvedValue(undefined);

    loop = startMonitoringAlertLoop(
      getMonitoringAlertEvaluationIntervalMs({
        MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS: "45",
      }),
      evaluate
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(evaluate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(44_999);
    expect(evaluate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("continues scheduling after an evaluation fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const evaluate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(undefined);

    loop = startMonitoringAlertLoop(1000, evaluate);
    await vi.advanceTimersByTimeAsync(0);
    expect(evaluate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("stops the timer and waits for the in-flight evaluation", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    let finishEvaluation!: () => void;
    const evaluate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishEvaluation = resolve;
        })
    );

    loop = startMonitoringAlertLoop(1000, evaluate);
    expect(evaluate).toHaveBeenCalledOnce();
    let stopped = false;
    const stopping = loop.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finishEvaluation();
    await stopping;
    await vi.advanceTimersByTimeAsync(5000);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(stopped).toBe(true);
    loop = undefined;
  });

  it("does not create another loop on a duplicate start", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const firstEvaluate = vi.fn().mockResolvedValue(undefined);
    const secondEvaluate = vi.fn().mockResolvedValue(undefined);

    loop = startMonitoringAlertLoop(1000, firstEvaluate);
    const duplicate = startMonitoringAlertLoop(1000, secondEvaluate);

    expect(duplicate).toBe(loop);
    await vi.advanceTimersByTimeAsync(0);
    expect(firstEvaluate).toHaveBeenCalledOnce();
    expect(secondEvaluate).not.toHaveBeenCalled();
  });

  it("rejects missing, invalid, and timer-overflow intervals", () => {
    expect(() => getMonitoringAlertEvaluationIntervalMs({})).toThrow(MonitoringAlertIntervalError);
    expect(() =>
      getMonitoringAlertEvaluationIntervalMs({
        MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS: "0.5",
      })
    ).toThrow(MonitoringAlertIntervalError);
    expect(() =>
      getMonitoringAlertEvaluationIntervalMs({
        MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS: "2147484",
      })
    ).toThrow(MonitoringAlertIntervalError);
  });
});
