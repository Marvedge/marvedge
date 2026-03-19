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
    const exportedUrl = typeof body?.exportedUrl === "string" ? body.exportedUrl : "";
    const sourceVideoUrl = typeof body?.sourceVideoUrl === "string" ? body.sourceVideoUrl : "";
    const demoId = typeof body?.demoId === "string" && body.demoId.length > 0 ? body.demoId : null;

    if (!exportedUrl) {
      return NextResponse.json({ error: "exportedUrl is required" }, { status: 400 });
    }

    if (demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true, userId: true, exportedUrl: true },
      });

      if (!demo || demo.userId !== userId) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }

      if (demo.exportedUrl === exportedUrl) {
        await prisma.demo.update({
          where: { id: demoId },
          data: { exportedUrl: null },
        });
      }
    }

    await deleteCloudinaryVideoByUrl(exportedUrl);
    await deleteCloudinaryVideoByUrl(sourceVideoUrl || null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to cleanup exported video:", error);
    return NextResponse.json({ error: "Failed to cleanup exported video" }, { status: 500 });
  }
}
