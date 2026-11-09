"use client";

import React, { useState } from "react";
import { Copy, Check, Info } from "lucide-react";

export interface ColorData {
  id: string;
  name: string;
  role: string;
  hex: string;
  rgb: string;
  textColor: string;
  borderSample: string;
  usage: string;
  donts: string;
  tints: { opacity: string; label: string }[];
}

export const BRAND_COLORS: ColorData[] = [
  {
    id: "warm-sand",
    name: "Warm Sand",
    role: "Elevated Panels & Card Surfaces",
    hex: "#E8DFCA",
    rgb: "rgb(232, 223, 202)",
    textColor: "#000000",
    borderSample: "#D6CCB5",
    usage: "Default page background canvas, tactile paper containers, card backdrops, and editorial borders.",
    donts: "Do not place low-contrast grey text over Warm Sand; use Pure Black for crisp readability.",
    tints: [
      { opacity: "100%", label: "#E8DFCA" },
      { opacity: "80%", label: "rgba(232, 223, 202, 0.8)" },
      { opacity: "60%", label: "rgba(232, 223, 202, 0.6)" },
      { opacity: "40%", label: "rgba(232, 223, 202, 0.4)" },
      { opacity: "20%", label: "rgba(232, 223, 202, 0.2)" },
    ],
  },
  {
    id: "slate-mist",
    name: "Slate Mist",
    role: "Soft Accent, Hairlines & Glows",
    hex: "#AEBDCA",
    rgb: "rgb(174, 189, 202)",
    textColor: "#000000",
    borderSample: "#7895B2",
    usage: "Subtle borders, card hairlines, secondary badge backgrounds, soft button outlines, and delicate glows.",
    donts: "Avoid using for long paragraphs of body text on light backgrounds.",
    tints: [
      { opacity: "100%", label: "#AEBDCA" },
      { opacity: "80%", label: "rgba(174, 189, 202, 0.8)" },
      { opacity: "60%", label: "rgba(174, 189, 202, 0.6)" },
      { opacity: "40%", label: "rgba(174, 189, 202, 0.4)" },
      { opacity: "20%", label: "rgba(174, 189, 202, 0.2)" },
    ],
  },
  {
    id: "deep-slate-blue",
    name: "Deep Slate Blue",
    role: "Primary Brand Accent & Key CTAs",
    hex: "#7895B2",
    rgb: "rgb(120, 149, 178)",
    textColor: "#FFFFFF",
    borderSample: "#4A6B8D",
    usage: "Primary interactive buttons, key highlights, active tab states, brand icons, and hyperlinks.",
    donts: "Never pair with low-contrast dark greys; always use Pure White (#FFFFFF) text on top.",
    tints: [
      { opacity: "100%", label: "#7895B2" },
      { opacity: "80%", label: "rgba(120, 149, 178, 0.8)" },
      { opacity: "60%", label: "rgba(120, 149, 178, 0.6)" },
      { opacity: "40%", label: "rgba(120, 149, 178, 0.4)" },
      { opacity: "20%", label: "rgba(120, 149, 178, 0.2)" },
    ],
  },
  {
    id: "pure-black",
    name: "Pure Black",
    role: "Obsidian Ink, High-Contrast CTAs & Structure",
    hex: "#000000",
    rgb: "rgb(0, 0, 0)",
    textColor: "#FFFFFF",
    borderSample: "#262626",
    usage: "Primary typography, high-impact obsidian buttons, structural borders, dark mode backgrounds, and brand wordmark.",
    donts: "Do not dilute with muddy grey when high-contrast editorial punch is desired.",
    tints: [
      { opacity: "100%", label: "#000000" },
      { opacity: "80%", label: "rgba(0, 0, 0, 0.8)" },
      { opacity: "60%", label: "rgba(0, 0, 0, 0.6)" },
      { opacity: "40%", label: "rgba(0, 0, 0, 0.4)" },
      { opacity: "20%", label: "rgba(0, 0, 0, 0.2)" },
    ],
  },
];

export default function ColorSwatches() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<ColorData | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => {
      setCopiedCode(null);
    }, 1800);
  };

  return (
    <section id="palette" className="py-14 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <span className="w-2 h-2 rounded-full bg-[#7895B2]" />
              Core Palette
            </div>
            <h2
              className="text-3xl sm:text-4xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              The 4 Core Brand Colors
            </h2>
          </div>
          <p className="text-sm text-[#4A4740] max-w-md">
            Click any swatch or hex code to copy to clipboard. Designed for an editorial, tactile aesthetic with WCAG AAA accessibility.
          </p>
        </div>

        {/* 4 Swatch Cards (Exact replication of screenshot layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BRAND_COLORS.map((color) => {
            const isHexCopied = copiedCode === color.hex;
            const isRgbCopied = copiedCode === color.rgb;
            const isCardCopied = isHexCopied || isRgbCopied;

            return (
              <div
                key={color.id}
                onClick={() => copyToClipboard(color.hex)}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06),0_2px_6px_-1px_rgba(0,0,0,0.02)] border border-[#E8DFCA] flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.1)] group relative select-none"
              >
                <div>
                  {/* Top: Circle Swatch + Pill */}
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className="w-16 h-16 rounded-full shadow-inner border transition-transform duration-200 group-hover:scale-105"
                      style={{
                        backgroundColor: color.hex,
                        borderColor: color.borderSample,
                      }}
                    />
                    <div
                      className="px-3 py-1 rounded-md text-[11px] font-semibold tracking-wider uppercase transition-colors"
                      style={{
                        backgroundColor: isCardCopied ? "#000000" : "#E8DFCA",
                        color: isCardCopied ? "#FFFFFF" : "#4A4740",
                      }}
                    >
                      {isCardCopied ? "COPIED!" : "CLICK TO COPY"}
                    </div>
                  </div>

                  {/* Title & Role */}
                  <h3 className="text-xl font-bold text-black mb-1 group-hover:text-[#7895B2] transition-colors">
                    {color.name}
                  </h3>
                  <p className="text-sm text-[#757168] mb-6 leading-snug">
                    {color.role}
                  </p>
                </div>

                {/* Bottom: Hairline Divider + Hex / RGB */}
                <div>
                  <div className="w-full h-px bg-[#E8DFCA] mb-4" />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-base text-black flex items-center gap-1.5 font-mono">
                        <span>{color.hex}</span>
                        {isHexCopied ? (
                          <Check className="w-4 h-4 text-[#7895B2]" />
                        ) : (
                          <Copy className="w-4 h-4 text-[#AEBDCA] group-hover:text-black transition-colors" />
                        )}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(color.rgb);
                        }}
                        className="text-xs text-[#757168] font-mono hover:text-black mt-0.5"
                      >
                        {color.rgb}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedColor(selectedColor?.id === color.id ? null : color);
                      }}
                      className="p-1.5 rounded-full hover:bg-[#E8DFCA] text-[#757168] hover:text-black transition-colors"
                      title="Inspect Tints & Guidelines"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expandable Color Inspector Drawer / Modal */}
        {selectedColor && (
          <div className="mt-8 bg-white rounded-3xl p-6 sm:p-8 border border-[#E8DFCA] shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#E8DFCA] mb-6">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full border"
                  style={{ backgroundColor: selectedColor.hex, borderColor: selectedColor.borderSample }}
                />
                <div>
                  <h4 className="text-lg font-bold text-black">{selectedColor.name} Guidelines</h4>
                  <p className="text-xs font-mono text-[#757168]">{selectedColor.hex} • {selectedColor.rgb}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedColor(null)}
                className="text-sm font-semibold text-[#757168] hover:text-black px-3 py-1 rounded-full hover:bg-[#E8DFCA]"
              >
                Close ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Recommended Usage */}
              <div className="p-4 rounded-2xl bg-[#E8DFCA]/30 border border-[#E8DFCA]">
                <div className="text-xs font-bold uppercase tracking-wider text-[#7895B2] mb-1">
                  Recommended Usage
                </div>
                <p className="text-sm text-black leading-relaxed">{selectedColor.usage}</p>
              </div>

              {/* Do Not's */}
              <div className="p-4 rounded-2xl bg-[#E8DFCA]/30 border border-[#E8DFCA]">
                <div className="text-xs font-bold uppercase tracking-wider text-black mb-1">
                  Design Warning
                </div>
                <p className="text-sm text-black leading-relaxed">{selectedColor.donts}</p>
              </div>

              {/* Opacity Spectrum */}
              <div className="p-4 rounded-2xl bg-[#E8DFCA]/30 border border-[#E8DFCA]">
                <div className="text-xs font-bold uppercase tracking-wider text-[#757168] mb-2">
                  Tints &amp; Opacity Spectrum
                </div>
                <div className="flex items-center gap-2">
                  {selectedColor.tints.map((tint, i) => (
                    <div
                      key={i}
                      onClick={() => copyToClipboard(tint.label)}
                      className="flex-1 text-center cursor-pointer group"
                      title={`Click to copy: ${tint.label}`}
                    >
                      <div
                        className="h-9 rounded-lg border border-black/10 group-hover:scale-105 transition-transform shadow-xs"
                        style={{ backgroundColor: selectedColor.hex, opacity: parseInt(tint.opacity) / 100 }}
                      />
                      <span className="text-[10px] font-mono text-[#757168] mt-1 block">
                        {tint.opacity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
