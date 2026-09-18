import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpWorker } from "@/app/lib/gcpWorker";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { normalizeLanguage, sanitizeSubtitleStyle } from "@/app/lib/subtitles";
import { isSafeUrl } from "@/app/lib/safeUrl";
import { isWtmEnabled } from "@/app/lib/wtm/flags";
import { isWtmAllowed } from "@/app/lib/wtm/access";
import { resolveWatermarkForPlan as resolveWatermarkForIsPro } from "@/app/lib/wtm/watermark";
import type { WatermarkConfig } from "@/app/types/wtm";
export const maxDuration = 300;

const EXEMPT_EMAILS = [
  "aryaanandpathak30@gmail.com",
  "sarthakbehera10@gmail.com",
  "ashishmishra19122000@gmail.com",
  "sandipsubham.32@gmail.com",
  "kanupriya2052017@gmail.com",
  "rathourrahul21@gmail.com",
  "ajitkumarshankhwar25@gmail.com",
  "somyanayak281@gmail.com",
  "manushichillar412@gmail.com",
];

// Returns true when the user is allowed to start another export.
async function isExportAllowed(
  userId: string,
  email: string | null | undefined,
  plan: string | null
): Promise<boolean> {
  const isExempt =
    (email && EXEMPT_EMAILS.includes(email)) || plan === "PRO" || plan === "ENTERPRISE";
  if (isExempt) {
    return true;
  }

  const jobCount = await prisma.videoJob.count({
    where: { userId, status: "COMPLETED" },
  });
  const savedCount = await prisma.exportedVideo.count({
    where: { userId },
  });
  const exportCount = Math.max(jobCount, savedCount);

  return exportCount < 3;
}

// --- WTM (watermark) -------------------------------------------------------
// The watermark baked into an export is decided here by plan — never by the
// worker, which only renders whatever `recipe.watermark` it is handed, and never
// by the client, whose config is only ever a request. The whole path is a no-op
// unless WTM_ENABLED is set, so prod behavior (and existing recipes) are
// unchanged until enablement.

// Resolve the effective watermark for an export:
//   flag off         → undefined (no watermark; existing behavior preserved)
//   FREE / anonymous → forced Marvedge badge, client input ignored entirely
//                      (they cannot upload a logo, change opacity, or remove it)
//   PRO / ENTERPRISE → the client's editing.wtm.watermark, validated and clamped
//                      (incl. enabled:false — removing the watermark), else none
//
// Only the flag check is local: the plan branch lives in app/lib/wtm/watermark.ts
// so the editor's WYSIWYG preview resolves the watermark exactly the way this
// route does, rather than reimplementing the rule and drifting from it.
function resolveWatermarkForPlan(
  plan: string | null,
  clientWatermark: unknown
): WatermarkConfig | undefined {
  if (!isWtmEnabled()) {
    return undefined;
  }
  return resolveWatermarkForIsPro(isWtmAllowed(plan), clientWatermark);
}

// Dispatches chunked processing to GCP Cloud Run workers and merges the result.
async function dispatchVideoJob(
  jobId: string,
  videoUrl: string,
  duration: number,
  normalizedPayload: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        progress: 25,
      },
    });

    const chunkDuration = 10;
    const chunksCount = Math.ceil(duration / chunkDuration);
    const chunkFilenames: string[] = [];
    const fetchTasks = [];

    for (let i = 0; i < chunksCount; i++) {
      const startTime = i * chunkDuration;
      const currentChunkDuration = Math.min(chunkDuration, duration - startTime);
      const chunkId = `${jobId}_chunk_${String(i).padStart(3, "0")}`;
      const outputObject = `${chunkId}.mp4`;

      chunkFilenames.push(outputObject);

      // Store a function that RETURNS the promise, but don't call it yet!
      fetchTasks.push(() =>
        invokeGcpWorker(
          {
            chunkId,
            recipeId: jobId,
            outputObject,
            videoUrl,
            recipe: normalizedPayload,
            startTime,
            duration: currentChunkDuration,
          },
          "/process"
        )
      );
    }

    // True Concurrency Queue Logic (Actual Deferred Execution)
    const MAX_CONCURRENT_CHUNKS = 5;
    const executing = new Set<Promise<unknown>>();
    const results = [];

    for (const task of fetchTasks) {
      const promise = task().finally(() => executing.delete(promise));
      executing.add(promise);
      results.push(promise);
      if (executing.size >= MAX_CONCURRENT_CHUNKS) {
        await Promise.race(executing);
      }
    }

    const completedTasks = await Promise.all(results);

    const validChunkFilenames = (
      completedTasks as { result?: { skipped?: boolean; processedObject?: string } }[]
    )
      .filter((res) => res && res.result && !res.result.skipped)
      .map((res) => res.result!.processedObject!);

    await prisma.videoJob.update({
      where: { id: jobId },
      data: { progress: 80 },
    });

    const mergeResp = await invokeGcpWorker(
      {
        recipeId: jobId,
        chunkFilenames: validChunkFilenames,
      },
      "/merge"
    );

    const exportedUrl = mergeResp.result?.exportedUrl || null;

    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        exportedUrl,
      },
    });
  } catch (dispatchError) {
    console.error("Job dispatch failed:", dispatchError);
    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: dispatchError instanceof Error ? dispatchError.message : "Dispatch failed",
      },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const {
      videoUrl: rawVideoUrl,
      duration,
      segments,
      zoomEffects,
      textOverlays,
      subtitles,
      selectedBackground,
      customBackgroundUrl: rawCustomBackgroundUrl,
      imageMap,
      demoId,
      settings,
      aspectRatio,
      browserFrame,
    } = data;

    let videoUrl = rawVideoUrl;
    let customBackgroundUrl = rawCustomBackgroundUrl;

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
    }

    if (typeof videoUrl === "string" && videoUrl.startsWith("gs://")) {
      videoUrl = videoUrl.replace("gs://", "https://storage.googleapis.com/");
    }

    if (typeof customBackgroundUrl === "string" && customBackgroundUrl.startsWith("gs://")) {
      customBackgroundUrl = customBackgroundUrl.replace("gs://", "https://storage.googleapis.com/");
    }

    if (!duration || typeof duration !== "number") {
      return NextResponse.json({ error: "Missing or invalid duration" }, { status: 400 });
    }

    // the job may float free, but a demoId must be the caller's own demo
    if (typeof demoId === "string" && demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true },
      });
      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }

    // the worker fetches this url, so internal addresses stop here
    if (!isSafeUrl(videoUrl)) {
      return NextResponse.json({ error: "Video URL is not allowed" }, { status: 400 });
    }
    if (typeof customBackgroundUrl === "string" && customBackgroundUrl.trim().length > 0) {
      if (!isSafeUrl(customBackgroundUrl)) {
        return NextResponse.json({ error: "Background URL is not allowed" }, { status: 400 });
      }
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

    const userId = user.id;

    const exportAllowed = await isExportAllowed(userId, session.user.email, user.plan);
    if (!exportAllowed) {
      return NextResponse.json(
        {
          error: "Free trial limit of 3 exports reached. Please upgrade your plan.",
        },
        { status: 403 }
      );
    }

    // Decide the watermark from the user's plan (free → forced badge, PRO →
    // their config or none). undefined when the flag is off, so the recipe is
    // identical to today and non-WTM exports are unchanged.
    const watermark = resolveWatermarkForPlan(user.plan, data.watermark);

    // SUB PR 6: burn-in is now an explicit choice (PRD §6.8). Absent or true →
    // burn them in, which is what every export did before the switch existed;
    // only an explicit `false` turns it off, and it does so by handing the
    // worker no cues at all rather than by adding a branch over there. Style and
    // language go with them — they describe subtitles that will not be drawn.
    const burnSubtitles = data.burnSubtitles !== false;
    const recipeSubtitles = burnSubtitles && Array.isArray(subtitles) ? subtitles : [];

    // SUB: the subtitle style is re-sanitized here, never trusted as sent — the
    // client's object reaches ffmpeg as an ASS style line, so an unvalidated
    // colour or font would be injected into the render. undefined when the demo
    // was never styled, which leaves the recipe (and therefore the burn-in)
    // exactly as it is today. Unlike the watermark this is NOT plan-gated:
    // subtitle styling is free for every plan, including anonymous.
    const subtitleStyle = burnSubtitles ? sanitizeSubtitleStyle(data.subtitleStyle) : undefined;

    // SUB: the active track's language, re-normalized here rather than trusted.
    // Only carried into the recipe when it is a real language — auto-detect is
    // the existing behaviour and leaves the recipe byte-identical to today's.
    const rawSubtitleLanguage = normalizeLanguage(data.subtitleLanguage);
    const subtitleLanguage =
      !burnSubtitles || rawSubtitleLanguage === "multi" ? null : rawSubtitleLanguage;

    // 1. Create a job record in the database
    const jobRecord = await prisma.videoJob.create({
      data: {
        userId,
        demoId: demoId || null,
        videoUrl,
        status: "PENDING",
        jobData: {
          segments: segments || [],
          zoomEffects: zoomEffects || [],
          textOverlays: textOverlays || [],
          subtitles: recipeSubtitles,
          selectedBackground: selectedBackground || null,
          customBackgroundUrl: customBackgroundUrl || null,
          imageMap: imageMap || {},
          settings: settings || null,
          aspectRatio: aspectRatio || "native",
          browserFrame: browserFrame || {
            mode: "default",
            drawShadow: true,
            drawBorder: false,
          },
          // Spread into a fresh object literal so the Prisma Json field accepts
          // it (a named interface lacks the implicit index signature Prisma wants).
          ...(subtitleStyle ? { subtitleStyle: { ...subtitleStyle } } : {}),
          ...(subtitleLanguage ? { subtitleLanguage } : {}),
          ...(watermark ? { watermark: { ...watermark } } : {}),
        },
      },
    });

    const normalizedPayload = {
      jobId: jobRecord.id,
      userId,
      demoId: demoId || null,
      videoUrl,
      segments: segments || [],
      zoomEffects: zoomEffects || [],
      textOverlays: textOverlays || [],
      subtitles: recipeSubtitles,
      selectedBackground: selectedBackground || null,
      customBackgroundUrl: customBackgroundUrl || null,
      imageMap: imageMap || {},
      settings: settings || null,
      aspectRatio: aspectRatio || "native",
      browserFrame: browserFrame || {
        mode: "default",
        drawShadow: true,
        drawBorder: false,
      },
      ...(subtitleStyle ? { subtitleStyle } : {}),
      ...(subtitleLanguage ? { subtitleLanguage } : {}),
      ...(watermark ? { watermark } : {}),
    };

    // 2. Dispatch to GCP Cloud Run workers (Scatter-Gather)
    after(() => dispatchVideoJob(jobRecord.id, videoUrl, duration, normalizedPayload));

    // 3. Return the job ID to the client instantly
    return NextResponse.json({
      success: true,
      jobId: jobRecord.id,
    });
  } catch (err) {
    console.error("Job Creation Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
