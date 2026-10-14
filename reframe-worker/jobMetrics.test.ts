import { describe, expect, it } from "vitest";
import { isFinalReframeJobFailure } from "./jobMetrics";

describe("isFinalReframeJobFailure", () => {
  it("does not count a failed attempt when BullMQ will retry it", () => {
    expect(
      isFinalReframeJobFailure(
        { attemptsMade: 1, opts: { attempts: 3 } },
        new Error("temporary failure"),
        false
      )
    ).toBe(false);
  });

  it("counts a failure after all configured attempts are exhausted", () => {
    expect(
      isFinalReframeJobFailure(
        { attemptsMade: 3, opts: { attempts: 3 } },
        new Error("failure"),
        false
      )
    ).toBe(true);
  });

  it("counts an explicitly discarded job before its attempt limit", () => {
    expect(
      isFinalReframeJobFailure(
        { attemptsMade: 1, opts: { attempts: 3 } },
        new Error("deterministic failure"),
        true
      )
    ).toBe(true);
  });

  it("counts an unrecoverable error before its attempt limit", () => {
    const error = new Error("invalid job");
    error.name = "UnrecoverableError";

    expect(isFinalReframeJobFailure({ attemptsMade: 1, opts: { attempts: 3 } }, error, false)).toBe(
      true
    );
  });
});
