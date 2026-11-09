"use client";

import React, { useState } from "react";
import { Copy, Check, Download, Layers } from "lucide-react";

export default function LogoShowcase() {
  const [copiedSvg, setCopiedSvg] = useState<string | null>(null);

  const logoSvgCode = `<svg width="140" height="36" viewBox="0 0 140 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="10" fill="#7895B2"/>
  <text x="18" y="25" text-anchor="middle" font-family="'Instrument Serif', serif" font-style="italic" font-weight="bold" font-size="22" fill="#FFFFFF">M</text>
  <text x="48" y="24" font-family="'Inter', sans-serif" font-weight="800" font-size="19" letter-spacing="-0.03em" fill="#000000">marvedge</text>
</svg>`;

  const copySvg = (variant: string) => {
    navigator.clipboard.writeText(logoSvgCode);
    setCopiedSvg(variant);
    setTimeout(() => setCopiedSvg(null), 1500);
  };

  return (
    <section id="logos" className="py-14 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <Layers className="w-3.5 h-3.5 text-[#7895B2]" />
              Logo &amp; Brand Marks
            </div>
            <h2
              className="text-3xl sm:text-5xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Logo Assets &amp; Guidelines
            </h2>
          </div>
          <p className="text-sm text-[#757168] max-w-md">
            The Marvedge mark unites the classical grace of an italic serif &apos;M&apos; with modern technological geometric balance.
          </p>
        </div>

        {/* 4 Background Variations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* 1. On Warm Sand */}
          <div className="rounded-3xl p-8 bg-[#E8DFCA] border border-[#D6CCB5] flex flex-col justify-between min-h-[220px] shadow-xs">
            <span className="text-[11px] font-mono font-semibold tracking-wider uppercase text-[#757168]">
              On Warm Sand (#E8DFCA)
            </span>
            <div className="my-8 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#7895B2] flex items-center justify-center text-white shadow-sm">
                <span className="text-2xl font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-black">marvedge</span>
            </div>
            <div className="text-xs text-[#757168] font-mono">Primary Default Context</div>
          </div>

          {/* 2. On Pure Black */}
          <div className="rounded-3xl p-8 bg-black border border-black flex flex-col justify-between min-h-[220px] shadow-md">
            <span className="text-[11px] font-mono font-semibold tracking-wider uppercase text-neutral-400">
              On Pure Black (#000000)
            </span>
            <div className="my-8 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#7895B2] flex items-center justify-center text-white shadow-sm">
                <span className="text-2xl font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-white">marvedge</span>
            </div>
            <div className="text-xs text-neutral-400 font-mono">Obsidian Dark Mode</div>
          </div>

          {/* 3. On Deep Slate Blue */}
          <div className="rounded-3xl p-8 bg-[#7895B2] border border-[#5D7C9C] flex flex-col justify-between min-h-[220px] shadow-sm">
            <span className="text-[11px] font-mono font-semibold tracking-wider uppercase text-slate-200">
              On Slate Blue (#7895B2)
            </span>
            <div className="my-8 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center text-white shadow-sm">
                <span className="text-2xl font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-white">marvedge</span>
            </div>
            <div className="text-xs text-slate-200 font-mono">Accent Container</div>
          </div>

          {/* 4. On Pure White */}
          <div className="rounded-3xl p-8 bg-white border border-[#E8DFCA] flex flex-col justify-between min-h-[220px] shadow-xs">
            <span className="text-[11px] font-mono font-semibold tracking-wider uppercase text-[#757168]">
              On Pure White (#FFFFFF)
            </span>
            <div className="my-8 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center text-white shadow-sm">
                <span className="text-2xl font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-black">marvedge</span>
            </div>
            <div className="text-xs text-[#757168] font-mono">High-Key Document</div>
          </div>
        </div>

        {/* Clear Space & Sizing Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Clear Space Box */}
          <div className="bg-white rounded-3xl p-8 border border-[#E8DFCA]">
            <h4 className="text-lg font-bold text-black mb-3">Clear Space Isolation</h4>
            <p className="text-sm text-[#757168] mb-6 leading-relaxed">
              Maintain an exclusion zone around the wordmark equal to the full height of the &apos;M&apos; icon. No other text, graphics, or borders may intrude into this zone.
            </p>
            <div className="p-8 rounded-2xl bg-[#E8DFCA]/30 border-2 border-dashed border-[#AEBDCA] flex items-center justify-center">
              <div className="relative inline-flex items-center gap-3 p-4 bg-white rounded-xl shadow-xs border border-[#E8DFCA]">
                <div className="w-10 h-10 rounded-xl bg-[#7895B2] flex items-center justify-center text-white">
                  <span className="text-xl font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
                </div>
                <span className="text-xl font-extrabold tracking-tight text-black">marvedge</span>
                <span className="absolute -top-3 -right-3 text-[10px] font-mono bg-black text-white px-1.5 py-0.5 rounded">
                  1X Space
                </span>
              </div>
            </div>
          </div>

          {/* Quick Copy / Download Box */}
          <div className="bg-white rounded-3xl p-8 border border-[#E8DFCA] flex flex-col justify-between">
            <div>
              <h4 className="text-lg font-bold text-black mb-3">Vector Asset Ready</h4>
              <p className="text-sm text-[#757168] mb-6 leading-relaxed">
                The Marvedge mark is completely defined with clean SVG geometry and CSS vector tokens for zero-pixelation rendering at any size.
              </p>
              <div className="p-4 rounded-2xl bg-[#E8DFCA]/40 font-mono text-xs text-[#4A4740] overflow-x-auto border border-[#E8DFCA] mb-6">
                <code>{logoSvgCode}</code>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => copySvg("default")}
                className="btn-pure-black px-6 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2"
              >
                {copiedSvg ? <Check className="w-4 h-4 text-[#7895B2]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSvg ? "SVG Copied to Clipboard!" : "Copy Logo SVG"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
