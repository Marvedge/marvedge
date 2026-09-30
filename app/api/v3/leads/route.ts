// POST /api/v3/leads — public, unauthenticated lead capture from the player.
//
// Same namespace reasoning as /api/v3/events: viewer-facing, no session, called
// from a page that may be served on a customer's own domain. middleware.ts
// rewrites a non-apex host to /hub/<domainKey>/… but skips everything under
// /api, so a gate on demos.acme.com posts same-origin here and lands on this
// handler in the same deployment, with the same mv_sid cookie scope.
//
// ============================================================================
// PII: THE ONE RULE
// ============================================================================
// `name`, `email` and `companySize` belong to someone who is not our user.
// NOTHING IN THIS FILE MAY LOG, ECHO OR THROW ANY OF THEM — not on success, not
// in an error, not in a message attached to an Error. Every log line below is a
// literal plus, at most, a demo id and an error CODE. That includes not logging
// `error.message` from Prisma: a validation error can quote the arguments it was
// given, and those arguments are the lead. app/api/views/route.ts sets this
// precedent; this holds it.
//
// The response is `{ ok: true }` and nothing else. The lead is never echoed
// back, so a caller cannot use this endpoint to read what is already stored.
//
// ============================================================================
// HOW HARD THIS ENDPOINT IS
// ============================================================================
// Rate limiting is MUCH tighter than /api/v3/events (5/min vs 120/min per
// IP+demo): a telemetry flush is not a user action, a lead submission is, and a
// lead table is a spam target in a way an events table is not. The honeypot and
// the minimum time-on-form are cheap bot filters and are documented as such in
// app/lib/overlays/lead.ts — they stop scripted form-fillers, not a person who
// reads the page.
//
// A bot signal (honeypot tripped, implausibly fast) answers 200 { ok: true }
// WITHOUT storing anything, deliberately: telling a script it was detected is
// how it learns to stop tripping the detector. A genuine validation failure does
// answer 400, because the human on the other end needs to know what to fix.

import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { deliverLead } from "@/app/lib/crm/deliverLead";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { isOverlaysAllowed } from "@/app/lib/overlays/access";
import { overlayConfigFromRow } from "@/app/lib/overlays/config";
import { isValidEmail, isWorkEmail, normalizeEmail } from "@/app/lib/overlays/email";
import { isOverlaysEnabled } from "@/app/lib/overlays/flags";
import {
  HONEYPOT_FIELD,
  isHoneypotTripped,
  isTooFastSubmission,
  parseLeadSubmission,
} from "@/app/lib/overlays/lead";
import { leadConsentText, renderConsentText } from "@/app/lib/overlays/leadGate";
import { applySessionCookie, readOrMintSessionId } from "@/app/lib/overlays/session";

// isRateLimited() talks to Redis over ioredis, a node TCP client that cannot run
// on the edge. Pinned so this route being silently edge-compiled — which would
// fail the limiter open on every request — is a build error rather than a
// discovery.
export const runtime = "nodejs";

// CRM fan-out runs in after(), AFTER the response has been sent — the same shape
// as dispatchVideoJob() in app/api/jobs/create/route.ts. The viewer is not made
// to wait on somebody else's CRM, but the invocation is still live while the
// deliveries run, so it needs a ceiling above the default. runDelivery() bounds
// itself well inside this (see app/lib/crm/state.ts); the headroom is for an
// owner with several connections.
export const maxDuration = 60;

/** Submissions per minute per IP+demo. A person fills this in once. */
const LEADS_RATE_LIMIT = 5;
const LEADS_RATE_WINDOW_SECONDS = 60;

/** Bounds the body we will read at all, before any parsing. */
const MAX_BODY_BYTES = 8 * 1024;

/** Codes the form maps to a message. Never a description of the input. */
type LeadError = "invalid" | "email" | "work_email" | "missing_fields" | "rate_limited";

/**
 * Best-effort client IP for rate limiting. Spoofable behind a proxy that does
 * not strip the header, which is acceptable: the limiter fails open by design
 * and this endpoint authorises nothing.
 */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const viewer = readOrMintSessionId(req);

  /** Every response goes through here, so mv_sid is set exactly once. */
  const respond = (body: unknown, status: number) => {
    const response = NextResponse.json(body, { status });
    applySessionCookie(response, viewer);
    return response;
  };
  const ok = () => respond({ ok: true }, 200);
  const fail = (error: LeadError, status: number) => respond({ ok: false, error }, status);
  /** One 404 for every kind of miss, so the endpoint cannot be probed. */
  const notFound = () => respond({ ok: false, error: "not_found" }, 404);

  if (!isOverlaysEnabled()) {
    return notFound();
  }

  // Read the raw text and parse it ourselves, matching /api/v3/events — the
  // form sends a JSON content-type, but a bounded read is cheaper than trusting
  // one.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return fail("invalid", 400);
  }
  if (rawBody.length === 0 || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return fail("invalid", 400);
  }

  const parsed = parseLeadSubmission(rawBody);
  if (!parsed.ok) {
    // `parsed` carries a reason literal and none of the submitted fields, which
    // is the whole point of parseLeadSubmission() returning it that way.
    return fail("invalid", 400);
  }
  const lead = parsed.lead;

  // Before any database work.
  const limited = await isRateLimited(
    `ovl:leads:${clientIp(req)}:${lead.demoId}`,
    LEADS_RATE_LIMIT,
    LEADS_RATE_WINDOW_SECONDS
  );
  if (limited) {
    return fail("rate_limited", 429);
  }

  // Bot filters. Answer as if it worked and store nothing.
  if (
    isHoneypotTripped(lead[HONEYPOT_FIELD]) ||
    isTooFastSubmission(lead.formOpenedAt, Date.now())
  ) {
    console.log(`[ovl-leads] rejected bot-signal demo=${lead.demoId}`);
    return ok();
  }

  const demo = await prisma.demo.findUnique({
    where: { id: lead.demoId },
    select: {
      id: true,
      isPublic: true,
      overlayConfig: true,
      user: { select: { name: true, plan: true } },
    },
  });

  // Not found, not public, gate not configured and owner not entitled all give
  // the same answer. Whether a private demo exists, and what plan somebody else
  // is on, are not things an unauthenticated caller gets to learn.
  if (!demo || !demo.isPublic) {
    return notFound();
  }

  const config = overlayConfigFromRow(demo.overlayConfig);
  const gate = config.leadGate;

  // A lead is only accepted for a demo that is actually asking for one.
  // Otherwise this is an open write endpoint against every public demo.
  if (!config.enabled || !gate.enabled) {
    return notFound();
  }

  // Decision 14, re-resolved server-side from User.plan on every submission —
  // an owner who enabled the gate on PRO and then downgraded stops collecting.
  if (!isOverlaysAllowed(demo.user?.plan)) {
    return notFound();
  }

  const email = normalizeEmail(lead.email);
  if (!isValidEmail(email)) {
    return fail("email", 400);
  }
  // Per-demo and off by default; see app/lib/overlays/email.ts.
  if (gate.requireWorkEmail && !isWorkEmail(email)) {
    return fail("work_email", 400);
  }

  // The owner chose which fields to ask for, so the server enforces the same
  // set the form marked required rather than trusting the form to have done it.
  const name = lead.name?.trim() ?? "";
  if (gate.fields.name && name.length === 0) {
    return fail("missing_fields", 400);
  }
  if (gate.fields.companySize && !lead.companySize) {
    return fail("missing_fields", 400);
  }

  // The exact sentence that was on screen. The fallback is only for a client
  // that sent no snapshot, and is itself rendered now rather than referenced
  // later — see leadConsentText().
  const consentText = leadConsentText(
    lead.consentText,
    renderConsentText(gate.consentText, demo.user?.name)
  );
  const consentAt = new Date();

  let leadId: string;
  try {
    // Upsert on @@unique([demoId, email]): a viewer who re-watches and fills the
    // form again updates their row instead of creating a second one. `createdAt`
    // is left alone, so "when did this lead first arrive" survives a re-watch,
    // while the consent snapshot is refreshed to the one they just agreed to.
    const stored = await prisma.lead.upsert({
      where: { demoId_email: { demoId: demo.id, email } },
      create: {
        demoId: demo.id,
        name,
        email,
        companySize: lead.companySize ?? null,
        sessionId: viewer.sessionId,
        referrer: lead.referrer ?? null,
        consentText,
        consentAt,
      },
      update: {
        name,
        companySize: lead.companySize ?? null,
        sessionId: viewer.sessionId,
        referrer: lead.referrer ?? null,
        consentText,
        consentAt,
      },
      select: { id: true },
    });
    leadId = stored.id;
  } catch (error) {
    // A CODE, never a message: Prisma's validation errors quote the arguments
    // they were given, and those arguments are this viewer's name and address.
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "none";
    console.error(`[ovl-leads] persist failed demo=${demo.id} code=${code}`);
    return fail("invalid", 500);
  }

  // lead_submitted is written HERE rather than emitted from the browser, so it
  // cannot be lost to a closed tab or a dropped beacon at the exact moment the
  // funnel's most valuable step happened. Same table, same session source
  // (mv_sid, never a client-supplied id) and the same event vocabulary as
  // /api/v3/events — the client deliberately does not also emit it, because two
  // writers would double-count every conversion.
  try {
    await prisma.playerEvent.create({
      data: {
        demoId: demo.id,
        sessionId: viewer.sessionId,
        name: "lead_submitted",
        positionSec: lead.positionSec ?? null,
        // No lead fields in `meta`. The event says a lead arrived; the Lead row
        // says who, under an owner-scoped read.
        meta: { mode: gate.mode },
      },
    });
  } catch (error) {
    // Telemetry must never fail a capture that already succeeded.
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "none";
    console.error(`[ovl-leads] event insert failed demo=${demo.id} code=${code}`);
  }

  // PR 4 — the OUTBOUND half of #302 §2.1. after() so the viewer's form closes
  // on our latency, not HubSpot's: the lead is already committed above, and a
  // CRM being down leaves a FAILED LeadDelivery row for the retry endpoint
  // rather than an error the viewer sees.
  //
  // deliverLead() checks isOverlaysCrmEnabled() itself, so with the flag off
  // this is a database read that finds nothing and writes nothing — leads are
  // still captured, they are simply not forwarded. It never throws.
  after(() => deliverLead(leadId));

  console.log(`[ovl-leads] captured demo=${demo.id}`);
  return ok();
}
