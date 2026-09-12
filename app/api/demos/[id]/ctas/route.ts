import { prisma } from "@/app/lib/prisma";
import { BRANCH_PLACEMENTS } from "@/app/lib/overlays/branch";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function resolveOwnedDemo(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const demo = await prisma.demo.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    select: { id: true },
  });

  if (!demo) {
    return {
      error: NextResponse.json({ error: "Demo not found" }, { status: 404 }),
    };
  }

  return { demo };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedDemo(id);
  if ("error" in owned) {
    return owned.error;
  }

  // Branch cards are Cta rows (decision 6) but they are OWNED BY THE OVERLAYS
  // PANEL, not by this list: their label and url are rewritten from the overlay
  // config on every save, so offering them here would offer an edit that the
  // next save silently reverts — and a delete that would quietly stop the cards
  // writing CtaClick rows. `placement` is null on every CTA created through this
  // route, so nothing that belongs in the list is excluded by it. The OR is
  // spelled out because SQL's `NOT IN` is NULL, not true, for a null column.
  const ctas = await prisma.cta.findMany({
    where: {
      demoId: id,
      OR: [{ placement: null }, { placement: { notIn: [...BRANCH_PLACEMENTS] } }],
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ success: true, ctas });
}

// FIX: block javascript/data urls in CTA
function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const createCtaSchema = z.object({
  label: z.string().trim().min(1, "label is required"),
  url: z
    .string()
    .trim()
    .min(1, "url is required")
    .refine(isHttpsUrl, { message: "URL must be https" }),
  placement: z.string().optional(),
  order: z.number().int().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedDemo(id);
  if ("error" in owned) {
    return owned.error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createCtaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { label, url, placement, order } = parsed.data;

  // Default order to one past the current highest order on this demo.
  let nextOrder = order;
  if (typeof nextOrder !== "number") {
    const max = await prisma.cta.aggregate({
      where: { demoId: id },
      _max: { order: true },
    });
    nextOrder = (max._max.order ?? -1) + 1;
  }

  const cta = await prisma.cta.create({
    data: {
      demoId: id,
      label,
      url,
      placement: placement ?? null,
      order: nextOrder,
    },
  });

  return NextResponse.json({ success: true, cta }, { status: 201 });
}
