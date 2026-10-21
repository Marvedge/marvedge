import React from "react";
import {
  Eye,
  CheckCircle2,
  Clock,
  MousePointerClick,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { Trend } from "@/app/lib/analytics/metrics";

interface AnalyticsCard {
  id: string;
  label: string;
  value: string;
  trend: Trend;
  icon: React.ReactNode;
  /** pastel card background (Figma card fill, light mode) */
  cardBg: string;
  /** rounded icon tile background (light mode) */
  iconBg: string;
  /** dark-mode hook consumed by app/styles/analytics-dark.css */
  variant: string;
  /** whether the value is rendered at the larger 64px size */
  largeValue: boolean;
}

export interface AnalyticsTrends {
  views: Trend;
  completion: Trend;
  duration: Trend;
  ctr: Trend;
}

interface AnalyticsStatCardsProps {
  totalViews: number;
  completionRate: string;
  avgDuration: string;
  ctaClickRate: string;
  /** Real month-over-month deltas, computed on the server from the same rows. */
  trends: AnalyticsTrends;
  isVisible: boolean;
}

const AnalyticsStatCards = ({
  totalViews,
  completionRate,
  avgDuration,
  ctaClickRate,
  trends,
  isVisible,
}: AnalyticsStatCardsProps) => {
  const cards: AnalyticsCard[] = [
    {
      id: "views",
      label: "Total Views",
      value: totalViews.toString(),
      trend: trends.views,
      icon: <Eye className="h-5 w-5 text-[#8A76FC] dark:text-[#8b55ff]" />,
      cardBg: "bg-[rgba(197,182,241,0.19)]",
      iconBg: "bg-[rgba(138,118,252,0.14)]",
      variant: "stat-card",
      largeValue: true,
    },
    {
      id: "completion",
      label: "Completion Rate",
      value: completionRate,
      trend: trends.completion,
      icon: <CheckCircle2 className="h-5 w-5 text-[#2F80EC] dark:text-[#3f9bff]" />,
      cardBg: "bg-[rgba(155,225,248,0.14)]",
      iconBg: "bg-[rgba(21,101,216,0.12)]",
      variant: "stat-card blue",
      largeValue: true,
    },
    {
      id: "duration",
      label: "Avg Duration",
      value: avgDuration,
      trend: trends.duration,
      icon: <Clock className="h-5 w-5 text-[#62408F] dark:text-[#8b55ff]" />,
      cardBg: "bg-[rgba(38,23,83,0.06)]",
      iconBg: "bg-[rgba(98,64,143,0.13)]",
      variant: "stat-card",
      largeValue: false,
    },
    {
      id: "ctr",
      label: "Click through rate",
      value: ctaClickRate,
      trend: trends.ctr,
      icon: <MousePointerClick className="h-5 w-5 text-[#E33629] dark:text-[#ff454b]" />,
      cardBg: "bg-[rgba(222,97,14,0.10)]",
      iconBg: "bg-[rgba(222,97,14,0.15)]",
      variant: "stat-card red",
      largeValue: false,
    },
  ];

  return (
    <div className="mb-4 grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
      {cards.map((card, idx) => (
        <div
          key={card.id}
          style={{ transitionDelay: `${idx * 90}ms` }}
          className={`${card.variant} flex flex-col rounded-[15px] border border-transparent p-4 transition-all duration-700 ease-out md:p-5 ${
            card.cardBg
          } ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          } hover:-translate-y-1`}
        >
          <span
            className={`stat-icon inline-flex h-10 w-10 items-center justify-center rounded-[9px] ${card.iconBg}`}
          >
            {card.icon}
          </span>

          <div className="mt-auto pt-3">
            <p className="text-sm font-normal text-[#261753] dark:text-white/90 md:text-base">
              {card.label}
            </p>
            <p
              className={`mt-1 font-medium leading-none text-[rgba(38,23,83,0.72)] dark:text-white ${
                card.largeValue ? "text-3xl xl:text-4xl" : "text-2xl xl:text-3xl"
              }`}
            >
              {card.value}
            </p>
            <TrendRow trend={card.trend} />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * The month-over-month line under a card's value.
 *
 * The arrow and colour follow the DIRECTION of the real delta — a loss must not
 * render as a green up-arrow. A dash (no baseline to compare against) is drawn
 * neutral rather than dressed up as growth.
 */
const TrendRow = ({ trend }: { trend: Trend }) => {
  const palette =
    trend.direction === "up"
      ? { icon: TrendingUp, text: "text-[#36B37E] dark:text-[#25ec7c]" }
      : trend.direction === "down"
        ? { icon: TrendingDown, text: "text-[#E33629] dark:text-[#ff454b]" }
        : { icon: Minus, text: "text-gray-400 dark:text-white/50" };
  const Icon = palette.icon;

  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold md:text-sm">
      <Icon className={`h-4 w-4 shrink-0 ${palette.text}`} strokeWidth={2.4} />
      <span className={palette.text}>{trend.value}</span>
      <span className="truncate font-normal text-gray-400 dark:text-white/50">vs last month</span>
    </p>
  );
};

export default AnalyticsStatCards;
