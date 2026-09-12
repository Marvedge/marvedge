// Salesforce — Web-to-Lead.
//
// WHY WEB-TO-LEAD AND NOT A CONNECTED APP: it is a form-encoded POST to a public
// endpoint with an org id and a set of field ids. No OAuth, no connected app, no
// security review, nothing to procure — the customer copies their org id out of
// Setup and pastes it in. Locked decision 19. Connected-app client-credentials
// is a later upgrade for customers who need confirmed writes; it is not v1.
//
// ============================================================================
// WEB-TO-LEAD RETURNS NO CONFIRMATION. READ THIS BEFORE "FIXING" ANYTHING.
// ============================================================================
// The endpoint answers 200 with an HTML page (or a redirect to `retURL`) for a
// valid submission, an invalid one, a wrong org id and a field id that does not
// exist. THERE IS NO RESPONSE BODY TO PARSE — no lead id, no error list, no
// JSON. Salesforce queues the submission and, if it cannot be processed, emails
// the org's Web-to-Lead contact. That is the whole feedback channel.
//
// So: a 2xx marks the delivery DELIVERED, and DELIVERED here means ACCEPTED, not
// CREATED. The settings UI says exactly that, in those words, and must keep
// saying it. Do not "improve" this module by parsing the response — there is
// nothing in it. Do not treat the HTML as an error signal — it is the same HTML
// on success. If confirmed writes are needed, that is the connected-app upgrade,
// not a change to this file.
//
// FIELD IDS. Standard Lead fields use documented names (`first_name`,
// `last_name`, `email`, `company`, `lead_source`, `description`). Custom fields
// use the 15-character id Salesforce shows in the Web-to-Lead HTML generator
// (`00N…`). UNKNOWN FIELDS ARE SILENTLY DROPPED — Salesforce does not complain
// about a field id it does not recognise. That is why company size defaults into
// `description` rather than a guessed standard field: a guess that is wrong
// loses the data with no error anywhere.

import { UNKNOWN_COMPANY, sourceDescription } from "./normalize";
import { deliveryHostIsPublic } from "./deliveryCheck";
import type { NormalizedContact } from "./normalize";
import type { DeliveryOutcome, SalesforceCredentials } from "./types";

export const SALESFORCE_WEB_TO_LEAD_URL =
  "https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8";

export const SALESFORCE_TIMEOUT_MS = 10_000;

/**
 * Salesforce REQUIRES Lead.LastName. A viewer who typed a single-word name (or
 * no name at all, on a gate that does not ask for one) still has to land
 * somewhere, and a rejected submission would be a silently lost lead.
 *
 * The order below is "the most specific thing we actually know": the surname if
 * there is one, else the whole name, else the email local part, else this
 * literal. It is never a fabricated surname.
 */
export const SALESFORCE_LAST_NAME_FALLBACK = "Unknown";

/**
 * Build the form body. PURE and exported so the mapping is testable without a
 * network call — which matters more here than anywhere else in this directory,
 * because the endpoint itself will never tell you the mapping was wrong.
 */
export function toWebToLeadFields(
  credentials: SalesforceCredentials,
  contact: NormalizedContact,
  fieldMap: Record<string, string> = {}
): Record<string, string> {
  const fields: Record<string, string> = {
    oid: credentials.oid,
    email: contact.email,
    last_name: resolveLastName(contact),
    company: contact.company || UNKNOWN_COMPANY,
    lead_source: contact.source,
    description: sourceDescription(contact),
  };

  if (contact.firstName && contact.lastName) {
    // Only when there IS a surname. Otherwise the single token is already in
    // last_name and repeating it as the first name duplicates it in the record.
    fields.first_name = contact.firstName;
  }

  if (credentials.returnUrl) {
    fields.retURL = credentials.returnUrl;
  }

  // Company size has no standard Web-to-Lead field, so it goes into
  // `description` (above) unless the owner maps it onto a custom field id.
  const companySizeField = fieldMap.companySize;
  if (companySizeField && contact.companySize) {
    fields[companySizeField] = contact.companySize;
  }

  const demoUrlField = fieldMap.demoUrl;
  if (demoUrlField && contact.demoUrl) {
    fields[demoUrlField] = contact.demoUrl;
  }

  return fields;
}

function resolveLastName(contact: NormalizedContact): string {
  if (contact.lastName) {
    return contact.lastName;
  }
  if (contact.firstName) {
    return contact.firstName;
  }
  const localPart = contact.email.split("@")[0];
  return localPart || SALESFORCE_LAST_NAME_FALLBACK;
}

export async function deliverToSalesforce(
  credentials: SalesforceCredentials,
  contact: NormalizedContact,
  fieldMap: Record<string, string> = {}
): Promise<DeliveryOutcome> {
  const endpoint = credentials.endpoint?.trim() || SALESFORCE_WEB_TO_LEAD_URL;
  const body = new URLSearchParams(toWebToLeadFields(credentials, contact, fieldMap));

  // same rebinding guard as webhooks: custom endpoints get rechecked now
  if (!(await deliveryHostIsPublic(endpoint))) {
    console.error("[crm] salesforce delivery blocked: unsafe host");
    return { ok: false, retryable: false, error: "Endpoint failed safety check" };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Web-to-Lead answers with a redirect when retURL is set. Following it
      // would fetch the customer's own thank-you page for no reason, so stop at
      // the 3xx and treat it as the success it is.
      redirect: "manual",
      signal: AbortSignal.timeout(SALESFORCE_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: `Salesforce request failed: ${error instanceof Error ? error.message : "network error"}`,
    };
  }

  // 2xx and 3xx both mean "accepted". See the header comment: there is no
  // confirmation to wait for, and `detail` says so rather than implying one.
  if (response.status < 400) {
    return {
      ok: true,
      detail: `Accepted by Salesforce Web-to-Lead (${response.status}) — unconfirmed: Web-to-Lead returns no creation receipt`,
    };
  }

  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500,
    error: `Salesforce Web-to-Lead responded ${response.status}. Check the org id and that Web-to-Lead is enabled for the org.`,
  };
}
