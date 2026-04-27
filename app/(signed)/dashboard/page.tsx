import { getPageMetadata } from "@/app/lib/metadata";
import { getServerSession } from "next-auth";
import DashboardClient from "./DashboardClient";
import { prisma } from "@/app/lib/prisma";
import { authOptions } from "@/app/lib/auth/options";

export const metadata = getPageMetadata("dashboard");

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  //query the total count
  const totalCount = await prisma.demo.count({
    where: {
      userId: session.user.id,
    },
  });

  //querying the recent demos(list)
  const recentDemos = await prisma.demo.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const totalViews = await prisma.view.count({
    where: {
      OR: [
        { demo: { userId: session.user.id } },
        { exportedVideo: { userId: session.user.id } },
      ],
    },
  });

  const activeShares = await prisma.exportedVideo.aggregate({
    where: { userId: session.user.id },
    _sum: { shareCount: true },
  });

  const cleanDemos = recentDemos.map((demo) => ({
    id: demo.id,
    title: demo.title,
    description: demo.description,
    videoUrl: demo.videoUrl,
    startTime: demo.startTime,
    endTime: demo.endTime,
    createdAt: demo.createdAt.toISOString(),
    updatedAt: demo.updatedAt.toISOString(),
    editing: demo.editing
      ? (demo.editing as {
          segments?: unknown;
          zoom?: unknown;
          aspectRatio?: string;
          browserFrame?: unknown;
        })
      : undefined,
  }));

  return (
    <DashboardClient
      totalCount={totalCount}
      initialDemos={cleanDemos}
      totalViews={totalViews}
      activeShares={activeShares._sum.shareCount ?? 0}
    />
  );
}
