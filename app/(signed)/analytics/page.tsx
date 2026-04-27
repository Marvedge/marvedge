import { getPageMetadata } from "@/app/lib/metadata";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import AnalyticsClient from "./AnalyticsClient";

export const metadata = getPageMetadata("analytics");

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  const userId = session.user.id;

  const views = await prisma.view.findMany({
    where: {
      OR: [{ demo: { userId } }, { exportedVideo: { userId } }],
    },
    include: { demo: true, exportedVideo: true },
  });
  const totalViews = views.length;

  let totalDuration = 0;
  views.forEach((v) => {
    totalDuration += v.duration || 0;
  });
  const avgDurationSec = views.length ? Math.round(totalDuration / views.length) : 0;
  const avgDuration = `${Math.floor(avgDurationSec / 60)}m ${avgDurationSec % 60}s`;

  // Generic completion rate based on ~45s average demo length
  const completionRate = views.length
    ? `${Math.min(100, Math.round((avgDurationSec / 45) * 100))}%`
    : "0%";

  const activeSharesAgg = await prisma.exportedVideo.aggregate({
    where: { userId },
    _sum: { shareCount: true },
  });
  const activeShares = activeSharesAgg._sum.shareCount ?? 0;

  const demos = await prisma.demo.findMany({
    where: { userId },
    include: {
      views: true,
      exportedVideo: {
        include: { views: true },
      },
    },
  });
  const topDemos = demos
    .map((d) => {
      // To avoid double counting, we could use a Set of view IDs
      const allViewIds = new Set([
        ...d.views.map((v) => v.id),
        ...(d.exportedVideo?.views.map((v) => v.id) || []),
      ]);
      return { title: d.title, views: allViewIds.size };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  const viewCountsByDate: Record<string, number> = {};
  views.forEach((v) => {
    const dateStr = v.timestamp.toISOString().split("T")[0];
    viewCountsByDate[dateStr] = (viewCountsByDate[dateStr] || 0) + 1;
  });
  const viewsOverTime = Object.entries(viewCountsByDate)
    .map(([date, count]) => ({ date, views: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <AnalyticsClient
      totalViews={totalViews}
      avgDuration={avgDuration}
      completionRate={completionRate}
      activeShares={activeShares}
      topDemos={topDemos}
      viewsOverTime={viewsOverTime}
    />
  );
}
