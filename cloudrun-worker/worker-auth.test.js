import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { authorizeWorkerRequest } = require("./worker-auth.cjs");

describe("Cloud Run worker authentication", () => {
  it("fails closed when WORKER_SECRET is missing", () => {
    expect(authorizeWorkerRequest("", undefined)).toEqual({
      ok: false,
      status: 503,
      error: "Service unavailable",
      reason: "WORKER_SECRET is not configured",
    });
  });

  it("rejects a missing authorization header", () => {
    expect(authorizeWorkerRequest("worker-secret", undefined)).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("rejects a raw token without the Bearer scheme", () => {
    expect(authorizeWorkerRequest("worker-secret", "worker-secret")).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("rejects an incorrect bearer token", () => {
    expect(authorizeWorkerRequest("worker-secret", "Bearer incorrect-secret")).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("accepts the configured bearer token", () => {
    expect(authorizeWorkerRequest("worker-secret", "Bearer worker-secret")).toEqual({ ok: true });
  });

  it("accepts a case-insensitive Bearer scheme", () => {
    expect(authorizeWorkerRequest("worker-secret", "bearer worker-secret")).toEqual({ ok: true });
  });
});
