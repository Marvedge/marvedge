"use client";

import React from "react";

export interface BrandLogoProps {
  variant?: "full" | "monogram";
  theme?: "on-sand" | "on-black" | "on-slate" | "on-white";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function BrandLogo({
  variant = "full",
  theme = "on-sand",
  size = "md",
  className = "",
}: BrandLogoProps) {
  const iconDimensions = {
    sm: { box: 28, text: 18, radius: 8 },
    md: { box: 36, text: 22, radius: 10 },
    lg: { box: 48, text: 30, radius: 14 },
  }[size];

  const wordmarkSizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-3xl",
  }[size];

  const themeConfig = {
    "on-sand": {
      boxBg: "#7895B2",
      letterColor: "#FFFFFF",
      textColor: "text-black",
    },
    "on-black": {
      boxBg: "#7895B2",
      letterColor: "#FFFFFF",
      textColor: "text-white",
    },
    "on-slate": {
      boxBg: "#000000",
      letterColor: "#FFFFFF",
      textColor: "text-white",
    },
    "on-white": {
      boxBg: "#000000",
      letterColor: "#FFFFFF",
      textColor: "text-black",
    },
  }[theme];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Monogram Box */}
      <svg
        width={iconDimensions.box}
        height={iconDimensions.box}
        viewBox={`0 0 ${iconDimensions.box} ${iconDimensions.box}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect
          width={iconDimensions.box}
          height={iconDimensions.box}
          rx={iconDimensions.radius}
          fill={themeConfig.boxBg}
        />
        <text
          x={iconDimensions.box / 2}
          y={iconDimensions.box * 0.7}
          textAnchor="middle"
          fontFamily="'Instrument Serif', Georgia, serif"
          fontStyle="italic"
          fontWeight="bold"
          fontSize={iconDimensions.text}
          fill={themeConfig.letterColor}
        >
          M
        </text>
      </svg>

      {/* Wordmark */}
      {variant === "full" && (
        <span
          className={`font-sans font-extrabold tracking-tight ${themeConfig.textColor} ${wordmarkSizes}`}
        >
          marvedge
        </span>
      )}
    </div>
  );
}
