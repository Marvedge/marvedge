import { describe, expect, it } from "vitest";

import { isDubJobInProgress, isDubJobTerminal, normalizeDubJobState } from "./normalize";

describe("normalizeDubJobState", () => {
  it("maps the database's uppercase statuses", () => {
    expect(normalizeDubJobState("PENDING")).toBe("pending");
    expect(normalizeDubJobState("PROCESSING")).toBe("processing");
    expect(normalizeDubJobState("COMPLETED")).toBe("completed");
    expect(normalizeDubJobState("FAILED")).toBe("failed");
    expect(normalizeDubJobState("CANCELLED")).toBe("cancelled");
  });

  it("maps the poll route's lowercase UI states", () => {
    expect(normalizeDubJobState("waiting")).toBe("pending");
    expect(normalizeDubJobState("active")).toBe("processing");
    expect(normalizeDubJobState("completed")).toBe("completed");
    expect(normalizeDubJobState("failed")).toBe("failed");
    expect(normalizeDubJobState("cancelled")).toBe("cancelled");
  });

  it("tolerates mixed casing and whitespace", () => {
    expect(normalizeDubJobState("Completed")).toBe("completed");
    expect(normalizeDubJobState("  PROCESSING  ")).toBe("processing");
  });

  it("accepts the common synonym aliases", () => {
    expect(normalizeDubJobState("queued")).toBe("pending");
    expect(normalizeDubJobState("running")).toBe("processing");
    expect(normalizeDubJobState("done")).toBe("completed");
    expect(normalizeDubJobState("succeeded")).toBe("completed");
    expect(normalizeDubJobState("error")).toBe("failed");
    expect(normalizeDubJobState("cancelled")).toBe("cancelled");
  });

  it("returns 'unknown' for anything unrecognized, non-string or empty", () => {
    expect(normalizeDubJobState("exploded")).toBe("unknown");
    expect(normalizeDubJobState("")).toBe("unknown");
    expect(normalizeDubJobState("  ")).toBe("unknown");
    expect(normalizeDubJobState(null)).toBe("unknown");
    expect(normalizeDubJobState(undefined)).toBe("unknown");
    expect(normalizeDubJobState(42)).toBe("unknown");
  });
});

describe("isDubJobInProgress", () => {
  it("is true only for pending and processing", () => {
    expect(isDubJobInProgress("pending")).toBe(true);
    expect(isDubJobInProgress("processing")).toBe(true);
    expect(isDubJobInProgress("completed")).toBe(false);
    expect(isDubJobInProgress("failed")).toBe(false);
    expect(isDubJobInProgress("cancelled")).toBe(false);
    expect(isDubJobInProgress("unknown")).toBe(false);
  });
});

describe("isDubJobTerminal", () => {
  it("stops on completed, failed and cancelled", () => {
    expect(isDubJobTerminal("pending")).toBe(false);
    expect(isDubJobTerminal("processing")).toBe(false);
    expect(isDubJobTerminal("completed")).toBe(true);
    expect(isDubJobTerminal("failed")).toBe(true);
    expect(isDubJobTerminal("cancelled")).toBe(true);
    expect(isDubJobTerminal("unknown")).toBe(false);
  });
});
