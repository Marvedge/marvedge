import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { subtitleQueue } from "@/app/lib/queue";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";

export async function POST(req: NextRequest) {
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

    await subtitleQueue.add(
      "transcribe-subtitles",
      {
        jobId: jobRecord.id,
        userId,
        demoId: demoId || null,
        videoUrl,
        language: typeof language === "string" && language.trim() ? language.trim() : "multi",
      },
      {
        jobId: jobRecord.id,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    return NextResponse.json({ success: true, jobId: jobRecord.id });
  } catch (err) {
    console.error("Subtitle Job Creation Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
