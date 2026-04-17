import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { deleteCloudinaryVideoByUrl } from "@/app/lib/cloudinary-utils";

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

    const isExempt = session.user.email === "aryaanandpathak30@gmail.com";
    if (!isExempt) {
      const exportCount = await prisma.exportedVideo.count({
        where: { userId },
      });
      if (exportCount >= 3) {
        return NextResponse.json(
          { error: "Free trial limit of 3 exports reached. Please upgrade to Pro." },
          { status: 403 }
        );
      }
    }

    if (!exportedUrl) {
      return NextResponse.json({ error: "exportedUrl is required" }, { status: 400 });
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
