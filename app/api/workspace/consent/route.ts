import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          session.user.id ? { id: session.user.id as string } : undefined,
          session.user.email ? { email: session.user.email } : undefined,
        ].filter(Boolean) as Array<{ id?: string; email?: string }>,
      },
      select: {
        id: true,
        workspaceConsent: {
          select: {
            voiceCloningConsent: true,
            faceTrackingConsent: true,
            voiceCloningConsentAt: true,
            faceTrackingConsentAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const consent = {
      voiceCloningConsent: user.workspaceConsent?.voiceCloningConsent ?? false,
      faceTrackingConsent: user.workspaceConsent?.faceTrackingConsent ?? false,
      voiceCloningConsentAt: user.workspaceConsent?.voiceCloningConsentAt ?? null,
      faceTrackingConsentAt: user.workspaceConsent?.faceTrackingConsentAt ?? null,
      updatedAt: user.workspaceConsent?.updatedAt ?? null,
    };

    return NextResponse.json(
      {
        success: true,
        ...consent,
        consent,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/workspace/consent error:", error);
    return NextResponse.json({ error: "Failed to fetch workspace consent" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          session.user.id ? { id: session.user.id as string } : undefined,
          session.user.email ? { email: session.user.email } : undefined,
        ].filter(Boolean) as Array<{ id?: string; email?: string }>,
      },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const body = parsedBody as Record<string, unknown>;
    const { voiceCloningConsent, faceTrackingConsent } = body;

    if (voiceCloningConsent === undefined && faceTrackingConsent === undefined) {
      return NextResponse.json(
        { error: "At least one consent field must be provided" },
        { status: 400 }
      );
    }

    if (voiceCloningConsent !== undefined && typeof voiceCloningConsent !== "boolean") {
      return NextResponse.json({ error: "voiceCloningConsent must be a boolean" }, { status: 400 });
    }

    if (faceTrackingConsent !== undefined && typeof faceTrackingConsent !== "boolean") {
      return NextResponse.json({ error: "faceTrackingConsent must be a boolean" }, { status: 400 });
    }

    const now = new Date();
    const updateData: {
      voiceCloningConsent?: boolean;
      voiceCloningConsentAt?: Date;
      faceTrackingConsent?: boolean;
      faceTrackingConsentAt?: Date;
    } = {};

    if (typeof voiceCloningConsent === "boolean") {
      updateData.voiceCloningConsent = voiceCloningConsent;
      updateData.voiceCloningConsentAt = now;
    }

    if (typeof faceTrackingConsent === "boolean") {
      updateData.faceTrackingConsent = faceTrackingConsent;
      updateData.faceTrackingConsentAt = now;
    }

    const updated = await prisma.workspaceConsent.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        voiceCloningConsent: typeof voiceCloningConsent === "boolean" ? voiceCloningConsent : false,
        voiceCloningConsentAt: typeof voiceCloningConsent === "boolean" ? now : null,
        faceTrackingConsent: typeof faceTrackingConsent === "boolean" ? faceTrackingConsent : false,
        faceTrackingConsentAt: typeof faceTrackingConsent === "boolean" ? now : null,
      },
      update: updateData,
    });

    const consent = {
      voiceCloningConsent: updated.voiceCloningConsent,
      faceTrackingConsent: updated.faceTrackingConsent,
      voiceCloningConsentAt: updated.voiceCloningConsentAt,
      faceTrackingConsentAt: updated.faceTrackingConsentAt,
      updatedAt: updated.updatedAt,
    };

    return NextResponse.json(
      {
        success: true,
        ...consent,
        consent,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/workspace/consent error:", error);
    return NextResponse.json({ error: "Failed to update workspace consent" }, { status: 500 });
  }
}
