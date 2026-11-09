"use client";

import React from "react";

export interface BrandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: "white" | "sand" | "obsidian";
  elevation?: "flat" | "raised" | "floating";
  interactive?: boolean;
}

export function BrandCard({
  children,
  surface = "white",
  elevation = "raised",
  interactive = false,
  className = "",
  ...props
}: BrandCardProps) {
  const baseClasses = "rounded-3xl p-6 sm:p-8 transition-all duration-200";

  const surfaceClasses = {
    white: "bg-white text-black border border-[#E8DFCA]",
    sand: "bg-[#E8DFCA] text-black border border-[#D6CCB5]",
    obsidian: "bg-black text-white border border-neutral-800",
  }[surface];

  const elevationClasses = {
    flat: "shadow-none",
    raised: "shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_6px_-1px_rgba(0,0,0,0.02)]",
    floating: "shadow-[0_12px_32px_-4px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.03)]",
  }[elevation];

  const interactiveClasses = interactive
    ? "cursor-pointer hover:-translate-y-1 hover:shadow-[0_16px_36px_-4px_rgba(0,0,0,0.12)]"
    : "";

  return (
    <div
      className={`${baseClasses} ${surfaceClasses} ${elevationClasses} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
