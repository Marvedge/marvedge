import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpSubtitles } from "@/app/lib/gcpWorker";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

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

    if (demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true },
      });
      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }

    const jobRecord = await prisma.videoJob.create({
      data: {
        userId,
        demoId: demoId || null,
        videoUrl,
        status: "PENDING",
        jobData: {
          kind: "SUBTITLES",
          language: typeof language === "string" && language.trim() ? language.trim() : "multi",
        },
      },
    });
    createdJobId = jobRecord.id;

    const normalizedLanguage =
      typeof language === "string" && language.trim() ? language.trim() : "multi";

    await prisma.videoJob.update({
      where: { id: jobRecord.id },
      data: { status: "PROCESSING", progress: 10 },
    });

    const cues = await invokeGcpSubtitles({
      videoUrl,
      language: normalizedLanguage,
    });

    if (demoId) {
      await prisma.demo.update({
        where: { id: demoId },
        data: {
          subtitles: {
            provider: "deepgram",
            language: normalizedLanguage,
            cues,
          },
        },
      });
    }

    await prisma.videoJob.update({
      where: { id: jobRecord.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        jobData: {
          kind: "SUBTITLES",
          provider: "deepgram",
          language: normalizedLanguage,
          subtitles: cues,
        },
      },
    });

    return NextResponse.json({ success: true, jobId: jobRecord.id });
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
