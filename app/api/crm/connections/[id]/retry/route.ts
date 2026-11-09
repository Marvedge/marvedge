// POST /api/crm/connections/[id]/retry — resend this connection's FAILED
// deliveries.
//
// The per-connection form of POST /api/v3/leads/retry, for the "resend" button
// next to a connection in Settings. Same guarantees: only FAILED rows are
// selected, DELIVERED rows are never re-sent, so clicking twice cannot deliver a
// lead twice.

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { isCrmActionRateLimited } from "@/app/lib/crm/abuseProtection";
import { retryFailedDeliveries } from "@/app/lib/crm/deliverLead";
import { resolveCrmOwner } from "@/app/lib/crm/owner";
import { isOverlaysCrmEnabled } from "@/app/lib/overlays/flags";

export const runtime = "nodejs";

// Bounded by the per-run cap in retryFailedDeliveries() rather than by time, but
// a sweep of fifty deliveries against a slow provider needs room.
export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }
  const { id } = await params;

  if (!isOverlaysCrmEnabled()) {
    return NextResponse.json(
      {
        error:
          "CRM delivery is disabled on this deployment (OVERLAYS_CRM_ENABLED). Nothing was sent.",
      },
      { status: 503 }
    );
  }

  // Ownership is checked here as well as inside retryFailedDeliveries()'s
  // `connection: { userId }` filter, so a connection id that is not the caller's
  // gets a 404 rather than a successful-looking sweep of zero rows.
  const connection = await prisma.crmConnection.findFirst({
    where: { id, userId: resolved.owner.userId },
    select: { id: true },
  });
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (await isCrmActionRateLimited(resolved.owner.userId, "retry-failed-deliveries")) {
    return NextResponse.json(
      { error: "Too many CRM actions. Please try again later." },
      { status: 429 }
    );
  }

  const summary = await retryFailedDeliveries({
    userId: resolved.owner.userId,
    connectionId: connection.id,
  });

  return NextResponse.json({ success: true, ...summary });
}
