import React from "react";
import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ViewsOverTimePanelProps {
  viewsOverTime: { date: string; views: number }[];
}

function formatTooltipDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00Z");
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const ViewsOverTimePanel = ({ viewsOverTime }: ViewsOverTimePanelProps) => {
  const hasData = viewsOverTime.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
      className="panel flex min-h-[320px] flex-col overflow-hidden rounded-[15px] bg-white p-4 shadow-sm md:p-6 lg:min-h-0"
    >
      <h2 className="shrink-0 text-xl font-semibold leading-tight text-[#261753] md:text-2xl">
        Views over time
      </h2>
      <p className="mt-0.5 shrink-0 text-sm text-[rgba(0,0,0,0.51)] md:text-base">
        Demo views in last 30 days
      </p>

      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-[15px] bg-[rgba(197,182,241,0.09)] p-2 dark:bg-[rgba(255,255,255,0.02)]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%" minHeight={0}>
            <LineChart data={viewsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5DCFF" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#8C82B4", fontSize: 12 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#8C82B4", fontSize: 12 }}
                dx={-10}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  backgroundColor: "#101329",
                  border: "1px solid rgba(161, 153, 210, 0.25)",
                }}
                labelStyle={{ color: "#bdb7d1", fontWeight: 600, marginBottom: "4px" }}
                labelFormatter={(dateStr) => formatTooltipDate(dateStr)}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
formatter={(value: any, name: any) => [value?.toLocaleString?.() ?? "0", name]}
              />
              <Line
                type="monotone"
                dataKey="views"
                stroke="#8A76FC"
                strokeWidth={4}
                dot={{ r: 4, fill: "#8A76FC", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Eye className="h-9 w-9 text-[rgba(138,118,252,0.5)]" strokeWidth={1.8} />
            <p className="text-lg font-semibold text-[rgba(38,23,83,0.66)]">No view data yet</p>
            <p className="text-sm text-[rgba(38,23,83,0.51)] md:text-base">
              Showing growth trend over time
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ViewsOverTimePanel;
