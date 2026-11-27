import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { isAvsEnabled } from "@/app/lib/avs/flags";
import { isAvsAllowed } from "@/app/lib/avs/access";
import { invokeGcpSync } from "@/app/lib/gcpWorker";
import { isSafeUrl } from "@/app/lib/safeUrl";
import { mayResolveObject } from "@/app/lib/storage/access";
import { parseStorageUri } from "@/app/lib/storage/index";
import type { Step, StepTiming } from "@/app/types/avs";

// The worker downloads, re-encodes per step, concats and muxes with ffmpeg, so
// the alignment can run for a while. It runs in `after()` (the client polls
// /api/jobs/[id]), but keep the function budget generous.
export const maxDuration = 300;

// The worker re-encodes every entry, so an unbounded array is an unbounded
// ffmpeg job. Truncate rather than reject: a genuinely long video still works.
const MAX_STEPS = 500;
const MAX_STEP_TIMINGS = 2000;

/** Read + sanitize the `steps` body field into {id,startTime,endTime} entries. */
function parseSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > MAX_STEPS) {
    console.warn(`[avs/sync] steps truncated from ${value.length} to ${MAX_STEPS}`);
  }
  const steps: Step[] = [];
  for (const entry of value.slice(0, MAX_STEPS)) {
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

/** Read + sanitize the voiceover `stepTimings` body field. */
function parseStepTimings(value: unknown): StepTiming[] {
  if (!Array.isArray(value)) {
    return [];
  }
  if (value.length > MAX_STEP_TIMINGS) {
    console.warn(`[avs/sync] stepTimings truncated from ${value.length} to ${MAX_STEP_TIMINGS}`);
  }
  const timings: StepTiming[] = [];
  for (const entry of value.slice(0, MAX_STEP_TIMINGS)) {
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

/** Normalize a gs:// URL to a public https URL, mirroring the export path. */
function toHttpUrl(url: string): string {
  return url.startsWith("gs://") ? url.replace("gs://", "https://storage.googleapis.com/") : url;
}

/**
 * A native storage URI is a capability: only sign it into a public URL when the
 * caller owns it. Plain HTTPS URLs are passed through untouched.
 */
async function resolveInputUrl(raw: string, userId: string): Promise<string | null> {
  const parsed = parseStorageUri(raw);

  if (parsed && !(await mayResolveObject(raw, parsed.bucket, parsed.key, userId))) {
    return null;
  }

  return toHttpUrl(raw);
}

/**
 * Run the time-alignment in the background and record the result on the job so
 * the client can read it back via /api/jobs/[id]. When there is no voiceover or
 * no steps, degrade gracefully by handing the original source back unchanged.
 */
async function runAlignment(
  jobId: string,
  input: {
    videoUrl: string;
    audioUrl: string;
    steps: Step[];
    stepTimings: StepTiming[];
    sourceDuration: number;
  }
): Promise<void> {
  try {
    await prisma.videoJob.update({
      where: { id: jobId },
      data: { status: "PROCESSING", progress: 20 },
    });

    let alignedVideoUrl = input.videoUrl;
    let duration = input.sourceDuration;

    const canAlign =
      Boolean(input.audioUrl) && input.steps.length > 0 && input.stepTimings.length > 0;

    if (canAlign) {
      const result = await invokeGcpSync({
        videoUrl: input.videoUrl,
        audioUrl: input.audioUrl,
        steps: input.steps,
        stepTimings: input.stepTimings,
      });
      alignedVideoUrl = result.alignedVideoUrl;
      duration = result.duration || input.sourceDuration;
    }

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        jobData: {
          kind: "AVS_SYNC",
          alignedVideoUrl,
          duration,
          fallback: !canAlign,
        },
      },
    });
  } catch (err) {
    console.error("AVS sync job failed:", err);
    await prisma.videoJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Time-alignment failed",
        },
      })
      .catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  // Flag off → the feature is invisible; behave as if the route doesn't exist.
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
      ].filter(Boolean) as Array<{ id?: string; email?: string }>,
    },
    select: { id: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // PRO/ENTERPRISE only — mirrors the export path's plan gate.
  if (!isAvsAllowed(user.plan)) {
    return NextResponse.json(
      { error: "AVS is available on PRO and ENTERPRISE plans." },
      { status: 403 }
    );
  }

  // Each alignment dispatches a Cloud Run worker, so cap dispatches per user
  // before reading the body or creating a job. Closed mode: fail blocked.
  if (await isRateLimited(`avs-sync:${user.id}`, 10, 60 * 60, true)) {
    return NextResponse.json(
      { error: "Too many alignment requests. Please try again shortly." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawVideoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  if (!rawVideoUrl) {
    return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
  }
  const videoUrl = await resolveInputUrl(rawVideoUrl, user.id);

  if (videoUrl === null) {
    return NextResponse.json({ error: "Video URL is not allowed" }, { status: 400 });
  }

  if (!isSafeUrl(videoUrl)) {
    return NextResponse.json({ error: "Unsafe videoUrl" }, { status: 400 });
  }

  const rawAudioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const audioUrl = rawAudioUrl ? await resolveInputUrl(rawAudioUrl, user.id) : "";
  if (audioUrl === null) {
    return NextResponse.json({ error: "Audio URL is not allowed" }, { status: 400 });
  }
  if (audioUrl && !isSafeUrl(audioUrl)) {
    return NextResponse.json({ error: "Unsafe audioUrl" }, { status: 400 });
  }
  const steps = parseSteps(body.steps);
  const stepTimings = parseStepTimings(body.stepTimings);
  const sourceDuration = typeof body.duration === "number" ? body.duration : 0;
  const demoId = typeof body.demoId === "string" ? body.demoId : null;

  if (demoId) {
    const demo = await prisma.demo.findUnique({
      where: { id: demoId },
      select: { id: true, userId: true },
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
      jobData: { kind: "AVS_SYNC" },
    },
  });

  after(() =>
    runAlignment(jobRecord.id, {
      videoUrl,
      audioUrl,
      steps,
      stepTimings,
      sourceDuration,
    })
  );

  return NextResponse.json({ success: true, jobId: jobRecord.id });
}
