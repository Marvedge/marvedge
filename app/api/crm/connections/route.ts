// Owner-facing CRM connection management.
//
// Per-USER, not per-demo, so it sits at /api/crm/... alongside /api/hub rather
// than under /api/demos/[id]/... . "Workspace" in #302 means the User who owns
// the Demo (locked decision 3); if a real Workspace model ever lands, the only
// thing that moves is `userId` on the row.
//
// SHAPE COPIED FROM app/api/demos/[id]/ctas/route.ts: a session check, a zod
// schema, and writes scoped so that not-found and not-owned collapse into one
// 404. See ./[id]/route.ts for the updateMany form of that.
//
// ============================================================================
// NO ROUTE IN THIS DIRECTORY EVER RETURNS A CREDENTIAL
// ============================================================================
// GET returns MaskedConnection (app/lib/crm/mask.ts) — a provider, a hint, and
// the last outcome. A token that has been stored is write-only from then on: to
// change it you send a new one. There is no "reveal" endpoint and there must not
// be one, because a session-hijack that can read every customer's CRM token is a
// much worse outcome than an owner having to paste a token twice.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/lib/prisma";
import {
  crmProviderSchema,
  fieldMapSchema,
  normalizeFieldMap,
  parseCredentials,
} from "@/app/lib/crm/connection";
import {
  decryptCredentials,
  encryptCredentials,
  isCrmCryptoConfigured,
} from "@/app/lib/crm/crypto";
import { maskConnection } from "@/app/lib/crm/mask";
import { resolveCrmOwner } from "@/app/lib/crm/owner";
import { isOverlaysCrmEnabled } from "@/app/lib/overlays/flags";
import type { CrmCredentials, CrmProvider } from "@/app/lib/crm/types";

// node:crypto and ioredis-free, but Prisma and node:crypto both need the node
// runtime. Pinned for the same reason /api/v3/leads is.
export const runtime = "nodejs";

/** A sane ceiling. An owner with more than this has a different problem. */
const MAX_CONNECTIONS_PER_USER = 10;

export async function GET() {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }

  const rows = await prisma.crmConnection.findMany({
    where: { userId: resolved.owner.userId },
    orderBy: { createdAt: "asc" },
  });

  // Failure counts per connection, so the settings page can offer "resend"
  // without loading the ledger. groupBy rather than a per-row count: this is the
  // read path a settings page hits on every open.
  const failures = await prisma.leadDelivery.groupBy({
    by: ["connectionId"],
    where: { status: "FAILED", connection: { userId: resolved.owner.userId } },
    _count: { _all: true },
  });
  const failedByConnection = new Map(failures.map((row) => [row.connectionId, row._count._all]));

  const connections = rows.map((row) => ({
    ...maskConnection({
      id: row.id,
      provider: row.provider as CrmProvider,
      enabled: row.enabled,
      // Decrypted ONLY to build the masked hint, and the plaintext never leaves
      // this expression. decryptCredentials returns null for a rotated-away key,
      // which maskConnection renders as "Credentials unavailable".
      credentials: decryptCredentials(row.credentials) as CrmCredentials | null,
      fieldMap: normalizeFieldMap(row.fieldMap),
      lastOkAt: row.lastOkAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
    }),
    failedDeliveries: failedByConnection.get(row.id) ?? 0,
  }));

  return NextResponse.json({
    success: true,
    connections,
    // So the UI can say plainly that delivery is switched off in this
    // environment rather than showing connections that will never fire.
    crmEnabled: isOverlaysCrmEnabled(),
  });
}

const createConnectionSchema = z.object({
  provider: crmProviderSchema,
  /** Provider-specific; validated by parseCredentials() once the provider is known. */
  credentials: z.unknown(),
  fieldMap: fieldMapSchema,
  enabled: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const resolved = await resolveCrmOwner();
  if ("error" in resolved) {
    return resolved.error;
  }

  // BEFORE the database. A missing key must fail loudly and early rather than
  // half-writing a row — see app/lib/crm/crypto.ts.
  if (!isCrmCryptoConfigured()) {
    return NextResponse.json(
      {
        error:
          "CRM credential encryption is not configured on this deployment (OVERLAYS_CRM_SECRET_KEY). Connections cannot be stored.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createConnectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const provider = parsed.data.provider as CrmProvider;
  const credentials = parseCredentials(provider, parsed.data.credentials);
  if (!credentials.ok) {
    // A message about the SHAPE of the credential, never the credential.
    return NextResponse.json({ error: credentials.error }, { status: 400 });
  }

  const count = await prisma.crmConnection.count({ where: { userId: resolved.owner.userId } });
  if (count >= MAX_CONNECTIONS_PER_USER) {
    return NextResponse.json(
      { error: `A maximum of ${MAX_CONNECTIONS_PER_USER} CRM connections is supported.` },
      { status: 400 }
    );
  }

  const row = await prisma.crmConnection.create({
    data: {
      userId: resolved.owner.userId,
      provider,
      credentials: encryptCredentials(credentials.credentials),
      fieldMap: parsed.data.fieldMap ?? {},
      enabled: parsed.data.enabled ?? true,
    },
  });

  console.log(`[ovl-crm] connection created user=${resolved.owner.userId} provider=${provider}`);

  return NextResponse.json(
    {
      success: true,
      connection: {
        ...maskConnection({
          id: row.id,
          provider,
          enabled: row.enabled,
          credentials: credentials.credentials,
          fieldMap: normalizeFieldMap(row.fieldMap),
          lastOkAt: row.lastOkAt,
          lastError: row.lastError,
          createdAt: row.createdAt,
        }),
        failedDeliveries: 0,
      },
    },
    { status: 201 }
  );
}
