import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { dubbingQueue } from "@/app/lib/queue";

export const maxDuration = 300;

const DEFAULT_TARGET_LANGUAGE = "ta";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    const sourceUrl =
      typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";

    const targetLanguage =
      typeof body.targetLanguage === "string"
        ? body.targetLanguage.trim()
        : DEFAULT_TARGET_LANGUAGE;

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Missing sourceUrl" },
        { status: 400 }
      );
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { error: "sourceUrl must be an HTTP or HTTPS URL" },
        { status: 400 }
      );
    }

    if (!/^[a-z]{2,5}$/i.test(targetLanguage)) {
      return NextResponse.json(
        { error: "Invalid targetLanguage" },
        { status: 400 }
      );
    }

    const jobRecord = await prisma.videoJob.create({
      data: {
        userId: session.user.id,
        videoUrl: sourceUrl,
        status: "PENDING",
        progress: 0,
        jobData: {
          kind: "DUBBING",
          targetLanguage,
        },
      },
    });

    await dubbingQueue.add(
      "dubbing",
      {
        jobId: jobRecord.id,
        sourceUrl,
        targetLanguage,
      },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );

    return NextResponse.json({
      success: true,
      jobId: jobRecord.id,
      targetLanguage,
    });
  } catch (error) {
    console.error("Create dubbing job error:", error);

    return NextResponse.json(
      { error: "Failed to create dubbing job" },
      { status: 500 }
    );
  }
}