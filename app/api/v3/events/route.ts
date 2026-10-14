// POST /api/v3/events — public, unauthenticated player telemetry ingest.
//
// WHY /api/v3 AND NOT /api: this is a different contract from everything under
// /api. No session, viewer-facing, called from a page that may be served on a
// customer's own domain, and it has to stay stable for a future embed. No
// existing route moves here.
//
// THE CUSTOM-DOMAIN PATH: middleware.ts rewrites a non-apex host to
// /hub/<domainKey>/... but skips anything under /api — both in its explicit
// `url.pathname.startsWith("/api")` early return AND in its matcher's
// `(?!api|...)` negative lookahead. So a player served on demos.acme.com posts
// same-origin to https://demos.acme.com/api/v3/events and lands on this handler
// in the same Next deployment, with the same mv_sid cookie scope. No CORS, no
// cross-origin cookie problem.
//
// THIS ROUTE ALWAYS ANSWERS 204. Not "usually": a bad body, an unknown demo, a
// stale event name and a rate-limited caller are all indistinguishable from
// success on the wire. Telemetry is fire-and-forget from a sendBeacon that
// cannot read the response anyway, and an endpoint that reports why it rejected
// something is an endpoint that can be probed.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { isOverlaysEnabled } from "@/app/lib/overlays/flags";
import { parsePlayerEventBatch, selectKnownEvents } from "@/app/lib/overlays/events";
import { applySessionCookie, readOrMintSessionId } from "@/app/lib/overlays/session";

// isRateLimited() talks to Redis over ioredis, a node TCP client that cannot run
// on the edge runtime. nodejs is already the App Router default; pinning it here
// makes that a stated requirement rather than an inherited accident, because this
// route being silently edge-compiled would fail open on every request.
export const runtime = "nodejs";

/** Batches per minute per IP+target. Generous: a flush is not a user action. */
const EVENTS_RATE_LIMIT = 120;
const EVENTS_RATE_WINDOW_SECONDS = 60;

/** Bounds the body we will read at all, before any parsing. */
const MAX_BODY_BYTES = 64 * 1024;

/** 204 is the only response this route produces. */
function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Best-effort client IP for rate limiting. Spoofable behind a proxy that does not
 * strip it, which is acceptable — the limiter fails open by design and this is a
 * write-only endpoint that authorises nothing.
 */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  // Every exit below returns this same response object, so the cookie is set
  // exactly once and the status never varies.
  const viewer = readOrMintSessionId(req);
  const respond = () => {
    const response = noContent();
    applySessionCookie(response, viewer);
    return response;
  };

  if (!isOverlaysEnabled()) {
    return respond();
  }

  // sendBeacon with a Blob does not reliably set application/json, and req.json()
  // is content-type sensitive. Read the raw text and parse it ourselves.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return respond();
  }
  if (rawBody.length === 0 || Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return respond();
  }

  const parsed = parsePlayerEventBatch(rawBody);
  if (!parsed.ok) {
    return respond();
  }
  const { demoId, exportedVideoId } = parsed.batch;

  // An event attached to neither a demo nor an export is unattributable noise.
  if (!demoId && !exportedVideoId) {
    return respond();
  }

  // Keyed on IP + demoId, since there is no userId on a public endpoint.
  const limited = await isRateLimited(
    `ovl:events:${clientIp(req)}:${demoId ?? exportedVideoId}`,
    EVENTS_RATE_LIMIT,
    EVENTS_RATE_WINDOW_SECONDS
  );
  if (limited) {
    return respond();
  }

  // PlayerEvent.demoId is a real foreign key, so an unknown id would throw on
  // insert. Checking first keeps a junk payload from producing a stack trace.
  // This leaks nothing: the response is 204 whether the demo exists or not.
  if (demoId) {
    const demo = await prisma.demo.findUnique({ where: { id: demoId }, select: { id: true } });
    if (!demo) {
      return respond();
    }
  }

  const { events, droppedUnknown, droppedMeta } = selectKnownEvents(parsed.batch.events);

  // Counters only. Never the payload, never a demo id, never anything the caller
  // typed — app/api/views/route.ts sets that precedent and this holds it.
  if (droppedUnknown > 0 || droppedMeta > 0) {
    console.log(`[ovl-events] dropped unknown=${droppedUnknown} oversized-meta=${droppedMeta}`);
  }

  if (events.length === 0) {
    return respond();
  }

  try {
    await prisma.playerEvent.createMany({
      data: events.map((event) => ({
        demoId: demoId ?? null,
        exportedVideoId: exportedVideoId ?? null,
        // The cookie, never batch.sessionId — a client-supplied id is forgeable.
        sessionId: viewer.sessionId,
        name: event.name,
        positionSec: event.positionSec ?? null,
        meta: (event.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        // `timestamp` is left to the DB default. The client's `at` orders events
        // within the batch and is deliberately not written.
      })),
    });
  } catch (error) {
    // A literal plus the error's own message; the payload never reaches a log.
    console.error(
      "[ovl-events] insert failed:",
      error instanceof Error ? error.message : "unknown error"
    );
  }

  return respond();
}
