"use strict";

// CommonJS is required by the standalone Cloud Run worker package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { timingSafeEqual } = require("node:crypto");

function authorizeWorkerRequest(workerSecret, authorizationHeader) {
  const configuredSecret = String(workerSecret || "").trim();

  if (!configuredSecret) {
    return {
      ok: false,
      status: 503,
      error: "Service unavailable",
      reason: "WORKER_SECRET is not configured",
    };
  }

  const match =
    typeof authorizationHeader === "string"
      ? /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim())
      : null;

  if (!match) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const actual = Buffer.from(match[1]);
  const expected = Buffer.from(configuredSecret);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

module.exports = { authorizeWorkerRequest };
