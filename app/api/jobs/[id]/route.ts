import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAwsJobProgress } from "@/app/lib/awsJobProgress";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

// VideoJob ids are cuid() strings. Accept those plus the short `xxx-N` style
// ids used across unit tests, but reject empty / oversized / path-like values
// before they ever reach Prisma (previously any string hit the database).
const MAX_JOB_ID_LENGTH = 200;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidJobId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= MAX_JOB_ID_LENGTH &&
    JOB_ID_PATTERN.test(id)
  );
}

// Closed mapping from internal DB status to the public `state` token every
// client poller switches on. Unknown values (e.g. a future worker status)
// resolve to "unknown" instead of leaking the raw DB string — pollers treat
// anything they don't recognize as keep-polling, so this is behavior-safe.
const JOB_STATUS_TO_STATE: Record<string, string> = {
  PENDING: "waiting",
  PROCESSING: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  // Written by /api/subtitles/cancel. Mapped explicitly so the client's
  // poll loop has a terminal state to stop on that is not "failed" — a
  // cancel the user asked for is not an error to report to them.
  CANCELLED: "cancelled",
};

const KNOWN_PUBLIC_STATES = new Set(Object.values(JOB_STATUS_TO_STATE));

function toPublicState(value: unknown): string {
  return typeof value === "string" && KNOWN_PUBLIC_STATES.has(value) ? value : "unknown";
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // In Next 15, params must be awaited
    const { id } = await context.params;

    if (!isValidJobId(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        id: true,
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

    const state = toPublicState(awsProgress?.state ?? JOB_STATUS_TO_STATE[job.status]);

    const progress = awsProgress?.progress ?? job.progress;
    const exportedUrl = awsProgress?.exportedUrl ?? job.exportedUrl;
    const error = awsProgress?.error ?? job.error;

    const jobData = job.jobData as unknown;
    let subtitles: unknown = null;
    // AVS time-alignment (kind: "AVS_SYNC" and the dub variant "AVS_DUB")
    // surfaces its aligned source here so the client can poll for it; additive
    // and inert for every other job kind.
    let aligned: { alignedVideoUrl: unknown; duration: unknown } | null = null;
    // Reframe saliency trajectory (kind: "REFRAME") surfaces cropTargets here.
    let cropTargets: unknown = null;
    let fallback: boolean | undefined = undefined;
    let fallbackStage: string | undefined = undefined;
    let fallbackReason: string | undefined = undefined;
    let attemptsMade: number | undefined = undefined;

    if (jobData && typeof jobData === "object" && !Array.isArray(jobData)) {
      const rec = jobData as Record<string, unknown>;
      if (rec.kind === "SUBTITLES") {
        subtitles = rec.subtitles ?? null;
      } else if (rec.kind === "AVS_SYNC" || rec.kind === "AVS_DUB") {
        aligned = {
          alignedVideoUrl: rec.alignedVideoUrl ?? null,
          duration: rec.duration ?? null,
        };
      } else if (rec.kind === "REFRAME") {
        cropTargets = rec.cropTargets ?? null;
      }

      if (rec.fallback !== undefined) {
        fallback = Boolean(rec.fallback);
      }
      if (typeof rec.fallbackStage === "string") {
        fallbackStage = rec.fallbackStage;
      }
      if (typeof rec.fallbackReason === "string") {
        fallbackReason = rec.fallbackReason;
      }
      if (typeof rec.attemptsMade === "number") {
        attemptsMade = rec.attemptsMade;
      }
    }

    return NextResponse.json({
      success: true,
      id,
      // `state` is the BullMQ-style token all existing client pollers read.
      // `status` is an alias so Task-82 callers and direct fetch() calls have a
      // consistent field without breaking the existing polling contract.
      state,
      status: state,
      progress,
      exportedUrl,
      error,
      subtitles,
      // Expose the raw jobData so Task-82 consumers can inspect kind, fallback,
      // fallbackStage, fallbackReason, attemptsMade, cropTargets, etc. without
      // a second request. Individual unpacked fields are preserved below for
      // backward compatibility.
      jobData: job.jobData ?? null,
      ...(aligned ? { aligned } : {}),
      ...(cropTargets ? { cropTargets } : {}),
      ...(fallback !== undefined ? { fallback } : {}),
      ...(fallbackStage ? { fallbackStage } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(attemptsMade !== undefined ? { attemptsMade } : {}),
    });
  } catch (err) {
    console.error("Fetch Job Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
