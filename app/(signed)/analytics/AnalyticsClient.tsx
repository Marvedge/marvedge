"use client";
import AnalyticsMain from "@/app/components/AnalyticsMain";

type AnalyticsClientProps = {
  totalViews: number;
  avgDuration: string;
  completionRate: string;
  activeShares: number;
  topDemos: { title: string; views: number }[];
  viewsOverTime: { date: string; views: number }[];
};

const AnalyticsPage = (props: AnalyticsClientProps) => {
  return (
    <div className="flex flex-col grow h-full bg-[#F4F1FD] text-[#2D2154] relative overflow-y-auto">
      <AnalyticsMain {...props} />
    </div>
  );
};

export default AnalyticsPage;
