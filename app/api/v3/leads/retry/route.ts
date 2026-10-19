// POST /api/v3/leads/retry — redrive FAILED CRM deliveries.
//
// This is the redrive half of "no queue" (locked decision 10): a LeadDelivery
// row is the queue, and this endpoint is what drains the failures. A CRM that
// was down for an hour leaves FAILED rows with a readable `lastError`; one call
// here puts them through.
//
// ============================================================================
// OWNER-SCOPED, DESPITE THE /api/v3 PREFIX
// ============================================================================
// /api/v3 is otherwise the PUBLIC, unauthenticated, viewer-facing namespace
// (decision 2). This route sits there because #302 names the path, and it is the
// ONE endpoint under that prefix that requires a session — so the guard is
// stated loudly rather than assumed from the neighbourhood. Nothing here is
// reachable without an authenticated PRO/ENTERPRISE session, and the sweep is
// filtered to the caller's own connections.
//
// IDEMPOTENT. Only FAILED rows are selected and a DELIVERED row is terminal
// (app/lib/crm/state.ts), so calling this twice — a double-click, an overlapping
// cron — cannot deliver the same lead to the same CRM twice.
//
// NO SCHEDULER IN THIS PR, deliberately. This is a button and an endpoint; what
// calls it on a timer is a separate decision, and a cron that authenticates as a
// service rather than as a user needs a credential model this repo does not have
// yet.

import { NextRequest, NextResponse } from "next/server";

import { isCrmActionRateLimited } from "@/app/lib/crm/abuseProtection";
import { retryFailedDeliveries } from "@/app/lib/crm/deliverLead";
import { resolveCrmOwner } from "@/app/lib/crm/owner";
import { isOverlaysCrmEnabled } from "@/app/lib/overlays/flags";

export const runtime = "nodejs";

// A sweep is bounded to 200 deliveries, each with its own bounded backoff. This
// matches app/api/jobs/create/route.ts's ceiling rather than the shorter one on
// /api/v3/leads, because this route does the work in the request rather than in
// after() — the caller wants the summary.
export const maxDuration = 300;

/** Bounds one sweep. Call again for more; it is idempotent. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function POST(request: NextRequest) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }

  if (!isOverlaysCrmEnabled()) {
    return NextResponse.json(
      {
        error:
          "CRM delivery is disabled on this deployment (OVERLAYS_CRM_ENABLED). Nothing was sent.",
      },
      { status: 503 }
    );
  }

  if (await isCrmActionRateLimited(resolved.owner.userId, "retry-failed-deliveries")) {
    return NextResponse.json(
      { error: "Too many CRM actions. Please try again later." },
      { status: 429 }
    );
  }

  const requested = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  const summary = await retryFailedDeliveries({ userId: resolved.owner.userId, limit });

  return NextResponse.json({ success: true, ...summary });
}
