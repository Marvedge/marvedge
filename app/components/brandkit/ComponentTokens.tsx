"use client";

import React, { useState } from "react";
import { ArrowRight, Sparkles, Check, Bell, Shield, Sliders } from "lucide-react";

export default function ComponentTokens() {
  const [inputValue, setInputValue] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);

  return (
    <section id="components" className="py-14 sm:py-20 bg-white border-y border-[#E8DFCA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <Sliders className="w-3.5 h-3.5 text-[#7895B2]" />
              UI Component Tokens
            </div>
            <h2
              className="text-3xl sm:text-5xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Buttons, Badges &amp; Controls
            </h2>
          </div>
          <p className="text-sm text-[#757168] max-w-md">
            Every UI element is composed exclusively from the 4 brand colors and 2 fonts, guaranteeing unified design consistency across all screens.
          </p>
        </div>

        {/* 1. Button Variants Grid */}
        <div className="mb-14">
          <h3 className="text-xl font-bold text-black mb-6">Interactive Button Tokens</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Button 1: Pure Black Obsidian */}
            <div className="p-6 rounded-3xl bg-[#E8DFCA]/30 border border-[#E8DFCA] flex flex-col justify-between h-48">
              <div>
                <span className="text-[11px] font-mono text-[#757168] uppercase font-semibold">
                  Primary Obsidian
                </span>
                <p className="text-xs text-[#757168] mt-1 mb-4">
                  For high-impact main conversion actions.
                </p>
              </div>
              <button className="btn-pure-black w-full py-3 px-5 rounded-full text-xs font-semibold flex items-center justify-center gap-2">
                <span>Start Free Trial</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Button 2: Deep Slate Blue */}
            <div className="p-6 rounded-3xl bg-[#E8DFCA]/30 border border-[#E8DFCA] flex flex-col justify-between h-48">
              <div>
                <span className="text-[11px] font-mono text-[#757168] uppercase font-semibold">
                  Primary Slate Blue
                </span>
                <p className="text-xs text-[#757168] mt-1 mb-4">
                  For studio tools and active feature interactions.
                </p>
              </div>
              <button className="btn-slate-blue w-full py-3 px-5 rounded-full text-xs font-semibold flex items-center justify-center gap-2">
                <span>Launch Studio</span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Button 3: Warm Sand */}
            <div className="p-6 rounded-3xl bg-[#E8DFCA]/30 border border-[#E8DFCA] flex flex-col justify-between h-48">
              <div>
                <span className="text-[11px] font-mono text-[#757168] uppercase font-semibold">
                  Secondary Warm Sand
                </span>
                <p className="text-xs text-[#757168] mt-1 mb-4">
                  For secondary browsing and documentation.
                </p>
              </div>
              <button className="btn-warm-sand w-full py-3 px-5 rounded-full text-xs font-semibold flex items-center justify-center gap-2">
                <span>Documentation</span>
              </button>
            </div>

            {/* Button 4: Slate Mist Hairline */}
            <div className="p-6 rounded-3xl bg-[#E8DFCA]/30 border border-[#E8DFCA] flex flex-col justify-between h-48">
              <div>
                <span className="text-[11px] font-mono text-[#757168] uppercase font-semibold">
                  Hairline Mist Outline
                </span>
                <p className="text-xs text-[#757168] mt-1 mb-4">
                  For ghost actions and filter toggles.
                </p>
              </div>
              <button className="btn-outline-mist w-full py-3 px-5 rounded-full text-xs font-semibold flex items-center justify-center gap-2">
                <span>View Changelog</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Badges, Pills & Status Indicators */}
        <div className="mb-14">
          <h3 className="text-xl font-bold text-black mb-6">Status Badges &amp; Telemetry Chips</h3>
          <div className="flex flex-wrap items-center gap-4 p-6 sm:p-8 rounded-3xl bg-[#E8DFCA]/30 border border-[#E8DFCA]">
            {/* Live Indicator */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E8DFCA] text-xs font-semibold text-black shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#7895B2] animate-pulse" />
              <span>v2.0 • Local AI Engine</span>
            </div>

            {/* Obsidian Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black text-white text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-[#AEBDCA]" />
              <span>Enterprise Ready</span>
            </div>

            {/* Sand Chip */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E8DFCA] border border-[#D6CCB5] text-xs font-bold text-black">
              <span>94.2% Completion Rate</span>
            </div>

            {/* Slate Mist Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#AEBDCA]/30 border border-[#AEBDCA] text-xs font-semibold text-black">
              <span>0 ms Local Latency</span>
            </div>

            {/* Notification Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#7895B2] text-xs font-semibold text-[#7895B2]">
              <Bell className="w-3.5 h-3.5" />
              <span>Auto-Reframe Active</span>
            </div>
          </div>
        </div>

        {/* 3. Inputs & Forms Specimen */}
        <div>
          <h3 className="text-xl font-bold text-black mb-6">Form Control Tokens</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Form Demonstration */}
            <div className="p-8 rounded-3xl bg-white border border-[#E8DFCA] shadow-sm">
              <h4 className="text-lg font-bold text-black mb-2">Interactive Input Sandbox</h4>
              <p className="text-xs text-[#757168] mb-6">
                Inputs pair a warm sand background or pure white surface with a slate mist hairline border that shifts to deep slate blue upon focus.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#757168] mb-2">
                    Work Email Address
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="founder@marvedge.com"
                      className="flex-1 px-4 py-3 rounded-2xl bg-[#E8DFCA]/30 border border-[#AEBDCA] text-sm text-black placeholder-[#757168] focus:outline-hidden focus:border-[#7895B2] focus:ring-2 focus:ring-[#7895B2]/20 transition-all"
                    />
                    <button
                      onClick={() => setIsSubscribed(true)}
                      className="btn-pure-black px-5 py-3 rounded-2xl text-xs font-semibold whitespace-nowrap"
                    >
                      {isSubscribed ? <Check className="w-4 h-4 text-[#7895B2]" /> : "Subscribe"}
                    </button>
                  </div>
                </div>

                {isSubscribed && (
                  <div className="p-3 rounded-xl bg-[#E8DFCA] border border-[#D6CCB5] text-xs text-black flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#7895B2]" />
                    <span>Verified! Form input micro-interaction triggered successfully.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Editorial Quote Card Showcase */}
            <div className="p-8 rounded-3xl bg-[#E8DFCA] border border-[#D6CCB5] shadow-xs flex flex-col justify-between">
              <div
                className="text-2xl sm:text-3xl text-black leading-snug mb-6"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                &ldquo;Simplicity is the ultimate sophistication. Restricting our palette to four deliberate colors creates unmatched brand recognition.&rdquo;
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-[#D6CCB5]">
                <div className="w-9 h-9 rounded-full bg-[#7895B2] flex items-center justify-center text-white text-sm font-bold font-serif italic">
                  M
                </div>
                <div>
                  <div className="text-xs font-bold text-black">Marvedge Design Principles</div>
                  <div className="text-[11px] text-[#757168] font-mono">Meetily Editorial Sensibility</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
