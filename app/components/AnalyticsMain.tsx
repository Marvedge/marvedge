"use client";

import { Eye, CheckCircle, Clock, Share2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const metadata = {
  title: "Settings",
  icon: "/icons/settings.svg",
};

type AnalyticsMainProps = {
  totalViews?: number;
  avgDuration?: string;
  completionRate?: string;
  activeShares?: number;
  topDemos?: { title: string; views: number }[];
  viewsOverTime?: { date: string; views: number }[];
};

const AnalyticsMain = ({
  totalViews = 0,
  avgDuration = "0m 0s",
  completionRate = "0%",
  activeShares = 0,
  topDemos = [],
  viewsOverTime = [],
}: AnalyticsMainProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleCardHover = (cardId: string) => {
    setHoveredCard(cardId);
  };

  const handleCardLeave = () => {
    setHoveredCard(null);
  };

  const cards = [
    {
      id: "views",
      label: "Total Views",
      value: totalViews.toString(),
      trend: "+12%",
      trendLabel: "vs last month",
      icon: <Eye className="w-6 h-6 md:w-7 md:h-7 text-[#8A76FC]" />,
      bgColor: "bg-[#C5B6F1]/19",
      hoverColor: "from-[#C5B6F1] to-[#8A76FC]",
      shadow: "shadow-[#8A76FC]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "completion",
      label: "Completion Rate",
      value: completionRate,
      trend: "+5.2%",
      trendLabel: "vs last month",
      icon: <CheckCircle className="w-6 h-6 md:w-7 md:h-7 text-[#2F80EC]" />,
      bgColor: "bg-[#9BE1F8]/14",
      hoverColor: "from-[#9BE1F8] to-[#2F80EC]",
      shadow: "shadow-[#2F80EC]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "duration",
      label: "Avg Duration",
      value: avgDuration,
      trend: "+2s",
      trendLabel: "vs last month",
      icon: <Clock className="w-6 h-6 md:w-7 md:h-7 text-[#6356D7]" />,
      bgColor: "bg-[#261753]/6",
      hoverColor: "from-[#E6E1FA] to-[#C5B6F1]",
      shadow: "shadow-[#6356D7]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "shares",
      label: "Active Shares",
      value: activeShares.toString(),
      trend: "+8.3%",
      trendLabel: "vs last month",
      icon: <Share2 className="w-6 h-6 md:w-7 md:h-7 text-[#E33629]" />,
      bgColor: "bg-[#DE610E]/10",
      hoverColor: "from-[#F9E6E6] to-[#E33629]",
      shadow: "shadow-[#E33629]/50",
      textColor: "text-[#261753]",
    },
  ];

  const chartData = viewsOverTime.length ? viewsOverTime : [{ date: "No data", views: 0 }];

  return (
    <div className="p-4 md:p-8 bg-[#F1ECFF] min-h-screen">
      <h2 className="text-base md:text-lg font-light text-gray-400 mb-6">
        Track performance and engagement across all your demos.
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
        {cards.map((card, idx) => (
          <div
            key={card.id}
            onMouseEnter={() => handleCardHover(card.id)}
            onMouseLeave={handleCardLeave}
            className={`
              ${
                card.bgColor
              } rounded-xl p-4 md:p-6 flex flex-col items-start shadow-sm min-h-[120px] md:min-h-[140px]
              transition-all duration-700 delay-${idx * 100}
              cursor-pointer
              ${
                isVisible
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-8 scale-95"
              }
              ${
                hoveredCard === card.id
                  ? `scale-110 shadow-2xl ${card.shadow} rotate-2 bg-linear-to-br ${card.hoverColor}`
                  : "hover:scale-105 hover:shadow-lg"
              }
            `}
          >
            <div className="mb-2">
              <span
                className={`
                  inline-block p-2 rounded-lg transition-all duration-300
                  ${hoveredCard === card.id ? `scale-110 ${card.bgColor}` : card.bgColor}
                `}
              >
                {card.icon}
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-[#261753]">{card.label}</div>
            <div
              className={`text-2xl md:text-3xl font-bold text-[#261753] ${
                hoveredCard === card.id ? card.textColor : ""
              }`}
            >
              {card.value}
            </div>
            <div className="text-sm text-green-600 font-semibold mt-1 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 mr-1 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
              </svg>
              {card.trend} <span className="text-gray-500 font-normal ml-1">{card.trendLabel}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          className="bg-[#FBF9FF] rounded-[20px] p-8 shadow-sm min-h-[350px] flex flex-col"
        >
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h3 className="text-[22px] font-semibold text-[#2D2154] leading-tight">
                Views over time
              </h3>
              <p className="text-base text-[#8C82B4] mt-1">Demo views tracking</p>
            </div>
            <select className="border border-[#E5DCFF] text-sm text-[#2D2154] rounded-lg px-3 py-1.5 bg-white outline-none">
              <option>Past 30 days</option>
              <option>Past 3 months</option>
              <option>Past 1 year</option>
            </select>
          </div>
          <div className="flex-1 w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{
                    color: "#8C82B4",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="#8A76FC"
                  strokeWidth={4}
                  dot={{
                    r: 4,
                    fill: "#8A76FC",
                    strokeWidth: 2,
                    stroke: "#fff",
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
          className="bg-[#FBF9FF] rounded-[20px] p-8 shadow-sm min-h-[350px] flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-[22px] font-semibold text-[#2D2154] leading-tight">
              Top performing Demos
            </h3>
            <p className="text-base text-[#8C82B4] mt-1">Your most viewed demos</p>
          </div>
          <div className="flex-1 flex flex-col gap-3">
            {topDemos.length > 0 ? (
              topDemos.map((demo, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center bg-white border border-[#E5DCFF] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EAE5FB] flex items-center justify-center text-[#8A76FC] font-semibold">
                      {i + 1}
                    </div>
                    <p className="font-medium text-[#2D2154] truncate max-w-[200px] md:max-w-[250px]">
                      {demo.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#6356D7] bg-[#F4F1FD] px-3 py-1 rounded-full">
                    <Eye size={14} />
                    <span className="font-semibold text-sm">{demo.views} views</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <div className="bg-[#F6F3FF] p-4 rounded-full">
                  <Image
                    src="/icons/ana-tick.svg"
                    alt="Notifications"
                    width={20}
                    height={20}
                    className="md:w-6 md:h-6"
                  />
                </div>
                <p className="text-[#7569A5] font-semibold text-base">No Analytics yet</p>
                <p className="text-base text-[#8C82B4]">
                  Create and share demos to see performance data
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AnalyticsMain;
