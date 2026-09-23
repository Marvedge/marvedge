import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { z } from "zod";

// FIX: block javascript/data urls in CTA
function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Partial update: every field is optional, but at least one must be provided.
const updateCtaSchema = z
  .object({
    label: z.string().min(1, "Label is required"),
    url: z
      .string()
      .url("A valid URL is required")
      .refine(isHttpsUrl, { message: "URL must be https" }),
    placement: z.string().nullable(),
    order: z.number().int(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nothing to update: provide label, url, placement or order",
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const body = await req.json();
    const parsed = updateCtaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    // Scope the write to CTAs whose demo belongs to the logged-in user so a CTA
    // can only be edited by its owner. count === 0 covers not-found and not-owned.
    const result = await prisma.cta.updateMany({
      where: { id, demo: { userId: session.user.id } },
      data: parsed.data,
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "CTA not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, cta: { id } });
  } catch (error) {
    console.error("CTA PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Scope the delete to CTAs whose demo belongs to the logged-in user.
    const result = await prisma.cta.deleteMany({
      where: { id, demo: { userId: session.user.id } },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "CTA not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CTA DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
