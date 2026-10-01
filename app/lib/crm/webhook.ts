// The generic signed webhook — the escape hatch.
//
// BUILT FIRST, deliberately. A customer on neither HubSpot nor Salesforce still
// gets their leads, and this is the one provider that can be verified end to end
// without anybody's sandbox: point it at a local server, check the signature,
// done. If the rest of this directory is broken, this path proves whether the
// problem is in delivery or in a provider adapter.
//
// The body is a stable JSON envelope. Fields may be ADDED to it; renaming or
// removing one breaks every receiver, so treat it as a public contract — the
// same reason /api/v3 exists at all.
//
// SIGNING IS IN ./signature.ts, with the scheme written out there and in
// ./README.md. What matters here: the signature covers THE EXACT BYTES POSTED,
// so `body` is serialised once and both signed and sent, never re-serialised.

import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signWebhookPayload } from "./signature";
import { deliveryHostIsPublic } from "./deliveryCheck";
import type { NormalizedContact } from "./normalize";
import type { DeliveryOutcome, WebhookCredentials } from "./types";

/** Envelope version. Bumped only on a breaking change to the field set. */
export const WEBHOOK_EVENT = "lead.created";
export const WEBHOOK_VERSION = 1;

/** Network/response ceiling. A receiver that is slower than this is failing. */
export const WEBHOOK_TIMEOUT_MS = 10_000;

export interface WebhookEnvelope {
  version: number;
  event: typeof WEBHOOK_EVENT;
  leadId: string;
  sentAt: string;
  data: NormalizedContact;
}

export function buildWebhookEnvelope(leadId: string, contact: NormalizedContact, now: Date) {
  const envelope: WebhookEnvelope = {
    version: WEBHOOK_VERSION,
    event: WEBHOOK_EVENT,
    leadId,
    sentAt: now.toISOString(),
    data: contact,
  };
  return envelope;
}

export async function deliverToWebhook(
  credentials: WebhookCredentials,
  leadId: string,
  contact: NormalizedContact,
  now: Date = new Date()
): Promise<DeliveryOutcome> {
  // Serialise ONCE. Signing a second serialisation would produce a signature the
  // receiver cannot reproduce from the bytes it actually received.
  const rawBody = JSON.stringify(buildWebhookEnvelope(leadId, contact, now));
  const timestamp = Math.floor(now.getTime() / 1000);

  // the url was fine when the owner saved it, make sure it still is now
  if (!(await deliveryHostIsPublic(credentials.url))) {
    console.error("[crm] webhook delivery blocked: unsafe host");
    return { ok: false, retryable: false, error: "Webhook host failed safety check" };
  }

  let response: Response;
  try {
    response = await fetch(credentials.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signWebhookPayload(credentials.secret, timestamp, rawBody),
        "User-Agent": "Marvedge-Webhook/1",
      },
      body: rawBody,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (error) {
    // DNS, TLS, connection refused, timeout — all worth retrying. The message is
    // ours, not the receiver's, so there is nothing to redact here; state.ts
    // redacts anyway on the way to the database.
    return {
      ok: false,
      retryable: true,
      error: `Webhook request failed: ${error instanceof Error ? error.message : "network error"}`,
    };
  }

  if (response.ok) {
    return { ok: true, detail: `Receiver responded ${response.status}` };
  }

  // A body is read only to make the error readable, and only a little of it: a
  // receiver that echoes the payload back in its 400 would otherwise put the
  // lead's address into lastError.
  const snippet = await readSnippet(response);
  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500,
    error: `Receiver responded ${response.status}${snippet ? `: ${snippet}` : ""}`,
  };
}

async function readSnippet(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return "";
  }
}
