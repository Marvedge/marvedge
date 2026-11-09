"use client";

import React from "react";

export interface BrandButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "obsidian" | "slate" | "sand" | "mist-outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function BrandButton({
  children,
  variant = "obsidian",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}: BrandButtonProps) {
  const baseClasses =
    "inline-flex items-center justify-center font-sans font-semibold rounded-full select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]";

  const sizeClasses = {
    sm: "px-3.5 py-1.5 text-xs gap-1.5",
    md: "px-5 py-2.5 text-xs sm:text-sm gap-2",
    lg: "px-7 py-3.5 text-sm sm:text-base gap-2.5",
  }[size];

  const variantClasses = {
    obsidian:
      "bg-black text-white hover:bg-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)] hover:-translate-y-0.5",
    slate:
      "bg-[#7895B2] text-white hover:bg-[#5D7C9C] shadow-[0_2px_8px_rgba(120,149,178,0.3)] hover:shadow-[0_6px_18px_rgba(120,149,178,0.45)] hover:-translate-y-0.5",
    sand:
      "bg-[#E8DFCA] text-black border border-[#D6CCB5] hover:bg-[#F4EDE1] hover:border-[#C4B9A0] hover:-translate-y-0.5",
    "mist-outline":
      "bg-transparent text-black border border-[#AEBDCA] hover:bg-[#AEBDCA]/20 hover:border-[#7895B2] hover:-translate-y-0.5",
  }[variant];

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}
