"use client";

import React from "react";

export interface BrandInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  surface?: "white" | "sand";
}

export const BrandInput = React.forwardRef<HTMLInputElement, BrandInputProps>(
  ({ label, error, helperText, surface = "white", className = "", ...props }, ref) => {
    const surfaceClass =
      surface === "white"
        ? "bg-white border-[#AEBDCA]"
        : "bg-[#E8DFCA]/40 border-[#AEBDCA]";

    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-sans font-bold uppercase tracking-wider text-[#757168] mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-3 rounded-2xl border text-sm text-black placeholder-[#757168] font-sans focus:outline-hidden focus:border-[#7895B2] focus:ring-2 focus:ring-[#7895B2]/20 transition-all duration-150 ${surfaceClass} ${
            error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""
          } ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-600 font-sans">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-[#757168] font-sans">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

BrandInput.displayName = "BrandInput";
