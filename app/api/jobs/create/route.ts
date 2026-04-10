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
      videoUrl,
      duration,
      segments,
      zoomEffects,
      textOverlays,
      subtitles,
      selectedBackground,
      customBackgroundUrl,
      imageMap,
      demoId,
      settings,
      aspectRatio,
      browserFrame,
    } = data;

    if (!videoUrl) {
      return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = user.id;

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

      const fetchPromises = [];
      const chunkFilenames = [];

      for (let i = 0; i < chunksCount; i++) {
        const startTime = i * chunkDuration;
        const currentChunkDuration = Math.min(chunkDuration, duration - startTime);
        const chunkId = `${jobRecord.id}_chunk_${String(i).padStart(3, "0")}`;
        const outputObject = `${chunkId}.mp4`;

        chunkFilenames.push(outputObject);

        const chunkPromise = invokeGcpWorker(
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
        );

        fetchPromises.push(chunkPromise);
      }

      await Promise.all(fetchPromises);

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
