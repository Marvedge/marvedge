import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In Next 15, params must be awaited
    const { id } = await context.params;

    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        status: true,
        progress: true,
        exportedUrl: true,
        error: true,
        userId: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Map Prisma uppercase status → lowercase state for the frontend
    const stateMap: Record<string, string> = {
      PENDING: "waiting",
      PROCESSING: "active",
      COMPLETED: "completed",
      FAILED: "failed",
    };
    const state = stateMap[job.status] ?? job.status.toLowerCase();

    return NextResponse.json({
      success: true,
      state,
      progress: job.progress,
      exportedUrl: job.exportedUrl,
      error: job.error,
    });
  } catch (err) {
    console.error("Fetch Job Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
