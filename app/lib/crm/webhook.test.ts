import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as dns } from "node:dns";

import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from "./signature";
import { WEBHOOK_EVENT, WEBHOOK_VERSION, deliverToWebhook } from "./webhook";
import { normalizeLead } from "./normalize";

const CONTACT = normalizeLead({
  email: "ada@acme.com",
  name: "Ada Lovelace",
  companySize: "51-200",
  referrer: null,
  createdAt: new Date("2026-08-28T09:30:00.000Z"),
  demoId: "demo_1",
  demoTitle: "Onboarding walkthrough",
  demoUrl: "https://marvedge.com/share/abc",
  consentText: "I agree to be contacted about this product.",
  consentAt: new Date("2026-08-28T09:29:58.000Z"),
});

const CREDENTIALS = { url: "https://hooks.example.com/marvedge", secret: "whsec_marvedge_test" };

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
  init: RequestInit | undefined;
}

/**
 * A mock receiver. Captures exactly what was sent so the test can verify the
 * signature the way a CUSTOMER would: against the raw bytes and the timestamp
 * header, with no access to our serialisation.
 */
function mockReceiver(
  status = 200,
  responseBody = "",
  headers: HeadersInit = {}
) {
  const captured: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestHeaders: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      requestHeaders[key.toLowerCase()] = value;
    });
    captured.push({
      url: String(input),
      headers: requestHeaders,
      body: String(init?.body ?? ""),
      init,
    });
    return new Response(responseBody, { status, headers });
  }) as typeof fetch;
  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

let lookupSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // deliveryHostIsPublic performs a real DNS lookup; keep the suite hermetic.
  lookupSpy = vi.spyOn(dns, "lookup").mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
});

afterEach(() => {
  lookupSpy.mockRestore();
});

describe("deliverToWebhook", () => {
  it("posts a signed envelope a receiver can verify from the raw body", async () => {
    const receiver = mockReceiver(200);
    try {
      const now = new Date("2026-08-28T10:00:00.000Z");
      const outcome = await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT, now);
      expect(outcome.ok).toBe(true);

      const [sent] = receiver.captured;
      expect(sent.url).toBe(CREDENTIALS.url);
      expect(sent.headers["content-type"]).toBe("application/json");
      expect(sent.init?.redirect).toBe("manual");

      const timestamp = sent.headers[TIMESTAMP_HEADER.toLowerCase()];
      const signature = sent.headers[SIGNATURE_HEADER.toLowerCase()];
      expect(timestamp).toBe(String(Math.floor(now.getTime() / 1000)));

      // THE CUSTOMER-SIDE CHECK: HMAC over `${timestamp}.${rawBody}`.
      expect(verifyWebhookSignature(CREDENTIALS.secret, timestamp, sent.body, signature)).toBe(
        true
      );
    } finally {
      receiver.restore();
    }
  });

  it("signs the exact bytes sent, so a re-serialised body does not verify", async () => {
    const receiver = mockReceiver(200);
    try {
      await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT, new Date());
      const [sent] = receiver.captured;
      const timestamp = sent.headers[TIMESTAMP_HEADER.toLowerCase()];
      const signature = sent.headers[SIGNATURE_HEADER.toLowerCase()];
      const reserialised = JSON.stringify(JSON.parse(sent.body), null, 2);
      expect(verifyWebhookSignature(CREDENTIALS.secret, timestamp, reserialised, signature)).toBe(
        false
      );
    } finally {
      receiver.restore();
    }
  });

  it("sends the documented envelope shape", async () => {
    const receiver = mockReceiver(200);
    try {
      await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT, new Date("2026-08-28T10:00:00.000Z"));
      const body = JSON.parse(receiver.captured[0].body);
      expect(body).toMatchObject({
        version: WEBHOOK_VERSION,
        event: WEBHOOK_EVENT,
        leadId: "lead_1",
        sentAt: "2026-08-28T10:00:00.000Z",
      });
      expect(body.data.email).toBe("ada@acme.com");
      expect(body.data.firstName).toBe("Ada");
      expect(body.data.companySize).toBe("51-200");
    } finally {
      receiver.restore();
    }
  });

  it("classifies a 5xx as retryable and a 4xx as not", async () => {
    const server = mockReceiver(503);
    try {
      const outcome = await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT);
      expect(outcome).toMatchObject({ ok: false, retryable: true });
    } finally {
      server.restore();
    }

    const client = mockReceiver(400);
    try {
      const outcome = await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT);
      expect(outcome).toMatchObject({ ok: false, retryable: false });
    } finally {
      client.restore();
    }
  });

  it("treats a 3xx as a completed non-retryable delivery and never follows or reads it", async () => {
    const receiver = mockReceiver(302, "internal-secret", {
      location: "http://169.254.169.254/latest/meta-data",
    });
    try {
      const outcome = await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT);

      expect(outcome).toMatchObject({ ok: false, retryable: false });
      expect(outcome).toHaveProperty(
        "error",
        "Receiver responded 302 (redirects are not followed)"
      );
      expect(JSON.stringify(outcome)).not.toContain("internal-secret");
      expect(receiver.captured).toHaveLength(1);
      expect(receiver.captured[0].init?.redirect).toBe("manual");
    } finally {
      receiver.restore();
    }
  });

  it("still reads a short snippet from a non-3xx error response", async () => {
    const receiver = mockReceiver(400, "missing signature");
    try {
      const outcome = await deliverToWebhook(CREDENTIALS, "lead_1", CONTACT);

      expect(outcome).toMatchObject({ ok: false, retryable: false });
      expect(outcome).toHaveProperty("error", "Receiver responded 400: missing signature");
    } finally {
      receiver.restore();
    }
  });

  it("refuses to send when the host turns out to be internal", async () => {
    const receiver = mockReceiver(200);
    try {
      const outcome = await deliverToWebhook(
        { url: "http://169.254.169.254/hook", secret: "whsec_marvedge_test" },
        "lead_1",
        CONTACT
      );
      expect(outcome).toMatchObject({ ok: false, retryable: false });
      expect(receiver.captured).toHaveLength(0);
    } finally {
      receiver.restore();
    }
  });
});
