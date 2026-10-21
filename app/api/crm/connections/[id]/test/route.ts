// POST /api/crm/connections/[id]/test — send a synthetic lead through the REAL
// delivery path and report the REAL error.
//
// THE POINT IS THAT IT IS THE REAL PATH. A "test" that validates the shape of a
// token and reports success teaches the owner nothing: the failures that matter
// are a token without the right scope, an org id from the wrong sandbox, a
// webhook receiver that 500s. So this calls deliver() with the same resolved
// connection, the same normalizeLead() output and the same error classification
// that a live lead would take, and hands back whatever came out.
//
// WHAT IS SYNTHETIC: the contact. It is an obviously fake record with a
// documented address on a reserved domain, so a test lands in the CRM as
// something a human can recognise and delete rather than as a plausible
// prospect. NO REAL LEAD IS EVER USED — a test button that forwards a real
// person's details to a CRM the owner is still setting up would be a disclosure,
// not a diagnostic.
//
// WHAT IS NOT SYNTHETIC: the credentials, the network call, and the error.
//
// No LeadDelivery row is written. There is no Lead behind this, and inventing
// one would put a fake record in the owner's lead ledger.

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { isCrmActionRateLimited } from "@/app/lib/crm/abuseProtection";
import { resolveConnection } from "@/app/lib/crm/connection";
import { deliver } from "@/app/lib/crm";
import { normalizeLead } from "@/app/lib/crm/normalize";
import { resolveCrmOwner } from "@/app/lib/crm/owner";
import { safeError } from "@/app/lib/crm/state";
import { isOverlaysCrmEnabled } from "@/app/lib/overlays/flags";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * example.com is reserved by RFC 2606 for exactly this: it can never belong to
 * anyone, so a test contact cannot collide with a real person's record.
 */
const SYNTHETIC = {
  email: "marvedge-test@example.com",
  name: "Marvedge Test",
};

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }
  const { id } = await params;

  // The same gate the live path uses. Testing a connection is an outbound
  // delivery, and locked decision 13 puts the whole outbound path behind this
  // flag — so with it off the answer is an honest "delivery is disabled here",
  // not a green tick that means nothing.
  if (!isOverlaysCrmEnabled()) {
    return NextResponse.json(
      {
        error:
          "CRM delivery is disabled on this deployment (OVERLAYS_CRM_ENABLED). Nothing was sent.",
      },
      { status: 503 }
    );
  }

  const row = await prisma.crmConnection.findFirst({
    where: { id, userId: resolved.owner.userId },
    select: { id: true, provider: true, credentials: true, fieldMap: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  if (await isCrmActionRateLimited(resolved.owner.userId, "connection-test")) {
    return NextResponse.json(
      { error: "Too many CRM actions. Please try again later." },
      { status: 429 }
    );
  }

  const connection = resolveConnection(row);
  if (!connection) {
    const error = "Stored credentials could not be read. Re-enter this connection's credentials.";
    await prisma.crmConnection.update({ where: { id: row.id }, data: { lastError: error } });
    return NextResponse.json({ success: false, error }, { status: 200 });
  }

  const contact = normalizeLead({
    email: SYNTHETIC.email,
    name: SYNTHETIC.name,
    companySize: "11-50",
    referrer: null,
    createdAt: new Date(),
    demoId: "test",
    demoTitle: "Marvedge connection test",
    demoUrl: null,
    consentText: null,
    consentAt: null,
  });

  const outcome = await deliver(connection, `test_${row.id}`, contact);
  const now = new Date();

  // The verdict is recorded on the connection, so the settings page shows the
  // same lastOkAt/lastError after a test as it would after a real delivery.
  await prisma.crmConnection.update({
    where: { id: row.id },
    data: outcome.ok ? { lastOkAt: now, lastError: null } : { lastError: safeError(outcome.error) },
  });

  console.log(
    `[ovl-crm] connection test user=${resolved.owner.userId} connection=${row.id} ok=${outcome.ok}`
  );

  // 200 either way: the REQUEST succeeded. The provider's verdict is in the
  // body, where the UI can render the actual error text rather than a status
  // code the owner cannot act on.
  return NextResponse.json({
    success: outcome.ok,
    detail: outcome.ok ? outcome.detail : undefined,
    error: outcome.ok ? undefined : safeError(outcome.error),
    lastOkAt: outcome.ok ? now.toISOString() : undefined,
  });
}
