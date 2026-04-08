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

    // 2. Dispatch to GCP Cloud Run worker using live payload
    try {
      const chunkId = `${jobRecord.id}_chunk_000`;
      const recipeId = jobRecord.id;
      const outputObject = `${jobRecord.id}.mp4`;

      await prisma.videoJob.update({
        where: { id: jobRecord.id },
        data: {
          status: "PROCESSING",
          progress: 25,
        },
      });

      const workerResp = await invokeGcpWorker({
        chunkId,
        recipeId,
        outputObject,
        videoUrl,
        recipe: normalizedPayload as unknown as Record<string, unknown>,
      });

      const processedBucket =
        workerResp.result?.processedBucket || process.env.GCP_PROCESSED_BUCKET || "";
      const processedObject = workerResp.result?.processedObject || "";
      const baseUrl =
        process.env.GCP_PROCESSED_BASE_URL ||
        (processedBucket ? `https://storage.googleapis.com/${processedBucket}` : "");
      const exportedUrl =
        baseUrl && processedObject ? `${baseUrl}/${processedObject}` : null;

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
