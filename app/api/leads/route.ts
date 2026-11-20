// GET /api/leads — the owner's lead inbox: paginated, filterable by demo.
//
// OWNER-FACING, so it lives under /api and NOT under /api/v3 (locked decision
// 2): /api/v3 is the public viewer-facing namespace where leads are WRITTEN.
// This is where they are read back, and it requires a session.
//
// Scoped with `demo: { userId }` in the where clause, following the template in
// app/api/demos/[id]/ctas/route.ts — not-found and not-owned collapse into the
// same empty result, so this endpoint cannot be used to discover whether a demo
// id exists.
//
// ============================================================================
// PII: READ, NEVER LOGGED
// ============================================================================
// This route RETURNS names and email addresses — that is its whole job, to their
// own owner, over an authenticated session. It still may not LOG any of them.
// Every log line and every error message here is a literal, exactly as in
// app/api/v3/leads/route.ts. A 500 from this route says "Failed to load leads"
// and nothing about which lead it choked on.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { parsePagination } from "@/app/lib/http/pagination";
import { summarizeDeliveries } from "@/app/lib/overlays/csv";

export const runtime = "nodejs";

/** Page size. Bounded so a workspace with 50k leads cannot ask for all of them. */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const params = request.nextUrl.searchParams;

  const { page, pageSize, skip } = parsePagination(params, {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  });

  // An unknown or unowned demoId is not an error: it filters to nothing, exactly
  // as a demo with no leads does. Nothing here distinguishes the two.
  const demoId = params.get("demoId")?.trim() || null;

  // The ownership predicate. Applied to every query below without exception —
  // there is no code path in this file that reads a Lead without it.
  const where = {
    demo: { userId },
    ...(demoId ? { demoId } : {}),
  };

  try {
    const [total, leads, demos] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          companySize: true,
          createdAt: true,
          consentAt: true,
          consentText: true,
          referrer: true,
          demoId: true,
          demo: { select: { id: true, title: true } },
          deliveries: {
            select: {
              id: true,
              status: true,
              attempts: true,
              lastError: true,
              deliveredAt: true,
              connection: { select: { id: true, provider: true } },
            },
          },
        },
      }),
      // The filter dropdown's options. Only demos that actually have a lead —
      // a list of every demo the user owns would be mostly noise.
      prisma.demo.findMany({
        where: { userId, leads: { some: {} } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      leads: leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        companySize: lead.companySize,
        createdAt: lead.createdAt,
        consentAt: lead.consentAt,
        consentText: lead.consentText,
        referrer: lead.referrer,
        demoId: lead.demoId,
        demoTitle: lead.demo?.title ?? null,
        deliveries: lead.deliveries.map((delivery) => ({
          id: delivery.id,
          provider: delivery.connection.provider,
          status: delivery.status,
          attempts: delivery.attempts,
          // Already redacted at write time by safeError() in
          // app/lib/crm/state.ts — a provider's error body can quote the lead
          // back at you, and that is stripped before it is ever stored.
          lastError: delivery.lastError,
          deliveredAt: delivery.deliveredAt,
        })),
        deliverySummary: summarizeDeliveries(
          lead.deliveries.map((d) => ({ provider: d.connection.provider, status: d.status }))
        ),
      })),
      demos,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    // A literal plus the error's own message. Prisma can quote its arguments,
    // and this query's arguments include a userId but never a lead field.
    console.error(
      "[ovl-leads] list failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}
