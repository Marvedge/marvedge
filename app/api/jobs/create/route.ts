import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpWorker } from "@/app/lib/gcpWorker";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

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

    const isExempt =
      (session.user.email && EXEMPT_EMAILS.includes(session.user.email)) ||
      user.plan === "PRO" ||
      user.plan === "ENTERPRISE";
    if (!isExempt) {
      const jobCount = await prisma.videoJob.count({
        where: { userId, status: "COMPLETED" },
      });
      const savedCount = await prisma.exportedVideo.count({
        where: { userId },
      });
      const exportCount = Math.max(jobCount, savedCount);

      if (exportCount >= 3) {
        return NextResponse.json(
          {
            error: "Free trial limit of 3 exports reached. Please upgrade your plan.",
          },
          { status: 403 }
        );
      }
    }

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
          subtitles: Array.isArray(subtitles) ? subtitles : [],
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
      subtitles: Array.isArray(subtitles) ? subtitles : [],
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
    };

    // 2. Dispatch to GCP Cloud Run workers (Scatter-Gather)
    try {
      await prisma.videoJob.update({
        where: { id: jobRecord.id },
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
        const chunkId = `${jobRecord.id}_chunk_${String(i).padStart(3, "0")}`;
        const outputObject = `${chunkId}.mp4`;

        chunkFilenames.push(outputObject);

        // Store a function that RETURNS the promise, but don't call it yet!
        fetchTasks.push(() =>
          invokeGcpWorker(
            {
              chunkId,
              recipeId: jobRecord.id,
              outputObject,
              videoUrl,
              recipe: normalizedPayload as unknown as Record<string, unknown>,
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

      await Promise.all(results);

      await prisma.videoJob.update({
        where: { id: jobRecord.id },
        data: { progress: 80 },
      });

      const mergeResp = await invokeGcpWorker(
        {
          recipeId: jobRecord.id,
          chunkFilenames,
        },
        "/merge"
      );

      const exportedUrl = mergeResp.result?.exportedUrl || null;

      await prisma.videoJob.update({
        where: { id: jobRecord.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl,
        },
      });
    } catch (dispatchError) {
      console.error("Job dispatch failed:", dispatchError);
      await prisma.videoJob.update({
        where: { id: jobRecord.id },
        data: {
          status: "FAILED",
          error: dispatchError instanceof Error ? dispatchError.message : "Dispatch failed",
        },
      });
      return NextResponse.json({ error: "Failed to dispatch job" }, { status: 500 });
    }

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
