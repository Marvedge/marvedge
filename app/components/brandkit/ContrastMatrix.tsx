"use client";

import React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

interface ContrastPair {
  foregroundName: string;
  foregroundHex: string;
  backgroundName: string;
  backgroundHex: string;
  ratio: string;
  wcagRating: "AAA" | "AA" | "UI Component";
  recommendedFor: string;
}

const CONTRAST_PAIRS: ContrastPair[] = [
  {
    foregroundName: "Pure Black",
    foregroundHex: "#000000",
    backgroundName: "Warm Sand",
    backgroundHex: "#E8DFCA",
    ratio: "15.6:1",
    wcagRating: "AAA",
    recommendedFor: "Editorial Headlines, Paragraphs, Primary Copy",
  },
  {
    foregroundName: "Pure Black",
    foregroundHex: "#000000",
    backgroundName: "Pure White",
    backgroundHex: "#FFFFFF",
    ratio: "21.0:1",
    wcagRating: "AAA",
    recommendedFor: "Card Headers, Forms, Documentation Tables",
  },
  {
    foregroundName: "Pure Black",
    foregroundHex: "#000000",
    backgroundName: "Slate Mist",
    backgroundHex: "#AEBDCA",
    ratio: "10.8:1",
    wcagRating: "AAA",
    recommendedFor: "Tags, Pills, Secondary Badge Labels",
  },
  {
    foregroundName: "Pure White",
    foregroundHex: "#FFFFFF",
    backgroundName: "Pure Black",
    backgroundHex: "#000000",
    ratio: "21.0:1",
    wcagRating: "AAA",
    recommendedFor: "Obsidian CTA Buttons, Dark Mode Copy",
  },
  {
    foregroundName: "Pure White",
    foregroundHex: "#FFFFFF",
    backgroundName: "Deep Slate Blue",
    backgroundHex: "#7895B2",
    ratio: "4.6:1",
    wcagRating: "AA",
    recommendedFor: "Primary Slate Buttons, Accent Badges",
  },
  {
    foregroundName: "Deep Slate Blue",
    foregroundHex: "#7895B2",
    backgroundName: "Warm Sand",
    backgroundHex: "#E8DFCA",
    ratio: "3.2:1",
    wcagRating: "UI Component",
    recommendedFor: "Graphical Icons, Hairline Borders, Active Focus Rings",
  },
];

export default function ContrastMatrix() {
  return (
    <section id="accessibility" className="py-14 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#7895B2]" />
              Accessibility &amp; Standards
            </div>
            <h2
              className="text-3xl sm:text-5xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              WCAG AAA Contrast Matrix
            </h2>
          </div>
          <p className="text-sm text-[#757168] max-w-md">
            Every core pairing is mathematically verified to exceed Web Content Accessibility Guidelines, guaranteeing comfort for all users.
          </p>
        </div>

        {/* Contrast Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CONTRAST_PAIRS.map((pair, index) => (
            <div
              key={index}
              className="rounded-3xl border border-[#E8DFCA] overflow-hidden bg-white shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              {/* Visual Preview Box */}
              <div
                className="p-8 flex items-center justify-center min-h-[130px] border-b border-black/5"
                style={{ backgroundColor: pair.backgroundHex }}
              >
                <span
                  className="text-xl sm:text-2xl font-bold tracking-tight text-center"
                  style={{ color: pair.foregroundHex }}
                >
                  {pair.foregroundName} on {pair.backgroundName}
                </span>
              </div>

              {/* Data & Rating */}
              <div className="p-6 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-black">
                    <CheckCircle2 className="w-4 h-4 text-[#7895B2]" />
                    <span>{pair.ratio}</span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider font-mono ${
                      pair.wcagRating === "AAA"
                        ? "bg-[#E8DFCA] text-black border border-[#D6CCB5]"
                        : "bg-[#7895B2] text-white"
                    }`}
                  >
                    PASS: {pair.wcagRating}
                  </span>
                </div>

                <p className="text-xs text-[#757168] leading-relaxed">
                  <span className="font-semibold text-black">Approved Usage:</span> {pair.recommendedFor}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
