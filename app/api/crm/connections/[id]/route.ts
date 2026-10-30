// PATCH / DELETE one CRM connection.
//
// Owner scoping follows app/api/ctas/[id]/route.ts: the write is filtered by
// `{ id, userId }` so a row that does not exist and a row belonging to somebody
// else produce THE SAME 404. Answering 403 for the second case would confirm
// that the id exists, which is an enumeration oracle for connection ids.
//
// Credentials are WRITE-ONLY. A PATCH may replace them; nothing reads them back.
// Omitting `credentials` leaves the stored envelope untouched, so an owner can
// toggle `enabled` or edit a fieldMap without re-pasting a token.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/lib/prisma";
import { crmProviderSchema, fieldMapSchema, parseCredentials } from "@/app/lib/crm/connection";
import { encryptCredentials, isCrmCryptoConfigured } from "@/app/lib/crm/crypto";
import { resolveCrmOwner } from "@/app/lib/crm/owner";
import type { CrmProvider } from "@/app/lib/crm/types";

export const runtime = "nodejs";

const updateConnectionSchema = z
  .object({
    enabled: z.boolean(),
    fieldMap: fieldMapSchema,
    /**
     * Replacing a credential requires naming the provider it is for, so a
     * HubSpot token cannot be validated against the webhook schema by a client
     * that got the two mixed up.
     */
    provider: crmProviderSchema,
    credentials: z.unknown(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nothing to update: provide enabled, fieldMap or credentials",
  });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (typeof parsed.data.enabled === "boolean") {
    data.enabled = parsed.data.enabled;
  }
  if (parsed.data.fieldMap) {
    data.fieldMap = parsed.data.fieldMap;
  }

  if (parsed.data.credentials !== undefined) {
    if (!isCrmCryptoConfigured()) {
      return NextResponse.json(
        {
          error:
            "CRM credential encryption is not configured on this deployment (OVERLAYS_CRM_SECRET_KEY). Connections cannot be stored.",
        },
        { status: 503 }
      );
    }
    // The provider must be stated, and must match the row, before the credential
    // is validated. Reading it from the row first means a client cannot swap a
    // connection's provider out from under its stored fieldMap.
    const existing = await prisma.crmConnection.findFirst({
      where: { id, userId: resolved.owner.userId },
      select: { provider: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    const provider = (parsed.data.provider ?? existing.provider) as CrmProvider;
    if (provider !== existing.provider) {
      return NextResponse.json(
        { error: "A connection's provider cannot be changed. Create a new connection instead." },
        { status: 400 }
      );
    }
    const credentials = parseCredentials(provider, parsed.data.credentials);
    if (!credentials.ok) {
      return NextResponse.json({ error: credentials.error }, { status: 400 });
    }
    data.credentials = encryptCredentials(credentials.credentials);
    // A fresh credential invalidates the previous verdict: leaving a stale
    // "invalid token" error next to a token that has just been replaced is how a
    // working connection gets reported as broken.
    data.lastError = null;
  }

  const result = await prisma.crmConnection.updateMany({
    where: { id, userId: resolved.owner.userId },
    data,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, connection: { id } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }
  const { id } = await params;

  // LeadDelivery rows for this connection go with it (onDelete: Cascade). That
  // is deliberate — a delivery record pointing at a CRM the owner has
  // disconnected can never be retried and is not evidence of anything.
  const result = await prisma.crmConnection.deleteMany({
    where: { id, userId: resolved.owner.userId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  console.log(`[ovl-crm] connection deleted user=${resolved.owner.userId}`);
  return NextResponse.json({ success: true });
}
