import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

/**
 * PATCH /api/demo/duration
 * Saves a probed video duration for a demo.
 * Body: { id: string, duration: number }
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, duration } = await req.json();
    if (
      typeof id !== "string" ||
      !id ||
      typeof duration !== "number" ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return NextResponse.json({ error: "Invalid id or duration" }, { status: 400 });
    }

    // Only update if the demo belongs to the current user and doesn't already have a duration
    const result = await prisma.demo.updateMany({
      where: { id, userId: session.user.id, duration: null },
      data: { duration },
    });

    return NextResponse.json({ success: true, updated: result.count > 0 });
  } catch (error) {
    console.error("Demo duration update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
