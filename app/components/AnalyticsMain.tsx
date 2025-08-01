"use client";

import { Eye, CheckCircle, Clock, MousePointerClick } from "lucide-react";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

const AnalyticsMain = () => {
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
      value: "0",
      trend: "+23.2%",
      trendLabel: "vs last month",
      icon: <Eye className="w-6 h-6 md:w-7 md:h-7 text-[#8A76FC]" />,
      bgColor: "bg-[#C5B6F1]",
      hoverColor: "from-[#C5B6F1] to-[#8A76FC]",
      shadow: "shadow-[#8A76FC]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "completion",
      label: "Completion Rate",
      value: "0%",
      trend: "+5.2%",
      trendLabel: "vs last month",
      icon: <CheckCircle className="w-6 h-6 md:w-7 md:h-7 text-[#2F80EC]" />,
      bgColor: "bg-[#9BE1F8]",
      hoverColor: "from-[#9BE1F8] to-[#2F80EC]",
      shadow: "shadow-[#2F80EC]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "duration",
      label: "Avg Duration",
      value: "2m 34s",
      trend: "+12s",
      trendLabel: "vs last month",
      icon: <Clock className="w-6 h-6 md:w-7 md:h-7 text-[#6356D7]" />,
      bgColor: "bg-[#E6E1FA]",
      hoverColor: "from-[#E6E1FA] to-[#C5B6F1]",
      shadow: "shadow-[#6356D7]/50",
      textColor: "text-[#261753]",
    },
    {
      id: "ctr",
      label: "Click through rate",
      value: "4.8%",
      trend: "+0.3%",
      trendLabel: "vs last month",
      icon: (
        <MousePointerClick className="w-6 h-6 md:w-7 md:h-7 text-[#E33629]" />
      ),
      bgColor: "bg-[#F9E6E6]",
      hoverColor: "from-[#F9E6E6] to-[#E33629]",
      shadow: "shadow-[#E33629]/50",
      textColor: "text-[#261753]",
    },
  ];

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
                  ? `scale-110 shadow-2xl ${card.shadow} rotate-2 bg-gradient-to-br ${card.hoverColor}`
                  : "hover:scale-105 hover:shadow-lg"
              }
            `}
          >
            <div className="mb-2">
              <span
                className={`
                  inline-block p-2 rounded-lg transition-all duration-300
                  ${
                    hoveredCard === card.id
                      ? "scale-110 bg-opacity-80"
                      : "bg-white/70"
                  }
                `}
              >
                {card.icon}
              </span>
            </div>
            <div className="text-sm md:text-lg font-medium text-[#261753]">
              {card.label}
            </div>
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 17l6-6 4 4 8-8"
                />
              </svg>
              {card.trend}{" "}
              <span className="text-gray-500 font-normal ml-1">
                {card.trendLabel}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          className="bg-[#FBF9FF] rounded-[20px] p-8 shadow-sm min-h-[350px] flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-[22px] font-semibold text-[#2D2154] leading-tight">
              Views over time
            </h3>
            <p className="text-base text-[#8C82B4] mt-1">
              Demo views in last 30 days
            </p>
          </div>
          <div className="flex-1 rounded-[16px] flex flex-col items-center justify-center px-6 py-10 text-center">
            <Eye className="w-10 h-10 text-[#C5B6F1] mb-4" />
            <p className="text-[#7569A5] font-semibold text-base">
              Chart visualization would go here
            </p>
            <p className="text-base text-[#8C82B4] mt-1">
              Showing growth trend over time
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
          className="bg-[#FBF9FF] rounded-[20px] p-8 shadow-sm min-h-[350px] flex flex-col"
        >
          <div className="mb-6">
            <h3 className="text-[22px] font-semibold text-[#2D2154] leading-tight">
              Top performing Demos
            </h3>
            <p className="text-base text-[#8C82B4] mt-1">
              Your best performing demos this month
            </p>
          </div>
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
            <p className="text-[#7569A5] font-semibold text-base">
              No Analytics yet
            </p>
            <p className="text-base text-[#8C82B4]">
              Create and share demos to share performance data
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AnalyticsMain;
