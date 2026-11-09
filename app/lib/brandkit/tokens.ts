/**
 * Marvedge Canonical Design System Tokens
 * Version: 2.0.0
 * 
 * Single source of truth for all Marvedge UI UX, landing pages,
 * dashboard tools, and micro tools.
 */

export interface ColorToken {
  name: string;
  hex: string;
  rgb: string;
  hsl: string;
  role: string;
}

export const BRAND_COLORS = {
  pureBlack: {
    name: "Pure Black",
    hex: "#000000",
    rgb: "rgb(0, 0, 0)",
    hsl: "hsl(0, 0%, 0%)",
    role: "Primary typography, obsidian CTAs, structural borders, dark surfaces",
  },
  deepSlateBlue: {
    name: "Deep Slate Blue",
    hex: "#7895B2",
    rgb: "rgb(120, 149, 178)",
    hsl: "hsl(210, 27%, 58%)",
    role: "Primary brand accent, active tabs, focus rings, key CTAs, hyperlinks",
  },
  slateMist: {
    name: "Slate Mist",
    hex: "#AEBDCA",
    rgb: "rgb(174, 189, 202)",
    hsl: "hsl(208, 21%, 74%)",
    role: "Hairline borders, secondary badge fills, soft card dividers, subtle glows",
  },
  warmSand: {
    name: "Warm Sand",
    hex: "#E8DFCA",
    rgb: "rgb(232, 223, 202)",
    hsl: "hsl(42, 38%, 85%)",
    role: "Primary page canvas, tactile paper containers, editorial panel backdrops",
  },
  pureWhite: {
    name: "Pure White",
    hex: "#FFFFFF",
    rgb: "rgb(255, 255, 255)",
    hsl: "hsl(0, 0%, 100%)",
    role: "Elevated card containers, modal dialogue bodies, high-contrast button text",
  },
} as const;

export const FONTS = {
  display: {
    family: "'Instrument Serif', Georgia, serif",
    name: "Instrument Serif",
    roles: ["Hero Headlines", "Section H1/H2", "Editorial Pull Quotes", "Monogram Mark"],
    weights: [400],
    styles: ["normal", "italic"],
  },
  interface: {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    name: "Inter",
    roles: ["Body Text", "Controls", "Buttons", "Navigation", "Inputs", "Telemetry", "Data Tables"],
    weights: [400, 500, 600, 700],
    styles: ["normal"],
  },
} as const;

export const SPACING = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

export const RADII = {
  sm: "6px",
  md: "10px",
  lg: "16px",
  xl: "24px",
  full: "9999px",
} as const;

export const SHADOWS = {
  card: "0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)",
  cardHover: "0 12px 30px -4px rgba(0, 0, 0, 0.09), 0 4px 10px -2px rgba(0, 0, 0, 0.04)",
  slateGlow: "0 0 20px rgba(120, 149, 178, 0.35)",
  obsidianGlow: "0 4px 14px rgba(0, 0, 0, 0.25)",
} as const;

export const TRANSITIONS = {
  fast: "150ms cubic-bezier(0.16, 1, 0.3, 1)",
  default: "200ms cubic-bezier(0.16, 1, 0.3, 1)",
  slow: "300ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export const SEMANTIC_THEME = {
  canvas: BRAND_COLORS.warmSand.hex,
  canvasDark: BRAND_COLORS.pureBlack.hex,
  card: BRAND_COLORS.pureWhite.hex,
  cardBorder: BRAND_COLORS.warmSand.hex,
  hairline: BRAND_COLORS.slateMist.hex,
  textPrimary: BRAND_COLORS.pureBlack.hex,
  textSecondary: "#4A4740",
  textMuted: "#757168",
  ctaPrimary: BRAND_COLORS.pureBlack.hex,
  ctaSecondary: BRAND_COLORS.deepSlateBlue.hex,
  ctaAccent: BRAND_COLORS.warmSand.hex,
} as const;
