"use client";

import React, { useState } from "react";
import { Type, Sparkles, Sliders, Check, Copy } from "lucide-react";

export default function TypographyShowcase() {
  const [testText, setTestText] = useState("Marvedge transforms standard product screens into viral interactive demos.");
  const [selectedFont, setSelectedFont] = useState<"serif" | "sans">("serif");
  const [fontSize, setFontSize] = useState<number>(36);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [copiedFont, setCopiedFont] = useState<string | null>(null);

  const copyFontRule = (rule: string) => {
    navigator.clipboard.writeText(rule);
    setCopiedFont(rule);
    setTimeout(() => setCopiedFont(null), 1500);
  };

  return (
    <section id="typography" className="py-14 sm:py-20 bg-white border-y border-[#E8DFCA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <Type className="w-3.5 h-3.5 text-[#7895B2]" />
              Typography System
            </div>
            <h2
              className="text-3xl sm:text-5xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Strictly Two Harmonious Typefaces
            </h2>
          </div>
          <p className="text-sm text-[#757168] max-w-md">
            Paired for editorial contrast: <span className="font-semibold text-black">Instrument Serif</span> for grand literary headlines and <span className="font-semibold text-black">Inter</span> for razor-sharp interface clarity.
          </p>
        </div>

        {/* The 2 Fonts Side-by-Side Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Font 1: Instrument Serif */}
          <div className="rounded-3xl p-8 bg-[#E8DFCA]/25 border border-[#E8DFCA] flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono font-bold tracking-wider uppercase px-3 py-1 rounded-md bg-black text-white">
                  Display &amp; Editorial
                </span>
                <button
                  onClick={() => copyFontRule("font-family: 'Instrument Serif', Georgia, serif;")}
                  className="text-xs font-mono text-[#757168] hover:text-black flex items-center gap-1"
                >
                  {copiedFont?.includes("Instrument") ? (
                    <>
                      <Check className="w-3 h-3 text-[#7895B2]" />
                      Copied CSS
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy CSS
                    </>
                  )}
                </button>
              </div>

              <h3
                className="text-4xl sm:text-5xl text-black mb-2 font-normal"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                Instrument Serif
              </h3>
              <p className="text-sm text-[#757168] mb-6">
                Designed by Rodrigo Fuenzalida &amp; Jordan Bell. An open-source transitional serif inspired by mid-century book publishing.
              </p>

              {/* Character set preview */}
              <div
                className="text-2xl text-black p-5 rounded-2xl bg-white border border-[#E8DFCA] tracking-wide leading-relaxed mb-4"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                <div className="mb-2">Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz</div>
                <div className="italic text-[#7895B2]">0 1 2 3 4 5 6 7 8 9 &amp; @ $ # ! ? % *</div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E8DFCA] flex items-center justify-between text-xs text-[#757168]">
              <span>Styles: Regular 400, Italic 400i</span>
              <span>Usage: Hero Titles, Section Headlines, Pull Quotes</span>
            </div>
          </div>

          {/* Font 2: Inter */}
          <div className="rounded-3xl p-8 bg-[#E8DFCA]/25 border border-[#E8DFCA] flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono font-bold tracking-wider uppercase px-3 py-1 rounded-md bg-[#7895B2] text-white">
                  Interface &amp; Body
                </span>
                <button
                  onClick={() => copyFontRule("font-family: 'Inter', -apple-system, sans-serif;")}
                  className="text-xs font-mono text-[#757168] hover:text-black flex items-center gap-1"
                >
                  {copiedFont?.includes("Inter") ? (
                    <>
                      <Check className="w-3 h-3 text-[#7895B2]" />
                      Copied CSS
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy CSS
                    </>
                  )}
                </button>
              </div>

              <h3 className="text-4xl sm:text-5xl text-black mb-2 font-bold tracking-tight">
                Inter
              </h3>
              <p className="text-sm text-[#757168] mb-6">
                Designed by Rasmus Andersson. Crafted specifically for computer screens with tall x-height and optical legibility at tiny sizes.
              </p>

              {/* Character set preview */}
              <div className="text-base text-black p-5 rounded-2xl bg-white border border-[#E8DFCA] tracking-normal leading-relaxed mb-4">
                <div className="font-semibold mb-2">Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz</div>
                <div className="text-[#757168] font-mono">0 1 2 3 4 5 6 7 8 9 • [ ] {'{ }'} &lt; / &gt; + = - _</div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E8DFCA] flex items-center justify-between text-xs text-[#757168]">
              <span>Weights: Regular 400, Medium 500, SemiBold 600, Bold 700</span>
              <span>Usage: UI, Body Text, Buttons, Form Inputs, Badges</span>
            </div>
          </div>
        </div>

        {/* Interactive Type Tester Playground */}
        <div className="rounded-3xl p-6 sm:p-8 bg-[#E8DFCA]/40 border border-[#E8DFCA]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-[#D6CCB5] gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#7895B2]" />
              <h4 className="text-lg font-bold text-black">Interactive Type Tester</h4>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Font Toggle */}
              <div className="inline-flex rounded-xl bg-white p-1 border border-[#D6CCB5]">
                <button
                  onClick={() => setSelectedFont("serif")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedFont === "serif"
                      ? "bg-black text-white shadow-xs"
                      : "text-[#757168] hover:text-black"
                  }`}
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  Instrument Serif
                </button>
                <button
                  onClick={() => setSelectedFont("sans")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedFont === "sans"
                      ? "bg-black text-white shadow-xs"
                      : "text-[#757168] hover:text-black"
                  }`}
                >
                  Inter
                </button>
              </div>

              {/* Italic toggle */}
              <button
                onClick={() => setIsItalic(!isItalic)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  isItalic
                    ? "bg-[#7895B2] text-white border-[#7895B2]"
                    : "bg-white text-black border-[#D6CCB5] hover:bg-[#E8DFCA]"
                }`}
              >
                Italic
              </button>

              {/* Size Slider */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#D6CCB5]">
                <span className="text-xs text-[#757168] font-mono">{fontSize}px</span>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-24 accent-[#7895B2]"
                />
              </div>
            </div>
          </div>

          {/* Test Input */}
          <div className="mb-6">
            <input
              type="text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Type anything here to test..."
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#D6CCB5] text-sm text-black placeholder-[#757168] focus:outline-hidden focus:border-[#7895B2]"
            />
          </div>

          {/* Render Area */}
          <div className="p-6 sm:p-10 rounded-2xl bg-white border border-[#E8DFCA] min-h-[160px] flex items-center justify-center text-center overflow-hidden">
            <p
              className={`text-black leading-tight transition-all ${isItalic ? "italic" : ""}`}
              style={{
                fontFamily: selectedFont === "serif" ? 'var(--font-serif)' : 'var(--font-sans)',
                fontSize: `${fontSize}px`,
              }}
            >
              {testText || "Type your sentence above..."}
            </p>
          </div>
        </div>

        {/* Type Scale Hierarchy Table */}
        <div className="mt-12">
          <h4
            className="text-2xl text-black font-normal mb-6"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Design System Type Scale
          </h4>

          <div className="bg-white rounded-3xl border border-[#E8DFCA] divide-y divide-[#E8DFCA] overflow-hidden">
            {[
              { level: "Display Hero", font: "Instrument Serif", size: "56px / 3.5rem", sample: "Studio Engine for Viral Interactive Demos", serif: true },
              { level: "Heading 1", font: "Instrument Serif", size: "40px / 2.5rem", sample: "Tactile Paper Sensibility Meets High Contrast", serif: true },
              { level: "Heading 2", font: "Inter Bold", size: "28px / 1.75rem", sample: "Instant 1-Click Multi-Speaker Auto Reframe", serif: false, weight: "font-bold" },
              { level: "Heading 3", font: "Inter SemiBold", size: "20px / 1.25rem", sample: "Zero Latency Local Inference On-Device", serif: false, weight: "font-semibold" },
              { level: "Body Large", font: "Inter Regular", size: "18px / 1.125rem", sample: "Crafted for effortless readability across high-DPI displays.", serif: false },
              { level: "Body Standard", font: "Inter Regular", size: "15px / 0.9375rem", sample: "Every interactive hotspot tracks completion rates and user drop-off telemetry.", serif: false },
              { level: "Caption / Spec", font: "Inter Medium (Caps)", size: "12px / 0.75rem", sample: "STATUS: COMPLIANT • 21:1 CONTRAST RATIO • WCAG AAA", serif: false, weight: "font-medium uppercase tracking-wider text-[#757168]" },
            ].map((item, idx) => (
              <div key={idx} className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#E8DFCA]/15 transition-colors">
                <div className="md:w-1/4">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#7895B2]">{item.level}</div>
                  <div className="text-xs text-[#757168] font-mono mt-0.5">{item.font} • {item.size}</div>
                </div>
                <div
                  className={`md:w-3/4 text-black text-left ${item.weight || ""}`}
                  style={{
                    fontFamily: item.serif ? 'var(--font-serif)' : 'var(--font-sans)',
                  }}
                >
                  <span className={item.serif ? "text-2xl sm:text-3xl" : "text-base"}>
                    {item.sample}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
