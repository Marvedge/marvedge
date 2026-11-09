"use client";

import React, { useState } from "react";
import { Code, Check, Copy, Download } from "lucide-react";

export default function CodeTokensExport() {
  const [activeTab, setActiveTab] = useState<"css" | "tailwind" | "json">("css");
  const [copied, setCopied] = useState(false);

  const cssTokens = `/* Marvedge Brandkit CSS Variables */
:root {
  /* 2 Core Typefaces */
  --font-serif: "Instrument Serif", Georgia, serif;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;

  /* 4 Core Colors */
  --color-pure-black: #000000;      /* rgb(0, 0, 0) */
  --color-warm-sand: #E8DFCA;       /* rgb(232, 223, 202) */
  --color-slate-mist: #AEBDCA;      /* rgb(174, 189, 202) */
  --color-deep-slate-blue: #7895B2; /* rgb(120, 149, 178) */

  /* Neutral Utility */
  --color-pure-white: #FFFFFF;      /* rgb(255, 255, 255) */
}`;

  const tailwindTokens = `// tailwind.config.ts / theme extend
export default {
  theme: {
    extend: {
      colors: {
        marvedge: {
          black: "#000000",
          sand: "#E8DFCA",
          mist: "#AEBDCA",
          slate: "#7895B2",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        serif: ["'Instrument Serif'", "Georgia", "serif"],
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
};`;

  const jsonTokens = `{
  "name": "Marvedge Official Brandkit",
  "version": "2.0.0",
  "typography": {
    "display": {
      "fontFamily": "Instrument Serif",
      "weights": ["400", "400i"],
      "fallback": "serif"
    },
    "interface": {
      "fontFamily": "Inter",
      "weights": ["400", "500", "600", "700"],
      "fallback": "sans-serif"
    }
  },
  "color": {
    "pureBlack": {
      "hex": "#000000",
      "rgb": "rgb(0, 0, 0)",
      "role": "Obsidian Ink & High-Contrast CTAs"
    },
    "warmSand": {
      "hex": "#E8DFCA",
      "rgb": "rgb(232, 223, 202)",
      "role": "Elevated Panels & Tactile Paper Canvas"
    },
    "slateMist": {
      "hex": "#AEBDCA",
      "rgb": "rgb(174, 189, 202)",
      "role": "Soft Accent, Hairlines & Glows"
    },
    "deepSlateBlue": {
      "hex": "#7895B2",
      "rgb": "rgb(120, 149, 178)",
      "role": "Primary Brand Accent & Key CTAs"
    }
  }
}`;

  const currentCode =
    activeTab === "css" ? cssTokens : activeTab === "tailwind" ? tailwindTokens : jsonTokens;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const filename =
      activeTab === "css"
        ? "marvedge-tokens.css"
        : activeTab === "tailwind"
        ? "marvedge-tailwind.js"
        : "marvedge-tokens.json";
    const blob = new Blob([currentCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="tokens" className="py-14 sm:py-20 bg-white border-t border-[#E8DFCA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3 bg-[#E8DFCA] text-black border border-[#D6CCB5]">
              <Code className="w-3.5 h-3.5 text-[#7895B2]" />
              Developer Tokens
            </div>
            <h2
              className="text-3xl sm:text-5xl text-black font-normal"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Export Design Tokens
            </h2>
          </div>
          <p className="text-sm text-[#757168] max-w-md">
            Instantly export the Marvedge brand kit as CSS Variables, Tailwind theme settings, or standard JSON design tokens for Figma.
          </p>
        </div>

        {/* Code Terminal Box */}
        <div className="rounded-3xl border border-[#E8DFCA] overflow-hidden bg-black text-white shadow-xl">
          {/* Terminal Header */}
          <div className="flex flex-wrap items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("css")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                  activeTab === "css"
                    ? "bg-[#7895B2] text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900"
                }`}
              >
                CSS Variables
              </button>
              <button
                onClick={() => setActiveTab("tailwind")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                  activeTab === "tailwind"
                    ? "bg-[#7895B2] text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900"
                }`}
              >
                Tailwind Config
              </button>
              <button
                onClick={() => setActiveTab("json")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors ${
                  activeTab === "json"
                    ? "bg-[#7895B2] text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900"
                }`}
              >
                Tokens JSON
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-3 sm:mt-0">
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-900 flex items-center gap-1.5 transition-colors"
                title="Download file"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>

              <button
                onClick={handleCopy}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-neutral-200 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#7895B2]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy Code"}</span>
              </button>
            </div>
          </div>

          {/* Code Body */}
          <pre className="p-6 sm:p-8 font-mono text-xs sm:text-sm text-neutral-200 overflow-x-auto leading-relaxed">
            <code>{currentCode}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
