import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isAvsEnabled } from "@/app/lib/avs/flags";
import { invokeGcpDubSync } from "@/app/lib/gcpWorker";
import { dubbingQueue } from "@/app/lib/queue";
import { isSafeUrl } from "@/app/lib/safeUrl";
import type { Step, DubTiming } from "@/app/types/avs";

// Per-step encode + concat is comparable to /avs-sync; same generous budget.
export const maxDuration = 300;

/** Read + sanitize the `steps` body field into {id,startTime,endTime} entries. */
function parseSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const steps: Step[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const startTime = typeof rec.startTime === "number" ? rec.startTime : NaN;
    const endTime = typeof rec.endTime === "number" ? rec.endTime : NaN;
    const index = typeof rec.index === "number" ? rec.index : steps.length;

    if (id && Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime) {
      steps.push({ id, index, startTime, endTime });
    }
  }

  return steps;
}

/** Read + sanitize the `dubTimings` body field. */
function parseDubTimings(value: unknown): DubTiming[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const timings: DubTiming[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const rec = entry as Record<string, unknown>;
    const stepId = typeof rec.stepId === "string" ? rec.stepId : "";
    const start = typeof rec.start === "number" ? rec.start : NaN;
    const end = typeof rec.end === "number" ? rec.end : NaN;

    if (stepId && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      timings.push({ stepId, start, end });
    }
  }

  return timings;
}

/** Normalize a gs:// URL to a public HTTPS URL. */
function toHttpUrl(url: string): string {
  return url.startsWith("gs://") ? url.replace("gs://", "https://storage.googleapis.com/") : url;
}

/**
 * Run the dubbed-audio pacing alignment in the background and record the result
 * on the job for client polling via /api/jobs/[id].
 * Degrades gracefully (returns source unchanged) when dubUrl/dubTimings are absent
 * or when the worker execution/alignment fails (Task-00083).
 */
export async function runDubAlignment(
  jobId: string,
  input: {
    videoUrl: string;
    dubUrl: string;
    steps: Step[];
    dubTimings: DubTiming[];
    sourceDuration: number;
  }
): Promise<void> {
  const normalizedVideoUrl = toHttpUrl(input.videoUrl);

  try {
    const job = await prisma.videoJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (job?.status === "COMPLETED" || job?.status === "CANCELLED") {
      return;
    }

    await prisma.videoJob.updateMany({
      where: {
        id: jobId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: {
        status: "PROCESSING",
        progress: 20,
      },
    });

    let alignedVideoUrl = normalizedVideoUrl;
    let duration = input.sourceDuration;

    const canAlign = Boolean(input.dubUrl) && input.steps.length > 0 && input.dubTimings.length > 0;

    if (canAlign) {
      const result = await invokeGcpDubSync({
        videoUrl: normalizedVideoUrl,
        dubUrl: input.dubUrl,
        steps: input.steps,
        dubTimings: input.dubTimings,
      });

      alignedVideoUrl = toHttpUrl(result.alignedVideoUrl);
      duration = result.duration || input.sourceDuration;
    }

    await prisma.videoJob.updateMany({
      where: {
        id: jobId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: {
        status: "COMPLETED",
        progress: 100,
        exportedUrl: alignedVideoUrl,
        jobData: {
          kind: "AVS_DUB",
          alignedVideoUrl,
          duration,
          fallback: !canAlign,
          ...(!canAlign
            ? {
                fallbackStage: "DUBBING",
                fallbackReason: "MISSING_DUB_INPUT",
              }
            : {}),
        },
        error: null,
      },
    });
  } catch (err) {
    console.error("AVS dub-sync job failed, falling back to source video (Task-00083):", err);

    const reason = err instanceof Error ? err.message : "Dub-sync alignment failed";

    await prisma.videoJob
      .updateMany({
        where: {
          id: jobId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: normalizedVideoUrl,
          jobData: {
            kind: "AVS_DUB",
            alignedVideoUrl: normalizedVideoUrl,
            duration: input.sourceDuration,
            fallback: true,
            fallbackStage: "DUBBING",
            fallbackReason: reason,
          },
          error: null,
        },
      })
      .catch((updateErr) => {
        console.error("Failed to update degraded dubbing job:", updateErr);
      });
  }
}

export async function POST(req: NextRequest) {
  if (!isAvsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        session.user.id ? { id: session.user.id as string } : undefined,
        session.user.email ? { email: session.user.email } : undefined,
      ].filter(Boolean) as Array<{
        id?: string;
        email?: string;
      }>,
    },
    select: {
      id: true,
      plan: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;

  try {
    const parsedBody: unknown = await req.json();

    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    body = parsedBody as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawVideoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";

  if (!rawVideoUrl) {
    return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
  }

  const videoUrl = toHttpUrl(rawVideoUrl);

  if (!isSafeUrl(videoUrl)) {
    return NextResponse.json({ error: "Unsafe videoUrl" }, { status: 400 });
  }

  const rawDubUrl = typeof body.dubUrl === "string" ? body.dubUrl.trim() : "";

  const dubUrl = rawDubUrl ? toHttpUrl(rawDubUrl) : "";

  if (dubUrl && !isSafeUrl(dubUrl)) {
    return NextResponse.json({ error: "Unsafe dubUrl" }, { status: 400 });
  }

  const steps = parseSteps(body.steps);
  const dubTimings = parseDubTimings(body.dubTimings);

  const sourceDuration = typeof body.duration === "number" ? body.duration : 0;

  const demoId = typeof body.demoId === "string" ? body.demoId : null;

  if (demoId) {
    const demo = await prisma.demo.findUnique({
      where: { id: demoId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!demo || demo.userId !== user.id) {
      return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    }
  }

  const jobRecord = await prisma.videoJob.create({
    data: {
      userId: user.id,
      demoId,
      videoUrl,
      status: "PENDING",
      jobData: {
        kind: "AVS_DUB",
      },
    },
  });

  await dubbingQueue.add(
    "avs-dub",
    {
      jobId: jobRecord.id,
      videoUrl,
      dubUrl,
      steps,
      dubTimings,
      sourceDuration,
      userId: user.id,
      demoId,
    },
    {
      jobId: jobRecord.id,
    }
  );

  return NextResponse.json({
    success: true,
    jobId: jobRecord.id,
  });
}
