import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAwsJobProgress } from "@/app/lib/awsJobProgress";
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
        jobData: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const useGcpWorker = process.env.USE_GCP_WORKER === "true";
    const useAwsProgress = !useGcpWorker && process.env.USE_AWS_SPLITTER === "true";
    const awsProgress = useAwsProgress ? await getAwsJobProgress(id) : null;

    const state = awsProgress?.state ?? {
      PENDING: "waiting",
      PROCESSING: "active",
      COMPLETED: "completed",
      FAILED: "failed",
    }[job.status] ?? job.status.toLowerCase();

    const progress = awsProgress?.progress ?? job.progress;
    const exportedUrl = awsProgress?.exportedUrl ?? job.exportedUrl;
    const error = awsProgress?.error ?? job.error;

    const jobData = job.jobData as unknown;
    let subtitles: unknown = null;
    if (jobData && typeof jobData === "object") {
      const rec = jobData as Record<string, unknown>;
      if (rec.kind === "SUBTITLES") {
        subtitles = rec.subtitles ?? null;
      }
    }

    return NextResponse.json({
      success: true,
      state,
      progress,
      exportedUrl,
      error,
      subtitles,
    });
  } catch (err) {
    console.error("Fetch Job Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
