"use client";
import AnalyticsMain from "@/app/components/AnalyticsMain";
import SignedHeader from "@/app/components/SignedHeader";

const AnalyticsPage = () => {
  return (
    <div
      className="flex flex-col flex-grow h-full bg-[#F4F1FD] text-[#2D2154] relative overflow-y-auto"
      style={{ minHeight: "calc(100vh - 80px)" }}
    >
      <SignedHeader
        titleText="Analytics"
        iconSRC="/icons/explore-templates.svg"
        iconALT="analytics_icon"
      />
      <AnalyticsMain />
    </div>
  );
};

export default AnalyticsPage;
