import { getPageMetadata } from "@/app/lib/metadata";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isOverlaysEnabled } from "@/app/lib/overlays/flags";
import { deriveDemoFunnels, type DemoEventTotal } from "@/app/lib/overlays/funnel";
import { utcDateKey } from "@/app/lib/overlays/rollup";
import {
  DAY_MS,
  averageSeconds,
  completion,
  rollingWindowStart,
  trend,
  utcMonthStart,
  utcPreviousMonthStart,
} from "@/app/lib/analytics/metrics";
import AnalyticsClient from "./AnalyticsClient";

/**
 * How far back the "Views over time" chart and the overlay funnel report. The
 * two share a window so a reader can line the funnel's starts up against the
 * chart without a caveat.
 */
const REPORT_WINDOW_DAYS = 30;

/** `m s` for the Avg Duration card. */
function formatDuration(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

/** A whole percent, or an em dash when there was nothing to measure. */
function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/**
 * Distinct clickers in a set of CTA clicks.
 *
 * `userId ?? sessionId`: a signed-in viewer is counted once by id even across
 * sessions, an anonymous one once per browser session. Rows with neither are
 * dropped rather than pooled into a single phantom "null" visitor.
 */
function uniqueClickers(rows: { userId: string | null; sessionId: string | null }[]): number {
  return new Set(rows.map((c) => c.userId ?? c.sessionId).filter((id): id is string => Boolean(id)))
    .size;
}

export const metadata = getPageMetadata("analytics");

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  const userId = session.user.id;

  // THE CLOCK IS READ ONCE. Every window below derives from these, so the chart,
  // the "this month" panel and the month-over-month trends cannot disagree about
  // which month it is by crossing midnight mid-render.
  const now = new Date();
  const monthStart = utcMonthStart(now);
  const prevMonthStart = utcPreviousMonthStart(now);
  const reportWindowStart = rollingWindowStart(now, REPORT_WINDOW_DAYS);

  const views = await prisma.view.findMany({
    where: {
      OR: [{ demo: { userId } }, { exportedVideo: { userId } }],
    },
    include: { demo: true, exportedVideo: true },
  });

  // A view knows the length of the demo it belongs to (via the join above), which
  // is what makes a real completion rate possible. An exported-video view has no
  // demo, so its length is null and it is excluded from the denominator.
  const completionViews = (rows: typeof views) =>
    rows.map((v) => ({ duration: v.duration, demoDuration: v.demo?.duration ?? null }));

  // --- Headline metrics (all-time) -------------------------------------------
  const totalViews = views.length;

  const avgDurationSec = averageSeconds(views.map((v) => v.duration));
  const avgDuration = formatDuration(Math.round(avgDurationSec ?? 0));

  const completionRate = formatPercent(completion(completionViews(views)).percent);

  // --- Month-over-month windows ----------------------------------------------
  const thisMonthViews = views.filter((v) => v.timestamp >= monthStart);
  const prevMonthViews = views.filter(
    (v) => v.timestamp >= prevMonthStart && v.timestamp < monthStart
  );

  // --- CTA clicks ------------------------------------------------------------
  // Fetched once and sliced by month below, so the headline rate and its trend
  // read from the same rows.
  const ctaClickRows = await prisma.ctaClick.findMany({
    where: { demo: { userId } },
    select: { userId: true, sessionId: true, demoId: true, timestamp: true },
  });
  const clicksThisMonth = ctaClickRows.filter((c) => c.timestamp >= monthStart);
  const clicksPrevMonth = ctaClickRows.filter(
    (c) => c.timestamp >= prevMonthStart && c.timestamp < monthStart
  );

  // CTR is clicks per DEMO view. Export views can never carry a CTA click, so
  // including them in the denominator would understate the rate for no reason.
  const demoViews = views.filter((v) => v.demoId);
  const demoViewsThisMonth = thisMonthViews.filter((v) => v.demoId);
  const demoViewsPrevMonth = prevMonthViews.filter((v) => v.demoId);

  const ctaClickRate = demoViews.length
    ? `${Math.round((uniqueClickers(ctaClickRows) / demoViews.length) * 100)}%`
    : "0%";

  const ctrThis = demoViewsThisMonth.length
    ? (uniqueClickers(clicksThisMonth) / demoViewsThisMonth.length) * 100
    : null;
  const ctrPrev = demoViewsPrevMonth.length
    ? (uniqueClickers(clicksPrevMonth) / demoViewsPrevMonth.length) * 100
    : null;

  // --- Stat-card trends: real month-over-month deltas, never placeholders ----
  const trends = {
    views: trend(thisMonthViews.length, prevMonthViews.length, "change"),
    completion: trend(
      completion(completionViews(thisMonthViews)).percent,
      completion(completionViews(prevMonthViews)).percent,
      "points"
    ),
    duration: trend(
      averageSeconds(thisMonthViews.map((v) => v.duration)),
      averageSeconds(prevMonthViews.map((v) => v.duration)),
      "seconds"
    ),
    ctr: trend(ctrThis, ctrPrev, "points"),
  };

  // --- Views over time: last 30 UTC days, zero-filled ------------------------
  // The panel's subtitle says "last 30 days"; the buckets honour it. Days with no
  // views are emitted as zero so the axis spans the real window instead of only
  // the days that happened to have traffic.
  const viewCountsByDate = new Map<string, number>();
  for (const v of views) {
    if (v.timestamp < reportWindowStart) {
      continue;
    }
    const dateStr = utcDateKey(v.timestamp);
    viewCountsByDate.set(dateStr, (viewCountsByDate.get(dateStr) ?? 0) + 1);
  }
  const viewsOverTime = Array.from({ length: REPORT_WINDOW_DAYS }, (_, i) => {
    const dateStr = utcDateKey(new Date(reportWindowStart.getTime() + i * DAY_MS));
    return { date: dateStr, views: viewCountsByDate.get(dateStr) ?? 0 };
  });

  // --- Top demos: this calendar month ----------------------------------------
  const demos = await prisma.demo.findMany({
    where: { userId },
    include: {
      views: true,
      exportedVideo: {
        include: { views: true },
      },
      _count: { select: { ctas: true } },
    },
  });

  const clicksThisMonthByDemo = new Map<string, number>();
  for (const c of clicksThisMonth) {
    clicksThisMonthByDemo.set(c.demoId, (clicksThisMonthByDemo.get(c.demoId) ?? 0) + 1);
  }

  const topDemos = demos
    .map((d) => {
      // Set of view ids so a view counted under both the demo and its export is
      // not double counted. Windowed to the current month to match the panel's
      // "this month" subtitle.
      const allViewIds = new Set([
        ...d.views.filter((v) => v.timestamp >= monthStart).map((v) => v.id),
        ...(d.exportedVideo?.views.filter((v) => v.timestamp >= monthStart).map((v) => v.id) ?? []),
      ]);
      return {
        title: d.title,
        views: allViewIds.size,
        ctaClicks: clicksThisMonthByDemo.get(d.id) ?? 0,
        hasCta: d._count.ctas > 0,
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  // ==========================================================================
  // OVERLAY FUNNEL (OVL PR 7) — READS THE ROLLUP, NEVER RAW EVENTS
  // ==========================================================================
  // TWO QUERIES, AND NEITHER GROWS WITH EVENT VOLUME. `demos` above is reused
  // for ids and titles, so this section adds exactly one: a groupBy over
  // PlayerEventDaily, which holds one row per (demo, event name, day) and is
  // collapsed to (demo, event name) by the database. A workspace with 10 demos
  // over a 30-day window reads at most 10 x 7 x 30 rows and returns at most
  // 10 x 7 — whether those days held a thousand views or ten million.
  //
  // The equivalent query against PlayerEvent would return a row per event and
  // is the thing locked decision 9 exists to forbid. There is no findMany on
  // PlayerEvent anywhere in this file, and there must not be one.
  //
  // NOTE, and out of scope here by instruction: the `view.findMany` at the top
  // of this file loads every View row for the user with two joins and
  // aggregates in JS. It survives because View is one row per view. It is a
  // known problem, called out in Overlays-Implementation-Plan.md, and it is
  // deliberately NOT touched by this PR.
  //
  // Gated on the server flag: with overlays off there is nothing to report and
  // the page renders exactly as it did before this feature existed.
  let overlayFunnel: {
    overall: ReturnType<typeof deriveDemoFunnels>["overall"];
    perDemo: ReturnType<typeof deriveDemoFunnels>["perDemo"];
    windowDays: number;
  } | null = null;

  if (isOverlaysEnabled()) {
    // PlayerEventDaily has no foreign key to Demo (by design — the rollup must
    // outlive its demo so historical totals do not rewrite themselves), so
    // ownership is enforced with an explicit id list rather than a join. The
    // list is bounded by the user's demo count, not by traffic.
    const demoIds = demos.map((d) => d.id);

    const totals = demoIds.length
      ? await prisma.playerEventDaily.groupBy({
          by: ["demoId", "name"],
          where: { demoId: { in: demoIds }, date: { gte: reportWindowStart } },
          _sum: { count: true },
        })
      : [];

    const rows: DemoEventTotal[] = totals.map((row) => ({
      demoId: row.demoId,
      name: row.name,
      count: row._sum.count ?? 0,
    }));

    const { overall, perDemo } = deriveDemoFunnels(
      rows,
      new Map(demos.map((d) => [d.id, d.title]))
    );
    overlayFunnel = { overall, perDemo, windowDays: REPORT_WINDOW_DAYS };
  }

  return (
    <AnalyticsClient
      overlayFunnel={overlayFunnel}
      totalViews={totalViews}
      avgDuration={avgDuration}
      completionRate={completionRate}
      topDemos={topDemos}
      viewsOverTime={viewsOverTime}
      ctaClickRate={ctaClickRate}
      trends={trends}
    />
  );
}
