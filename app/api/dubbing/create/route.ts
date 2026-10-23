import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { isAvsAllowed } from "@/app/lib/avs/access";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { dubbingQueue } from "@/app/lib/queue";
import { isSafeUrl } from "@/app/lib/safeUrl";

export const maxDuration = 300;

// Frontend always sends an explicit targetLanguage — no guessing here,
// so a dropped field fails loudly instead of dubbing into the wrong language.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          session.user.id ? { id: session.user.id as string } : undefined,
          session.user.email ? { email: session.user.email } : undefined,
        ].filter(Boolean) as Array<{
          id?: string;
          email?: string;
        }>,
      },
      select: {
        id: true,
        plan: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Paid feature — FREE users cannot trigger paid dubbing.
    // Matches /api/avs/dub so all dubbing routes gate uniformly on PRO/ENTERPRISE.
    if (!isAvsAllowed(user.plan)) {
      return NextResponse.json(
        { error: "Dubbing is available on PRO and ENTERPRISE plans" },
        { status: 403 }
      );
    }

    // ElevenLabs charges per dubbed minute. Cap per authenticated user before
    // reading the body or creating a job.
    if (await isRateLimited(`dubbing-create:${user.id}`, 5, 60 * 60, true)) {
      return NextResponse.json(
        { error: "Too many dubbing requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      // Truncated / hand-edited JSON shouldn't surface as a 500 alarm.
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

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
        userId: user.id,
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
