import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { readBoundedRequestJson } from "@/app/lib/http/boundedBody";
import { prisma } from "@/app/lib/prisma";
import { dubbingQueue } from "@/app/lib/queue";
import { isSafeUrl } from "@/app/lib/safeUrl";

export const maxDuration = 300;

const MAX_BODY_BYTES = 8 * 1024;

// Frontend always sends an explicit targetLanguage — no guessing here,
// so a dropped field fails loudly instead of dubbing into the wrong language.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ElevenLabs charges per dubbed minute. Cap per authenticated user before
    // reading the body or creating a job.
    if (await isRateLimited(`dubbing-create:${session.user.id}`, 5, 60 * 60, true)) {
      return NextResponse.json(
        { error: "Too many dubbing requests. Please try again shortly." },
        { status: 429 }
      );
    }

    // This endpoint accepts JSON metadata, not the source media itself.
    // Count actual streamed bytes even when Content-Length is absent or false.
    const bodyResult = await readBoundedRequestJson(req, MAX_BODY_BYTES);

    if (!bodyResult.ok) {
      if (bodyResult.reason === "too_large") {
        return NextResponse.json({ error: "Request body too large" }, { status: 413 });
      }

      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodyResult.value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const body = parsed as Record<string, unknown>;
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";

    const rawTargetLanguage =
      typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";

    if (!rawTargetLanguage) {
      return NextResponse.json({ error: "Missing targetLanguage" }, { status: 400 });
    }

    const targetLanguage = rawTargetLanguage.toLowerCase();

    if (!sourceUrl) {
      return NextResponse.json({ error: "Missing sourceUrl" }, { status: 400 });
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json(
        { error: "sourceUrl must be an HTTP or HTTPS URL" },
        { status: 400 }
      );
    }

    if (!isSafeUrl(sourceUrl)) {
      return NextResponse.json({ error: "Unsafe sourceUrl" }, { status: 400 });
    }

    if (!/^[a-z]{2,5}$/.test(targetLanguage)) {
      return NextResponse.json({ error: "Invalid targetLanguage" }, { status: 400 });
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

    return NextResponse.json({ error: "Failed to create dubbing job" }, { status: 500 });
  }
}
