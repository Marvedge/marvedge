import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpSubtitles } from "@/app/lib/gcpWorker";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { isSafeUrl } from "@/app/lib/safeUrl";
import {
  isSttOffered,
  normalizeCues,
  normalizeLanguage,
  subtitleWorkerTimeoutMs,
  validateSubtitleDuration,
} from "@/app/lib/subtitles";

// Transcribing a 10-minute video (download + ffmpeg audio extract + Deepgram)
// runs well past the default serverless limit. The request itself returns in one
// tick now, but `after()` work is still billed against this route's budget — the
// same 300s ceiling app/api/jobs/create/route.ts uses for its export dispatch.
export const maxDuration = 300;

// Progress checkpoints written as the job advances, so the client's poll loop has
// something to draw. The worker call is one long opaque await, so 40 -> 80 is the
// only stretch we cannot subdivide from here.
const PROGRESS_QUEUED = 10;
const PROGRESS_TRANSCRIBING = 40;
const PROGRESS_DONE = 100;

/**
 * Persist completion and demo cues together. The conditional job write
 * serializes with cancellation: whichever writes first decides the outcome.
 */
async function dispatchSubtitleJob(
  jobId: string,
  videoUrl: string,
  language: string,
  durationSeconds: number | null
) {
  try {
    const started = await prisma.videoJob.updateMany({
      where: {
        id: jobId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: { status: "PROCESSING", progress: PROGRESS_TRANSCRIBING },
    });

    if (started.count === 0) {
      return;
    }

    // The worker cannot be stopped once dispatched. Cancellation discards
    // its result rather than stopping the transcription or its billing.
    const rawCues = await invokeGcpSubtitles({
      videoUrl,
      language,
      timeoutMs: subtitleWorkerTimeoutMs(durationSeconds),
    });
    const cues = normalizeCues(rawCues);

    const completed = await prisma.$transaction(async (tx) => {
      const job = await tx.videoJob.findUnique({
        where: { id: jobId },
        select: { demoId: true },
      });

      if (!job) {
        return null;
      }

      const result = await tx.videoJob.updateMany({
        where: {
          id: jobId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        data: {
          status: "COMPLETED",
          progress: PROGRESS_DONE,
          jobData: {
            kind: "SUBTITLES",
            provider: "deepgram",
            language,
            subtitles: cues,
          },
        },
      });

      if (result.count === 0) {
        return null;
      }

      if (job.demoId) {
        // Keep the bare-array shape expected by existing subtitle readers.
        await tx.demo.update({
          where: { id: job.demoId },
          data: { subtitles: cues },
        });
      }

      return { demoId: job.demoId };
    });

    if (!completed?.demoId) {
      return;
    }

    // Keep this optional write outside the transaction: an unmigrated
    // track table must not roll back otherwise successful subtitle storage.
    await prisma.subtitleTrack
      .upsert({
        where: {
          demoId_language: { demoId: completed.demoId, language },
        },
        create: {
          demoId: completed.demoId,
          language,
          status: "READY",
          source: "stt",
          cues,
        },
        update: { status: "READY", source: "stt", cues },
      })
      .catch((e: unknown) => {
        console.warn("SubtitleTrack upsert skipped:", e instanceof Error ? e.message : e);
      });
  } catch (err) {
    console.error("Subtitle Job Dispatch Error:", err);

    // Cancellation or another terminal result may have won while work failed.
    await prisma.videoJob
      .updateMany({
        where: {
          id: jobId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Subtitle generation failed",
        },
      })
      .catch((persistError: unknown) => {
        console.error(
          `[subtitles] Failed to persist FAILED status for job ${jobId}:`,
          persistError
        );
      });
  }
}

export async function POST(req: NextRequest) {
  let createdJobId: string | null = null;
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const { videoUrl, demoId, language } = data;

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
    }

    // The worker fetches this URL, so internal addresses stop here.
    if (!isSafeUrl(videoUrl)) {
      return NextResponse.json({ error: "Unsafe videoUrl" }, { status: 400 });
    }

    // PRD §13 — an explicit ceiling with a message that names the actual length,
    // rather than a job that dies on a timeout the user cannot interpret. The
    // client sends what the player measured; an absent duration passes, because
    // "not measured yet" must not mean "refuse to caption".
    const durationSeconds =
      typeof data.durationSeconds === "number" && Number.isFinite(data.durationSeconds)
        ? data.durationSeconds
        : null;
    const durationCheck = validateSubtitleDuration(durationSeconds);
    if (!durationCheck.ok) {
      return NextResponse.json({ error: durationCheck.error }, { status: 400 });
    }

    // PRD §13 — an unsupported language is refused rather than silently
    // transcribed in whatever the detector guesses, which is what a fall back to
    // auto-detect would do. An ABSENT code still means auto-detect: that is what
    // every client sent before the picker existed.
    const requestedLanguage = typeof language === "string" ? language.trim() : "";
    if (requestedLanguage && !isSttOffered(requestedLanguage)) {
      return NextResponse.json(
        {
          error: `Subtitles are not available in "${requestedLanguage}". Pick a language from the list, or leave it on auto-detect.`,
        },
        { status: 400 }
      );
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

    const userId = user.id;

    // Deepgram is billed per minute of audio. Cap per authenticated user before
    // creating a job or calling the worker.
    if (await isRateLimited(`subtitles-create:${userId}`, 10, 10 * 60, true)) {
      return NextResponse.json(
        { error: "Too many subtitle requests. Please try again shortly." },
        { status: 429 }
      );
    }

    if (demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true },
      });
      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }

    // Missing codes fall back to auto-detect ("multi"), which is what the editor
    // has always sent. Unknown ones were rejected above.
    const normalizedLanguage = normalizeLanguage(requestedLanguage);

    const jobRecord = await prisma.videoJob.create({
      data: {
        userId,
        demoId: demoId || null,
        videoUrl,
        status: "PROCESSING",
        progress: PROGRESS_QUEUED,
        jobData: {
          kind: "SUBTITLES",
          language: normalizedLanguage,
        },
      },
    });
    createdJobId = jobRecord.id;

    // Transcription runs after the response is flushed. The client gets its
    // jobId in the same tick and polls /api/jobs/{id} for progress — before this,
    // the POST awaited the entire transcription, so a long video blew the
    // serverless limit and stranded the job at PROCESSING with cues that had
    // been computed but never written.
    after(() => dispatchSubtitleJob(jobRecord.id, videoUrl, normalizedLanguage, durationSeconds));

    return NextResponse.json({
      success: true,
      status: "processing",
      jobId: jobRecord.id,
      language: normalizedLanguage,
    });
  } catch (err) {
    console.error("Subtitle Job Creation Error:", err);
    if (createdJobId) {
      await prisma.videoJob
        .update({
          where: { id: createdJobId },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : "Subtitle generation failed",
          },
        })
        .catch(() => {});
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
