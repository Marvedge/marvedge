import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ count: 0 }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ count: 0, plan: "FREE" }, { status: 404 });
    }

    // A user can "export" a video by creating a successful VideoJob
    const jobCount = await prisma.videoJob.count({
      where: { userId: user.id, status: "COMPLETED" },
    });

    // Or by explicitly saving an ExportedVideo
    const savedCount = await prisma.exportedVideo.count({
      where: { userId: user.id },
    });

    const exportCount = Math.max(jobCount, savedCount);

    return NextResponse.json({ count: exportCount, plan: user.plan });
  } catch (error) {
    console.error("Error fetching export count", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
