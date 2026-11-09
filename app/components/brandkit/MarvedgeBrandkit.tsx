"use client";

import React, { useState } from "react";
import "./brandkit.css";
import ColorSwatches from "./ColorSwatches";
import TypographyShowcase from "./TypographyShowcase";
import LogoShowcase from "./LogoShowcase";
import ComponentTokens from "./ComponentTokens";
import ContrastMatrix from "./ContrastMatrix";
import CodeTokensExport from "./CodeTokensExport";
import { ArrowUpRight, Palette, Type, Layers, Sliders, ShieldCheck, Code, Check, Sparkles } from "lucide-react";

export default function MarvedgeBrandkit() {
  const [copiedQuick, setCopiedQuick] = useState<string | null>(null);

  const handleQuickCopy = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedQuick(hex);
    setTimeout(() => setCopiedQuick(null), 1500);
  };

  return (
    <div className="min-h-screen bg-[#E8DFCA] text-black flex flex-col selection:bg-[#7895B2] selection:text-white">
      {/* 1. Brandkit Sticky Header */}
      <header className="sticky top-0 z-50 px-4 sm:px-6 py-3 bg-[#E8DFCA]/90 backdrop-blur-md border-b border-[#D6CCB5]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Brand Mark */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#7895B2] flex items-center justify-center text-white shadow-xs">
              <span className="text-lg font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-black">marvedge</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-black text-white font-mono font-medium">
                Brandkit v2.0
              </span>
            </div>
          </div>

          {/* Quick Nav Anchor Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold tracking-wide uppercase text-[#4A4740]">
            <a href="#palette" className="hover:text-black transition-colors flex items-center gap-1">
              <Palette className="w-3.5 h-3.5 text-[#7895B2]" />
              Palette
            </a>
            <a href="#typography" className="hover:text-black transition-colors flex items-center gap-1">
              <Type className="w-3.5 h-3.5 text-[#7895B2]" />
              Typography
            </a>
            <a href="#logos" className="hover:text-black transition-colors flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#7895B2]" />
              Logos
            </a>
            <a href="#components" className="hover:text-black transition-colors flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-[#7895B2]" />
              Components
            </a>
            <a href="#accessibility" className="hover:text-black transition-colors flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#7895B2]" />
              Contrast
            </a>
            <a href="#tokens" className="hover:text-black transition-colors flex items-center gap-1">
              <Code className="w-3.5 h-3.5 text-[#7895B2]" />
              Tokens
            </a>
          </nav>

          {/* CTA Button */}
          <a
            href="#tokens"
            className="btn-pure-black px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5"
          >
            <span>Export Tokens</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="pt-16 pb-12 sm:pt-24 sm:pb-16 px-4 sm:px-6 lg:px-8 border-b border-[#D6CCB5]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold tracking-wider uppercase mb-6 bg-white text-black border border-[#D6CCB5] shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#7895B2]" />
            <span>Official Marvedge Identity System</span>
          </div>

          <h1
            className="text-5xl sm:text-7xl text-black mb-6 font-normal tracking-tight leading-[1.08]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            The Marvedge Brand Kit
          </h1>

          <p className="text-lg sm:text-xl text-[#4A4740] max-w-2xl mx-auto leading-relaxed mb-10">
            A cohesive design system built on <span className="font-semibold text-black">4 core colors</span> and <span className="font-semibold text-black">strictly 2 typefaces</span>. Synthesizing tactile paper warmth with high-contrast obsidian clarity.
          </p>

          {/* Mini Quick-Copy Bar */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 p-2 rounded-2xl bg-white border border-[#D6CCB5] shadow-sm">
            <span className="text-xs font-bold text-[#757168] px-3 uppercase tracking-wider">
              Quick Copy:
            </span>
            {[
              { name: "Warm Sand", hex: "#E8DFCA", border: "#D6CCB5" },
              { name: "Slate Mist", hex: "#AEBDCA", border: "#7895B2" },
              { name: "Deep Slate Blue", hex: "#7895B2", border: "#4A6B8D" },
              { name: "Pure Black", hex: "#000000", border: "#262626" },
            ].map((col) => (
              <button
                key={col.hex}
                onClick={() => handleQuickCopy(col.hex)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-[#E8DFCA]/40 transition-colors border border-transparent hover:border-[#D6CCB5]"
                title={`Click to copy ${col.name} (${col.hex})`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border shadow-xs"
                  style={{ backgroundColor: col.hex, borderColor: col.border }}
                />
                <span className="text-xs font-mono font-bold text-black">{col.hex}</span>
                {copiedQuick === col.hex && <Check className="w-3 h-3 text-[#7895B2]" />}
              </button>
            ))}
          </div>

          {/* Key Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 pt-8 border-t border-[#D6CCB5]">
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl font-normal text-black"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                4 Colors
              </div>
              <div className="text-xs text-[#757168] mt-1 uppercase font-semibold tracking-wider">
                Warm Sand • Mist • Slate • Black
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl font-normal text-black"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                2 Fonts
              </div>
              <div className="text-xs text-[#757168] mt-1 uppercase font-semibold tracking-wider">
                Instrument Serif + Inter
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl font-normal text-black"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                21:1 Ratio
              </div>
              <div className="text-xs text-[#757168] mt-1 uppercase font-semibold tracking-wider">
                WCAG AAA Accessible
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl font-normal text-black"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                100%
              </div>
              <div className="text-xs text-[#757168] mt-1 uppercase font-semibold tracking-wider">
                Vector &amp; Tokenized
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Core Palette Swatches (User Screenshot Exact Layout) */}
      <ColorSwatches />

      {/* 4. Typography System (Strictly 2 Fonts) */}
      <TypographyShowcase />

      {/* 5. Logo & Brand Marks */}
      <LogoShowcase />

      {/* 6. UI Component Tokens */}
      <ComponentTokens />

      {/* 7. WCAG AAA Contrast Matrix */}
      <ContrastMatrix />

      {/* 8. Code Tokens Export */}
      <CodeTokensExport />

      {/* 9. Brandkit Footer */}
      <footer className="py-12 bg-black text-white px-4 sm:px-6 lg:px-8 border-t border-neutral-900">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#7895B2] flex items-center justify-center text-white">
              <span className="text-lg font-normal italic" style={{ fontFamily: 'var(--font-serif)' }}>M</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">marvedge</span>
              <span className="text-xs text-neutral-400 block">Official Design System • 2026</span>
            </div>
          </div>

          <div className="text-xs text-neutral-400 text-center sm:text-right font-mono">
            Pure Black (#000000) • Deep Slate Blue (#7895B2) • Slate Mist (#AEBDCA) • Warm Sand (#E8DFCA)
          </div>
        </div>
      </footer>
    </div>
  );
}
