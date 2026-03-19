import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { videoQueue } from "@/app/lib/queue";
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

    // 2. Add job to the Redis queue
    await videoQueue.add(
      "process-video",
      {
        jobId: jobRecord.id, // the database ID
        userId,
        demoId,
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
      },
      {
        jobId: jobRecord.id, // BullMQ job ID matches DB Job ID
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

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
