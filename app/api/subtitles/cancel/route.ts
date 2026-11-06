import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

/**
 * POST /api/subtitles/cancel — stop waiting on a subtitle job (PRD §13).
 *
 * WHAT THIS ACTUALLY DOES, AND WHAT IT DOES NOT
 * ---------------------------------------------
 * It marks the VideoJob CANCELLED. That is the whole mechanism, and it is worth
 * being precise about, because "cancel" implies more than happens:
 *
 *   - The Cloud Run call ALREADY IN FLIGHT IS NOT ABORTED. `/subtitles` is one
 *     long opaque HTTP request with no cancellation channel; the worker
 *     downloads, extracts and transcribes to completion either way, and the
 *     Deepgram minutes are spent either way.
 *   - What cancelling buys is that the RESULT IS DISCARDED. The dispatcher in
 *     /api/subtitles/create re-reads the status before it writes anything, so
 *     cues from a cancelled run never land on the demo, never overwrite a track
 *     the user is happy with, and never flip the job to COMPLETED.
 *   - The client stops polling immediately, so the editor is usable again at
 *     once rather than at the end of the transcription.
 *
 * The UI copy says the same thing ("we'll discard the result") rather than
 * implying the work stops. Do not "improve" it into a promise this cannot keep.
 *
 * Cancelling is idempotent, and a job that has already finished is left alone:
 * there is nothing to discard once the cues are written, and rewriting a
 * COMPLETED job as CANCELLED would strip cues the user can already see.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
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

    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      select: { id: true, userId: true, status: true, jobData: true },
    });
    if (!job || job.userId !== user.id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Scoped to subtitle jobs on purpose. An export job's cancellation has
    // different consequences (a partially rendered, partially uploaded video)
    // and belongs in its own route, not smuggled in through this one.
    const kind =
      job.jobData && typeof job.jobData === "object"
        ? (job.jobData as Record<string, unknown>).kind
        : undefined;
    if (kind !== "SUBTITLES") {
      return NextResponse.json({ error: "Not a subtitle job" }, { status: 400 });
    }

    if (job.status === "COMPLETED" || job.status === "FAILED") {
      // Already settled. Report it rather than rewriting it — the cues from a
      // COMPLETED job are on the demo and the user can see them.
      return NextResponse.json({ success: true, cancelled: false, status: job.status });
    }

    // Check ownership, kind and active status in the same database write.
    // Completion/failure may have happened since the earlier read.
    const result = await prisma.videoJob.updateMany({
      where: {
        id: jobId,
        userId: user.id,
        status: { in: ["PENDING", "PROCESSING"] },
        jobData: { path: ["kind"], equals: "SUBTITLES" },
      },
      data: { status: "CANCELLED", error: "Cancelled by the user" },
    });

    if (result.count === 0) {
      const current = await prisma.videoJob.findUnique({
        where: { id: jobId },
        select: { userId: true, status: true },
      });

      if (!current || current.userId !== user.id) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        cancelled: current.status === "CANCELLED",
        status: current.status,
      });
    }

    return NextResponse.json({ success: true, cancelled: true, status: "CANCELLED" });
  } catch (err) {
    console.error("Subtitle Cancel Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
