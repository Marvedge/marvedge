"use client";
import AnalyticsMain from "@/app/components/AnalyticsMain";
import type { OverlayFunnelPanelProps } from "@/app/components/analytics/OverlayFunnelPanel";
import type { Trend } from "@/app/lib/analytics/metrics";

export type AnalyticsTrends = {
  views: Trend;
  completion: Trend;
  duration: Trend;
  ctr: Trend;
};

type AnalyticsClientProps = {
  totalViews: number;
  avgDuration: string;
  completionRate: string;
  topDemos: { title: string; views: number; ctaClicks: number; hasCta: boolean }[];
  viewsOverTime: { date: string; views: number }[];
  ctaClickRate: string;
  /** Real month-over-month deltas for the stat cards, computed on the server. */
  trends: AnalyticsTrends;
  /** Null when OVERLAYS_ENABLED is off — the page then renders as it always has. */
  overlayFunnel: OverlayFunnelPanelProps | null;
};

const AnalyticsPage = (props: AnalyticsClientProps) => {
  // This page is a fixed-viewport dashboard on large screens: the outer frame
  // clips and the two panels stretch to fill it. The funnel adds a third
  // section below them, which cannot fit in a clipped frame — so when it is
  // present the page scrolls on large screens too. With overlays off the class
  // list is exactly what it was before this feature existed.
  return (
    <div
      className={
        props.overlayFunnel
          ? "analytics-page relative flex h-full min-h-0 grow flex-col overflow-y-auto bg-[#F4F1FD] text-[#2D2154]"
          : "analytics-page relative flex h-full min-h-0 grow flex-col overflow-y-auto bg-[#F4F1FD] text-[#2D2154] lg:overflow-hidden"
      }
    >
      <AnalyticsMain {...props} />
    </div>
  );
};

export default AnalyticsPage;
