"use client";

import React from "react";

export interface BrandBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "live" | "obsidian" | "sand" | "mist" | "slate";
  size?: "sm" | "md";
}

export function BrandBadge({
  children,
  variant = "sand",
  size = "md",
  className = "",
  ...props
}: BrandBadgeProps) {
  const baseClasses =
    "inline-flex items-center gap-1.5 font-sans font-semibold rounded-full select-none";

  const sizeClasses = {
    sm: "px-2.5 py-0.5 text-[10px] tracking-wider uppercase",
    md: "px-3.5 py-1 text-xs",
  }[size];

  const variantClasses = {
    live: "bg-white text-black border border-[#E8DFCA] shadow-2xs",
    obsidian: "bg-black text-white",
    sand: "bg-[#E8DFCA] text-black border border-[#D6CCB5]",
    mist: "bg-[#AEBDCA]/30 text-black border border-[#AEBDCA]",
    slate: "bg-[#7895B2] text-white",
  }[variant];

  return (
    <span
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {variant === "live" && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#7895B2] animate-pulse" />
      )}
      {children}
    </span>
  );
}
