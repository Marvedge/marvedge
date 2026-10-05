import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { deleteCloudinaryVideoByUrl } from "@/app/lib/cloudinary-utils";
import { packageDemoHls } from "@/app/lib/hls/package";
import { isSafeUrl } from "@/app/lib/safeUrl";

// HLS packaging runs in after(), so the invocation stays alive after the
// response is sent and needs a ceiling above the default. 300s is the platform
// maximum, and it is honestly not always enough: a long demo's three-rung ladder
// can outlast it, in which case the after() is cut off, no playlist URI is
// recorded, and the demo keeps playing its MP4. The manual "Generate HLS" action
// (POST /api/demos/[id]/hls) exists partly for that case — it resumes from the
// worker's idempotency marker rather than starting over.
export const maxDuration = 300;

type SessionUser = {
  id?: string;
  email?: string | null;
};

async function getCurrentUserId(user: SessionUser): Promise<string | null> {
  if (user.id) {
    return user.id;
  }
  if (!user.email) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });

  return dbUser?.id ?? null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getCurrentUserId(session.user);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const exportedVideos = await prisma.exportedVideo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, exportedVideos });
  } catch (error) {
    console.error("Error fetching exported videos:", error);
    return NextResponse.json({ error: "Failed to fetch exported videos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getCurrentUserId(session.user);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      exportedUrl,
      sourceVideoUrl,
      settings,
      demoId,
      upsertByDemo = true,
    } = body;

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

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
      userRecord?.plan === "PRO" ||
      userRecord?.plan === "ENTERPRISE";
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
            error: "Free trial limit of 3 exports reached. Please upgrade to Pro.",
          },
          { status: 403 }
        );
      }
    }

    if (!exportedUrl) {
      return NextResponse.json({ error: "exportedUrl is required" }, { status: 400 });
    }

    // refuse to store urls the server must never fetch
    if (!isSafeUrl(exportedUrl)) {
      return NextResponse.json({ error: "Exported URL is not allowed" }, { status: 400 });
    }
    if (typeof sourceVideoUrl === "string" && sourceVideoUrl.trim().length > 0) {
      if (!isSafeUrl(sourceVideoUrl)) {
        return NextResponse.json({ error: "Source video URL is not allowed" }, { status: 400 });
      }
    }

    const normalizedTitle =
      typeof title === "string" && title.trim().length > 0 ? title.trim() : "Untitled Export";
    const normalizedDescription =
      typeof description === "string" && description.trim().length > 0 ? description.trim() : null;
    const normalizedSourceUrl =
      typeof sourceVideoUrl === "string" && sourceVideoUrl.trim().length > 0
        ? sourceVideoUrl.trim()
        : null;

    if (demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true },
      });

      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }

    if (demoId && upsertByDemo) {
      const previous = await prisma.exportedVideo.findUnique({
        where: { demoId },
        select: { id: true, userId: true, exportedUrl: true },
      });

      if (previous && previous.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const exportedVideo = await prisma.exportedVideo.upsert({
        where: { demoId },
        update: {
          title: normalizedTitle,
          description: normalizedDescription,
          exportedUrl,
          shareableUrl: exportedUrl,
          sourceVideoUrl: normalizedSourceUrl,
          settings: settings ?? null,
        },
        create: {
          userId,
          demoId,
          title: normalizedTitle,
          description: normalizedDescription,
          exportedUrl,
          shareableUrl: exportedUrl,
          sourceVideoUrl: normalizedSourceUrl,
          settings: settings ?? null,
        },
      });

      await prisma.demo.update({
        where: { id: demoId },
        data: { exportedUrl },
      });

      if (previous?.exportedUrl && previous.exportedUrl !== exportedUrl) {
        await deleteCloudinaryVideoByUrl(previous.exportedUrl);
      }

      // OVL PR 8 — package HLS renditions for the export that just landed.
      // AFTER THE RESPONSE, never in it: a three-rung ladder takes minutes and
      // the editor is waiting on this call to tell the user their export saved.
      // Same shape as dispatchVideoJob() in app/api/jobs/create/route.ts.
      // packageDemoHls() is a no-op when OVERLAYS_HLS_ENABLED is unset, is
      // idempotent when the source has not changed, and never throws — a
      // packaging failure leaves the demo playing its progressive MP4, which is
      // what it would have done anyway.
      after(() => packageDemoHls(demoId));

      return NextResponse.json({ success: true, exportedVideo });
    }

    const exportedVideo = await prisma.exportedVideo.create({
      data: {
        userId,
        demoId: demoId ?? null,
        title: normalizedTitle,
        description: normalizedDescription,
        exportedUrl,
        shareableUrl: exportedUrl,
        sourceVideoUrl: normalizedSourceUrl,
        settings: settings ?? null,
      },
    });

    return NextResponse.json({ success: true, exportedVideo });
  } catch (error) {
    console.error("Error saving exported video:", error);
    return NextResponse.json({ error: "Failed to save exported video" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getCurrentUserId(session.user);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const record = await prisma.exportedVideo.findUnique({
      where: { id },
      select: { id: true, userId: true, exportedUrl: true, demoId: true },
    });

    if (!record || record.userId !== userId) {
      return NextResponse.json({ error: "Exported video not found" }, { status: 404 });
    }

    await prisma.exportedVideo.delete({ where: { id } });
    await deleteCloudinaryVideoByUrl(record.exportedUrl);

    if (record.demoId) {
      await prisma.demo
        .update({
          where: { id: record.demoId },
          data: { exportedUrl: null },
        })
        .catch(() => null);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting exported video:", error);
    return NextResponse.json({ error: "Failed to delete exported video" }, { status: 500 });
  }
}
