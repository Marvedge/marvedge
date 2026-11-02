import React from "react";
import { motion } from "framer-motion";
import { Eye, MousePointerClick, CheckCircle2 } from "lucide-react";

interface TopDemosPanelProps {
  topDemos: { title: string; views: number; ctaClicks: number; hasCta: boolean }[];
}

const TopDemosPanel = ({ topDemos }: TopDemosPanelProps) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, ease: "easeOut", delay: 0.35 }}
    className="panel flex min-h-[320px] flex-col overflow-hidden rounded-[15px] bg-white p-4 shadow-sm md:p-6 lg:min-h-0"
  >
    <h2 className="shrink-0 text-xl font-semibold leading-tight text-[#261753] md:text-2xl">
      Top performing Demos
    </h2>
    <p className="mt-0.5 shrink-0 text-sm text-[rgba(0,0,0,0.51)] md:text-base">
      Your best performing demos this month
    </p>

    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {topDemos.length > 0 ? (
        topDemos.map((demo, i) => (
          <div
            key={i}
            className="demo-item flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-xl border border-[#E5DCFF] bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex min-w-0 flex-1 basis-[150px] items-center gap-2.5">
              <div className="rank flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAE5FB] text-sm font-semibold text-[#8A76FC]">
                {i + 1}
              </div>
              <p
                className="demo-name min-w-0 truncate text-sm font-medium text-[#2D2154]"
                title={demo.title}
              >
                {demo.title}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="views flex items-center gap-1.5 rounded-full bg-[#F4F1FD] px-2.5 py-0.5 text-[#6356D7]">
                <Eye size={13} />
                <span className="text-xs font-semibold">{demo.views} views</span>
              </div>
              {demo.hasCta ? (
                <div className="flex items-center gap-1.5 rounded-full bg-[#EAE5FB] px-2.5 py-0.5 text-[#8A76FC] dark:border dark:border-[rgba(126,75,255,0.32)] dark:bg-[rgba(72,28,152,0.22)] dark:text-[#9c6cff]">
                  <MousePointerClick size={13} />
                  <span className="text-xs font-semibold">{demo.ctaClicks} clicks</span>
                </div>
              ) : (
                <span className="max-w-[150px] text-right text-[11px] leading-tight text-[#8C82B4]">
                  No CTA added yet. Add a CTA to start tracking clicks.
                </span>
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(138,118,252,0.25)]">
            <CheckCircle2 className="h-6 w-6 text-[#8A76FC]" />
          </div>
          <p className="text-lg font-semibold text-[rgba(38,23,83,0.66)]">No Analytics yet</p>
          <p className="text-sm text-[rgba(38,23,83,0.51)] md:text-base">
            Create and share demos to share performance data
          </p>
        </div>
      )}
    </div>
  </motion.div>
);

export default TopDemosPanel;
