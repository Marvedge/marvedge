import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  ApiError,
  clipJobQueue,
  resolveTranscriptCues,
  validateClipScoringInput,
} from "@/app/lib/clips/service";
import { isSafeUrl } from "@/app/lib/safeUrl";
import { isRateLimited } from "@/app/lib/audio/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          session.user.id ? { id: session.user.id } : null,
          session.user.email ? { email: session.user.email } : null,
        ].filter(Boolean) as Array<{ id?: string; email?: string }>,
      },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = user.id;

    // OpenAI scoring is billed per request. Cap per authenticated user before
    // validating/queueing the job.
    if (await isRateLimited(`clips-create:${userId}`, 10, 10 * 60, true)) {
      return NextResponse.json(
        { error: "Too many clip requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { demoId, videoUrl, cues, duration, options } = validateClipScoringInput(body);

    if (demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true },
      });
      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }

    // Resolve existing transcript without re-transcribing
    const { cues: resolvedCues, duration: resolvedDuration, resolvedVideoUrl } =
      await resolveTranscriptCues(prisma, {
        demoId,
        videoUrl,
        suppliedCues: cues,
        suppliedDuration: duration,
      });

    // The worker fetches this URL. The supplied videoUrl is gated in
    // validateClipScoringInput; recheck here because the resolved URL can come
    // from a stored row — poisoned rows fail closed before any DB write.
    const effectiveVideoUrl = resolvedVideoUrl || videoUrl;
    if (
      typeof effectiveVideoUrl === "string" &&
      effectiveVideoUrl &&
      !isSafeUrl(effectiveVideoUrl)
    ) {
      return NextResponse.json({ error: "Video URL is not allowed" }, { status: 400 });
    }

    // 1. Create a tracking VideoJob record in PostgreSQL
    const jobRecord = await prisma.videoJob.create({
      data: {
        userId,
        demoId: demoId || null,
        videoUrl: resolvedVideoUrl || videoUrl || "",
        status: "PENDING",
        progress: 0,
        jobData: {
          kind: "CLIP_SCORING",
          cuesCount: resolvedCues.length,
          ...(options ? { options } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // 2. Enqueue the clip-scoring job to BullMQ ("video-processing" queue)
    await clipJobQueue.add(
      "clip-scoring",
      {
        jobId: jobRecord.id,
        userId,
        demoId: demoId || null,
        videoUrl: resolvedVideoUrl || videoUrl || undefined,
        cues: resolvedCues,
        duration: resolvedDuration,
        options,
      },
      { jobId: jobRecord.id }
    );

    // 3. Return the jobId immediately so the client can poll GET /api/jobs/[id]
    return NextResponse.json({
      success: true,
      jobId: jobRecord.id,
      status: "pending",
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Clip Scoring Job Creation Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
