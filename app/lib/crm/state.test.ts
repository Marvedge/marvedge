import { describe, expect, it, vi } from "vitest";

// These tests exercise the retry state machine, not host resolution. Stub the
// pre-delivery DNS check so the fixture URL never depends on real DNS (and so a
// fail-closed resolver cannot mask a retry-behaviour regression).
vi.mock("./deliveryCheck", () => ({
  deliveryHostIsPublic: vi.fn(async () => true),
}));

import {
  MAX_ATTEMPTS_PER_RUN,
  MAX_ERROR_LENGTH,
  RETRY_DELAYS_MS,
  nextDeliveryState,
  safeError,
  shouldAttempt,
} from "./state";
import { runDelivery } from "./index";
import type { DeliveryState } from "./state";
import type { DeliveryOutcome, ResolvedConnection } from "./types";

const NOW = new Date("2026-08-28T10:00:00.000Z");

const PENDING: DeliveryState = {
  status: "PENDING",
  attempts: 0,
  lastError: null,
  deliveredAt: null,
};

describe("safeError", () => {
  it("strips anything that looks like an email address", () => {
    expect(safeError("Contact ada@acme.com already exists")).toBe(
      "Contact [redacted] already exists"
    );
    expect(safeError('Property value "ada.lovelace+demo@sub.acme.co.uk" is invalid')).toBe(
      'Property value "[redacted]" is invalid'
    );
  });

  it("reads an Error's message and a bare string alike", () => {
    expect(safeError(new Error("HubSpot responded 500"))).toBe("HubSpot responded 500");
    expect(safeError("HubSpot responded 500")).toBe("HubSpot responded 500");
  });

  it("has a literal fallback for anything unreadable", () => {
    expect(safeError(undefined)).toBe("Unknown delivery error");
    expect(safeError({})).toBe("Unknown delivery error");
    expect(safeError("   ")).toBe("Unknown delivery error");
  });

  it("bounds the length", () => {
    const long = safeError("x".repeat(1000));
    expect(long.length).toBe(MAX_ERROR_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("shouldAttempt", () => {
  it("attempts a pending or failed row on an enabled connection", () => {
    expect(shouldAttempt({ connectionEnabled: true, status: "PENDING" })).toBe(true);
    expect(shouldAttempt({ connectionEnabled: true, status: "FAILED" })).toBe(true);
  });

  it("never re-attempts a delivered row — this is what makes retry idempotent", () => {
    expect(shouldAttempt({ connectionEnabled: true, status: "DELIVERED" })).toBe(false);
  });

  it("skips a disabled connection entirely, whatever the row says", () => {
    expect(shouldAttempt({ connectionEnabled: false, status: "PENDING" })).toBe(false);
    expect(shouldAttempt({ connectionEnabled: false, status: "FAILED" })).toBe(false);
    expect(shouldAttempt({ connectionEnabled: false, status: "DELIVERED" })).toBe(false);
  });
});

describe("nextDeliveryState", () => {
  it("marks a success DELIVERED with a deliveredAt and no error", () => {
    const next = nextDeliveryState(PENDING, { ok: true, detail: "accepted" }, NOW);
    expect(next).toEqual({
      status: "DELIVERED",
      attempts: 1,
      lastError: null,
      deliveredAt: NOW,
    });
  });

  it("clears a previous error when a retry finally succeeds", () => {
    const failedOnce: DeliveryState = {
      status: "FAILED",
      attempts: 3,
      lastError: "HubSpot responded 503",
      deliveredAt: null,
    };
    const next = nextDeliveryState(failedOnce, { ok: true, detail: "accepted" }, NOW);
    expect(next.status).toBe("DELIVERED");
    expect(next.lastError).toBeNull();
    expect(next.attempts).toBe(4);
    expect(next.deliveredAt).toBe(NOW);
  });

  it("leaves a transient failure FAILED and increments attempts", () => {
    const next = nextDeliveryState(
      PENDING,
      { ok: false, retryable: true, error: "HubSpot responded 503" },
      NOW
    );
    expect(next.status).toBe("FAILED");
    expect(next.attempts).toBe(1);
    expect(next.lastError).toBe("HubSpot responded 503");
    expect(next.deliveredAt).toBeNull();
  });

  it("accumulates attempts across retries rather than resetting them", () => {
    const first = nextDeliveryState(PENDING, { ok: false, retryable: true, error: "503" }, NOW, 3);
    expect(first.attempts).toBe(3);
    const second = nextDeliveryState(first, { ok: false, retryable: true, error: "503" }, NOW, 3);
    expect(second.attempts).toBe(6);
    expect(second.status).toBe("FAILED");
  });

  it("counts at least one attempt even if the caller reports none", () => {
    expect(nextDeliveryState(PENDING, { ok: true, detail: "ok" }, NOW, 0).attempts).toBe(1);
  });

  it("redacts a provider error that quotes the lead back at us", () => {
    const next = nextDeliveryState(
      PENDING,
      { ok: false, retryable: false, error: "Contact ada@acme.com already exists" },
      NOW
    );
    expect(next.lastError).toBe("Contact [redacted] already exists");
  });
});

// --- runDelivery: the retry loop around the provider boundary --------------

const CONNECTION: ResolvedConnection = {
  id: "conn_1",
  provider: "webhook",
  credentials: { url: "https://hooks.example.com/x", secret: "s".repeat(16) },
  fieldMap: {},
};

const CONTACT = {
  email: "ada@acme.com",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  companySize: "51-200",
  company: "acme.com",
  referrer: null,
  demoId: "demo_1",
  demoTitle: "Demo",
  demoUrl: null,
  submittedAt: "2026-08-28T09:30:00.000Z",
  consentText: null,
  consentAt: null,
  source: "Marvedge",
};

/** Replaces global fetch with a scripted sequence of Responses. */
function scriptFetch(responses: (() => Response | Promise<Response>)[]) {
  let call = 0;
  const calls = { count: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls.count += 1;
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return next();
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const noSleep = async () => {};

describe("runDelivery", () => {
  it("stops at the first success", async () => {
    const stub = scriptFetch([() => new Response("ok", { status: 200 })]);
    try {
      const run = await runDelivery(CONNECTION, "lead_1", CONTACT, noSleep);
      expect(run.outcome.ok).toBe(true);
      expect(run.attempts).toBe(1);
      expect(stub.calls.count).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it("retries a transient failure up to the bounded ceiling", async () => {
    const stub = scriptFetch([() => new Response("nope", { status: 503 })]);
    try {
      const run = await runDelivery(CONNECTION, "lead_1", CONTACT, noSleep);
      expect(run.outcome.ok).toBe(false);
      expect(run.attempts).toBe(MAX_ATTEMPTS_PER_RUN);
      expect(stub.calls.count).toBe(RETRY_DELAYS_MS.length + 1);
    } finally {
      stub.restore();
    }
  });

  it("does not retry a non-retryable rejection", async () => {
    const stub = scriptFetch([() => new Response("bad request", { status: 400 })]);
    try {
      const run = await runDelivery(CONNECTION, "lead_1", CONTACT, noSleep);
      expect(run.outcome.ok).toBe(false);
      expect(run.attempts).toBe(1);
      expect(stub.calls.count).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it("succeeds when a retry lands after a transient failure", async () => {
    const stub = scriptFetch([
      () => new Response("nope", { status: 500 }),
      () => new Response("ok", { status: 202 }),
    ]);
    try {
      const run = await runDelivery(CONNECTION, "lead_1", CONTACT, noSleep);
      expect(run.outcome.ok).toBe(true);
      expect(run.attempts).toBe(2);
    } finally {
      stub.restore();
    }
  });

  it("never throws across the provider boundary", async () => {
    const stub = scriptFetch([
      () => {
        throw new Error("connect ECONNREFUSED");
      },
    ]);
    try {
      const run = await runDelivery(CONNECTION, "lead_1", CONTACT, noSleep);
      expect(run.outcome.ok).toBe(false);
      const outcome = run.outcome as Extract<DeliveryOutcome, { ok: false }>;
      expect(outcome.retryable).toBe(true);
      expect(outcome.error).toContain("ECONNREFUSED");
    } finally {
      stub.restore();
    }
  });
});
