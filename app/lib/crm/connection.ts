// Validating and resolving a CrmConnection.
//
// Two jobs, both of which have to happen before anything is stored or sent:
//   1. VALIDATE what the owner typed, per provider, with zod — same shape as the
//      CTA routes' schemas (app/api/demos/[id]/ctas/route.ts).
//   2. RESOLVE a stored row into a ResolvedConnection with its credentials
//      decrypted, or nothing at all.
//
// The webhook URL is the one field here that is an SSRF surface: we POST to
// whatever the owner types. It is restricted to https and to a public host, so a
// connection cannot be pointed at `http://169.254.169.254/…` or at something
// inside the deployment's own network. That check runs on SAVE, so a rejected
// URL is a form error the owner can see, not a silent delivery failure later.

import { z } from "zod";

import { decryptCredentials } from "./crypto";
import { CRM_PROVIDERS, isCrmProvider } from "./types";
import type {
  CrmCredentials,
  CrmProvider,
  HubspotCredentials,
  ResolvedConnection,
  SalesforceCredentials,
  WebhookCredentials,
} from "./types";

// --- Input validation ------------------------------------------------------

const hubspotSchema = z.object({
  token: z.string().trim().min(10, "A HubSpot Private App token is required"),
});

const salesforceSchema = z.object({
  // 15 or 18 characters, alphanumeric. Salesforce shows the 18-character form in
  // Setup and the 15-character form in older Web-to-Lead HTML; both work.
  oid: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/,
      "A 15- or 18-character Salesforce org id is required"
    ),
  endpoint: z.string().trim().url().optional(),
  returnUrl: z.string().trim().url().optional(),
});

const webhookSchema = z.object({
  url: z.string().trim().url("A valid https:// URL is required"),
  secret: z.string().trim().min(16, "A signing secret of at least 16 characters is required"),
});

export const crmProviderSchema = z.enum(CRM_PROVIDERS);

/** Owner-supplied property/field-id overrides. Flat string→string, bounded. */
export const fieldMapSchema = z
  .record(z.string().trim().min(1), z.string().trim().min(1))
  .optional();

export type CredentialValidation =
  | { ok: true; credentials: CrmCredentials }
  | { ok: false; error: string };

/**
 * Validate credentials for a provider. Returns a MESSAGE, never the input:
 * echoing a rejected token back in an error is how it ends up in a log.
 */
export function parseCredentials(provider: CrmProvider, input: unknown): CredentialValidation {
  const schema =
    provider === "hubspot"
      ? hubspotSchema
      : provider === "salesforce"
        ? salesforceSchema
        : webhookSchema;

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid credentials" };
  }

  if (provider === "webhook") {
    const urlError = validateWebhookUrl((parsed.data as WebhookCredentials).url);
    if (urlError) {
      return { ok: false, error: urlError };
    }
  }

  return { ok: true, credentials: parsed.data as CrmCredentials };
}

/**
 * Hosts a webhook may not point at. Blocks the obvious SSRF targets — loopback,
 * link-local (including the cloud metadata address) and the RFC1918 ranges — by
 * literal form rather than by resolving DNS.
 *
 * THIS IS NOT A COMPLETE SSRF DEFENCE and should not be described as one: a
 * hostname that resolves to a private address passes this check, because
 * resolving it here and connecting later is a TOCTOU race that a determined
 * attacker wins anyway. What it does buy is that the easy, accidental and
 * copy-pasted cases are refused at the point the owner types them. The real
 * boundary is that only an authenticated owner can create a connection at all,
 * and the request carries no credentials of ours.
 */
const BLOCKED_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^\[::1\]$/,
  /^169\.254\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.local$/i,
  /\.internal$/i,
];

export function validateWebhookUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "A valid https:// URL is required";
  }
  if (url.protocol !== "https:") {
    // A lead is PII in the body of this request. Plaintext http is not an
    // option, and allowing it "just for testing" is how it reaches production.
    return "The webhook URL must use https://";
  }
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    return "The webhook URL must point at a public host";
  }
  return null;
}

// --- Resolving a stored row ------------------------------------------------

/** The subset of a CrmConnection row this module needs. Not the Prisma type. */
export interface StoredConnection {
  id: string;
  provider: string;
  credentials: unknown;
  fieldMap: unknown;
}

/**
 * Decrypt and shape a stored row for delivery. Returns null when the provider is
 * unknown or the envelope cannot be decrypted (a rotated-away key, a hand-edited
 * row) — the caller records that as a non-retryable failure on the delivery
 * rather than throwing, so one broken connection cannot stop the others.
 */
export function resolveConnection(stored: StoredConnection): ResolvedConnection | null {
  if (!isCrmProvider(stored.provider)) {
    return null;
  }
  const credentials = decryptCredentials(stored.credentials);
  if (credentials === null) {
    return null;
  }
  const parsed = parseCredentials(stored.provider, credentials);
  if (!parsed.ok) {
    return null;
  }
  return {
    id: stored.id,
    provider: stored.provider,
    credentials: parsed.credentials,
    fieldMap: normalizeFieldMap(stored.fieldMap),
  };
}

/** A stored Json column is `unknown`; flatten it to the string map we promise. */
export function normalizeFieldMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      out[key] = entry.trim();
    }
  }
  return out;
}

export type { HubspotCredentials, SalesforceCredentials, WebhookCredentials };
