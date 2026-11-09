# Marvedge Design System & Brand Kit Specification

**Document Version:** 2.0.0  
**Status:** Approved & Canonical  
**Audience:** Frontend Engineers, Product Designers, Tool Builders  
**Scope:** Marvedge Marketing/Landing Pages, Dashboard UI/UX, Editor/Player Interfaces, and Micro Tools (Auto-Reframe, Voice Studio, Dubbing, Subtitle Editor)

---

## 1. Brand Philosophy & Design Tenets

Marvedge is an AI-powered interactive video demo and screen intelligence platform. The visual identity diverges intentionally from generic "neon gradient SaaS" tropes in favor of an **editorial, tactile paper sensibility** paired with **high-contrast obsidian precision**.

### Core Tenets

1. **Tactile Paper Canvas over Artificial Gradients:**  
   Primary page surfaces use a warm sand substrate (`#E8DFCA`) that evokes premium print and literary editorial layouts. Surfaces feel physically grounded, not digital or synthetic.
2. **Strict Two-Typeface Discipline:**  
   Typography is restricted to two families: **Instrument Serif** for editorial drama, titles, and storytelling; **Inter** for optical clarity, navigation, buttons, controls, and telemetry data.
3. **Four-Color Constraint:**  
   The entire interface is built from exactly four colors: **Pure Black**, **Deep Slate Blue**, **Slate Mist**, and **Warm Sand** (with Pure White used strictly for elevated card substrates and contrast legibility).
4. **Deliberate Micro-Interactions:**  
   All motion uses natural physical easing (`cubic-bezier(0.16, 1, 0.3, 1)`) with crisp durations (150ms–250ms). No gratuitous floating blobs or decorative animation.
5. **Zero-Compromise Accessibility:**  
   Every core text pairing must achieve a minimum of **WCAG AAA** (7.0:1) contrast for primary copy and **WCAG AA** (4.5:1) for secondary interactive controls.

---

## 2. Color Palette Specification

The palette consists of four core tokens and one neutral utility. Every UI component in Marvedge must map directly to these tokens.

### 2.1 Core Palette Tokens

| Token Name | HEX Code | RGB Value | HSL | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| `--color-pure-black` | `#000000` | `rgb(0, 0, 0)` | `0, 0%, 0%` | Primary typography, obsidian CTAs, structural borders, dark surfaces |
| `--color-deep-slate-blue` | `#7895B2` | `rgb(120, 149, 178)` | `210, 27%, 58%` | Primary brand accent, active tabs, focus rings, key CTAs, hyperlinks |
| `--color-slate-mist` | `#AEBDCA` | `rgb(174, 189, 202)` | `208, 21%, 74%` | Hairline borders, secondary badge fills, soft card dividers, subtle glows |
| `--color-warm-sand` | `#E8DFCA` | `rgb(232, 223, 202)` | `42, 38%, 85%` | Primary page canvas, tactile paper containers, editorial panel backdrops |
| `--color-pure-white` *(Utility)* | `#FFFFFF` | `rgb(255, 255, 255)` | `0, 0%, 100%` | Elevated card containers, modal dialogue bodies, high-contrast button text |

### 2.2 Surface & Layering Hierarchy

Marvedge uses an explicit 4-layer Z-axis surface model:

```
[Layer 3: Popover / Modal]   -> Pure White (#FFFFFF) with 1px Slate Mist border + shadow-xl
[Layer 2: Elevated Card]     -> Pure White (#FFFFFF) on Warm Sand, or Warm Sand on White
[Layer 1: Structural Panel]  -> Warm Sand (#E8DFCA) with 1px #D6CCB5 border
[Layer 0: Base Canvas]       -> Warm Sand (#E8DFCA) / In Dark Mode: Pure Black (#000000)
```

### 2.3 Color Rules & Restrictions

* **RULE 2.1 (Pure Black Inks):** Primary body text and headlines on `#E8DFCA` or `#FFFFFF` must be rendered in `#000000` (Pure Black). Do not use soft slate or dark grey for long-form reading copy.
* **RULE 2.2 (Button Inverted Contrast):** Primary obsidian buttons (`#000000`) and slate blue buttons (`#7895B2`) must always use `#FFFFFF` text. Never use black text on deep slate blue.
* **RULE 2.3 (Hairlines):** All card borders and section dividers must use either `1px solid #D6CCB5` (on Warm Sand) or `1px solid #AEBDCA` (on White / Obsidian). Never use thick borders (>1px) for card structures.
* **PROHIBITED:**
  * Do not use `#AEBDCA` (Slate Mist) for body text on light backgrounds (contrast ratio < 2.2:1, fails WCAG).
  * Do not introduce arbitrary brand colors (e.g. purple, neon teal, orange). Status indicators (e.g. recording red `#D95338` or green success `#2E7D32`) are reserved strictly for system state.

---

## 3. Typography System

Only two typefaces are authorized across the Marvedge platform.

### 3.1 Typeface Assignments

| Typeface | Classification | Weights Authorized | Primary Roles |
| :--- | :--- | :--- | :--- |
| **Instrument Serif** | Transitional Serif | `Regular (400)`, `Italic (400i)` | Hero headlines, section titles (H1/H2), pull quotes, brand monogram `M` |
| **Inter** | Modern Grotesque Sans | `Regular (400)`, `Medium (500)`, `SemiBold (600)`, `Bold (700)` | Body copy, navigation, buttons, form controls, tables, timelines, telemetry |

### 3.2 Type Scale Specification

| Role | Font Family | Size (Desktop / Mobile) | Line Height | Letter Spacing | Weight |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Hero** | Instrument Serif | `64px` / `44px` | `1.08` | `-0.02em` | 400 (Optional Italic) |
| **Heading 1** | Instrument Serif | `44px` / `34px` | `1.15` | `-0.015em` | 400 |
| **Heading 2** | Inter | `28px` / `24px` | `1.25` | `-0.02em` | 700 (Bold) |
| **Heading 3** | Inter | `20px` / `18px` | `1.35` | `-0.01em` | 600 (SemiBold) |
| **Body Large** | Inter | `18px` / `16px` | `1.55` | `0` | 400 (Regular) |
| **Body Standard** | Inter | `15px` / `14px` | `1.60` | `0` | 400 (Regular) |
| **Caption / UI Small** | Inter | `13px` / `12px` | `1.40` | `+0.01em` | 500 (Medium) |
| **Eyebrow / Overline** | Inter | `11px` / `10px` | `1.20` | `+0.08em` | 700 (Caps) |

### 3.3 Typography Rules

* **RULE 3.1 (Serif Exclusivity):** `Instrument Serif` is reserved strictly for display headers and editorial emphasis. Never use it for buttons, inputs, data tables, or paragraph copy longer than 2 sentences.
* **RULE 3.2 (Tabular Numerics in Micro Tools):** Timers, video durations, scrubbers, frame counts, and analytics metrics must use `font-variant-numeric: tabular-nums` to prevent layout jitter during updates.
* **RULE 3.3 (Sentence Case Navigation):** Navigation items, tabs, and button labels must use sentence case or title case (e.g. "Start Free Trial", "Auto-Reframe", "Export"). Do not use all-caps for full button labels.

---

## 4. Spacing, Grid & Layout Rules

### 4.1 4pt / 8pt Linear Spacing Scale

All margins, paddings, gaps, and component heights must be multiples of 4px or 8px:

| Token | Pixels | Common Application |
| :--- | :--- | :--- |
| `space-1` | `4px` | Micro gaps, badge inner padding, icon offsets |
| `space-2` | `8px` | Compact button padding, tight element spacing |
| `space-3` | `12px` | Input vertical padding, pill button padding |
| `space-4` | `16px` | Card internal padding (mobile), standard form gap |
| `space-6` | `24px` | Card internal padding (desktop), container gutters |
| `space-8` | `32px` | Section gaps within bento grids |
| `space-12` | `48px` | Section padding (mobile) |
| `space-16` | `64px` | Section padding (desktop) |
| `space-24` | `96px` | Hero top/bottom spacing |

### 4.2 Border Radii Presets

* **Pills / Status Chips / CTAs:** `rounded-full` (`9999px`)
* **Standard Cards & Bento Boxes:** `rounded-3xl` (`24px`)
* **Form Inputs & Controls:** `rounded-2xl` (`16px`)
* **Inner Sub-Panels & Modals:** `rounded-xl` (`12px`)
* **Micro Badges / Tooltips:** `rounded-lg` (`8px`)

---

## 5. UI Component Guidelines

### 5.1 Buttons

Marvedge defines four canonical button variants:

1. **Obsidian Primary (`btn-pure-black`):**
   * Background: `#000000`, Text: `#FFFFFF`, Radius: `9999px`.
   * Shadow: `0 2px 8px rgba(0,0,0,0.15)`.
   * Hover: Background `#1A1A1A`, `translateY(-1px)`, Shadow `0 6px 16px rgba(0,0,0,0.25)`.
   * *Usage:* Primary page conversion actions (Sign Up, Export Video, Save Project).
2. **Slate Primary (`btn-slate-blue`):**
   * Background: `#7895B2`, Text: `#FFFFFF`, Radius: `9999px`.
   * Shadow: `0 2px 8px rgba(120,149,178,0.3)`.
   * Hover: Background `#5D7C9C`, `translateY(-1px)`, Shadow `0 6px 18px rgba(120,149,178,0.45)`.
   * *Usage:* Tool-level primary actions (Launch Studio, Auto-Crop 9:16, Translate Voice).
3. **Warm Sand Secondary (`btn-warm-sand`):**
   * Background: `#E8DFCA`, Text: `#000000`, Border: `1px solid #D6CCB5`, Radius: `9999px`.
   * Hover: Background `#F4EDE1`, Border `#C4B9A0`, `translateY(-1px)`.
   * *Usage:* Secondary options, documentation links, cancellation buttons.
4. **Mist Hairline Outline (`btn-outline-mist`):**
   * Background: Transparent, Text: `#000000`, Border: `1px solid #AEBDCA`, Radius: `9999px`.
   * Hover: Background `rgba(174,189,202,0.18)`, Border `#7895B2`.
   * *Usage:* Filter tabs, tertiary links, ghost triggers.

### 5.2 Cards & Containers

* **Canvas Card on Sand Canvas:**
  * Background: `#FFFFFF` (Pure White).
  * Radius: `24px` (`rounded-3xl`).
  * Border: `1px solid #E8DFCA`.
  * Shadow: `0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)`.
  * Hover: `0 12px 30px -4px rgba(0, 0, 0, 0.09)`, `translateY(-2px)`.
* **Structural Panel on White Canvas:**
  * Background: `#E8DFCA` (Warm Sand).
  * Radius: `24px`.
  * Border: `1px solid #D6CCB5`.

### 5.3 Form Controls

* **Default State:**
  * Background: `#FFFFFF` or `rgba(232, 223, 202, 0.35)`.
  * Border: `1px solid #AEBDCA`.
  * Radius: `16px`.
  * Typography: Inter 14px, Color: `#000000`. Placeholder: `#757168`.
* **Focus State:**
  * Border: `1px solid #7895B2`.
  * Outline: `none`.
  * Ring: `3px solid rgba(120, 149, 178, 0.25)`.

---

## 6. Micro Tools Design Rules (Video Studio, Auto-Reframe, Dubbing)

When implementing micro tools (e.g. auto-reframe crop preview, voice dubbing editor, timeline scrubbers):

1. **Tool Canvas Background:**
   * Player containers and video preview viewports must use `#000000` (Pure Black) backgrounds to frame the media.
   * Tool control panels, sidebars, and parameter drawers must use `#E8DFCA` (Warm Sand) or `#FFFFFF` (Pure White) with hairline borders.
2. **Crop Bounding Boxes (Auto-Reframe 9:16):**
   * Active subject bounding box: `2px solid #7895B2` with soft corner brackets.
   * Speaker label badge: `#000000` pill with `#FFFFFF` Inter 11px text.
3. **Audio Waveforms:**
   * Waveform bars: Active segments in `#7895B2`, inactive in `#AEBDCA`, played head line in `#000000`.
4. **Playback Scrubbers & Sliders:**
   * Track: `4px` height, `#AEBDCA` background.
   * Progress Fill: `#7895B2`.
   * Thumb: `14px` circle `#000000` with `2px solid #FFFFFF` and shadow.

---

## 7. Contrast & Accessibility Verification

All approved combinations comply with WCAG 2.1 specifications:

| Foreground | Background | Contrast Ratio | WCAG Compliance | Target Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `#000000` (Pure Black) | `#E8DFCA` (Warm Sand) | **15.6 : 1** | **Pass AAA** | All primary copy, headings, and editorial content |
| `#000000` (Pure Black) | `#FFFFFF` (Pure White) | **21.0 : 1** | **Pass AAA** | Card copy, forms, table data, navigation |
| `#000000` (Pure Black) | `#AEBDCA` (Slate Mist) | **10.8 : 1** | **Pass AAA** | Badges, secondary pill labels, telemetry chips |
| `#FFFFFF` (Pure White) | `#000000` (Pure Black) | **21.0 : 1** | **Pass AAA** | Obsidian buttons, dark mode body text |
| `#FFFFFF` (Pure White) | `#7895B2` (Deep Slate Blue) | **4.6 : 1** | **Pass AA** | Primary buttons, accent pills, active tabs |
| `#7895B2` (Deep Slate Blue) | `#E8DFCA` (Warm Sand) | **3.2 : 1** | **Pass (UI Component)** | Non-text UI icons, borders, focus rings |

---

## 8. Code Import & Integration Cheat Sheet

### 8.1 TypeScript Tokens

```ts
import { BRAND_COLORS, FONTS, SPACING, RADII } from "@/app/lib/brandkit";

// Access color values
const primaryAccent = BRAND_COLORS.deepSlateBlue.hex; // "#7895B2"
const canvasBg = BRAND_COLORS.warmSand.hex;           // "#E8DFCA"
```

### 8.2 CSS Variables

```css
@import "@/app/components/brandkit/brandkit.css";

.custom-card {
  background-color: var(--card-bg);
  border: 1px solid var(--color-warm-sand);
  border-radius: var(--radius-xl);
  font-family: var(--font-sans);
}

.custom-headline {
  font-family: var(--font-serif);
  color: var(--color-pure-black);
}
```

### 8.3 Tailwind Classes

```html
<!-- Primary Obsidian CTA -->
<button class="btn-pure-black px-6 py-3 rounded-full text-xs font-semibold">
  Export Demo
</button>

<!-- Tactile White Card on Warm Sand -->
<div class="bg-white rounded-3xl p-6 border border-[#E8DFCA] shadow-sm">
  <h3 class="text-xl font-normal font-serif text-black">Auto-Detect Highlights</h3>
  <p class="text-sm text-[#4A4740] font-sans mt-2">Analyzes speech cadence and cursor movements.</p>
</div>
```
