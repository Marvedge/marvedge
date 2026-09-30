// Shared subtitle styling for SUB — one definition of "what does a subtitle look
// like", consumed by the live preview and by the burned-in export alike.
//
// WHY THIS MODULE EXISTS
// ----------------------
// Before PR 4 the two halves were written twice and agreed only by luck:
//
//   - preview  — app/(signed)/editor/components/SubtitleOverlay.tsx: a fixed
//                16px black-boxed line of CSS.
//   - burn-in  — cloudrun-worker/render.js `writeAssSubtitles()`: an ASS
//                `Style:` line with a height-proportional font
//                (`clamp(20, h*0.05, 58)`), no box, and a 1px outline.
//
// They were already measurably different — the preview showed a box the export
// never drew, at a size that ignored the frame entirely. The moment styling
// becomes user-controlled, "styling changes are reflected in the preview" (PRD
// §6.5 acceptance criterion) turns that divergence into a bug, so both ends now
// read their numbers from here. This mirrors app/lib/wtm/geometry.ts, which
// keeps the WTM preview and export in agreement the same way.
//
// THE FONT-SIZE TRAP
// ------------------
// "24px" means one thing on a 640px preview and another on a 1920px export, so
// nothing here stores raw pixels. `fontSizePct` is a percentage of FRAME HEIGHT;
// px appear only at the edges, in `subtitleMetrics()`. Both consumers call that
// one function, so a size can only be wrong in both places at once.
//
// This module is isomorphic: no fs, no env, no DOM, no canvas. It is imported by
// a React component, by a route handler, and (via `toAssStyleLine`) serialized
// into the worker's ASS file.

import type { CSSProperties } from "react";

import type { SubtitleAlignment, SubtitleAnimation, SubtitleStyle } from "./types";

/* -------------------------------------------------------------------------- */
/* Legacy constants — the burn-in as it exists on master                       */
/* -------------------------------------------------------------------------- */

// Everything in this block is lifted verbatim from `writeAssSubtitles()` so the
// defaults below can be checked against it (style.test.ts asserts the generated
// `Style:` line is character-for-character what master emits). Change one of
// these and the matching worker constant must move with it.

/** Font height as a fraction of frame height. */
const LEGACY_FONT_HEIGHT_RATIO = 0.05;
/** Absolute px bounds master clamps the default font to. */
const LEGACY_FONT_PX_MIN = 20;
const LEGACY_FONT_PX_MAX = 58;

/** Bottom margin as a fraction of frame height, and its px bounds. */
const LEGACY_MARGIN_V_RATIO = 0.06;
const LEGACY_MARGIN_V_PX_MIN = 20;
const LEGACY_MARGIN_V_PX_MAX = 96;

/** Side margins. Hardcoded px in master for landscape frames (>= 1200px width). */
export const LEGACY_MARGIN_H_PX = 60;

/** Minimum side margin in px to prevent captions from touching the frame edge on narrow clips. */
export const SUBTITLE_MARGIN_H_MIN_PX = 16;

/** Horizontal margin ratio as a fraction of frame width for responsive scaling. */
export const SUBTITLE_MARGIN_H_RATIO = 0.05;

/**
 * Computes horizontal margin based on frame width.
 *
 * Responsive to frame width so narrow portrait clips (e.g. 404x720) do not lose
 * excessive width to side gutters (~30% previously), while preserving standard
 * ~60px gutters on landscape displays.
 *
 * Validation targets:
 * - 404x720:   Math.round(404 * 0.05) = 20px (usable text width: 364px, ~90%)
 * - 1080x1920: Math.round(1080 * 0.05) = 54px (usable text width: 972px, 90%)
 * - 1280x720:  capped at 60px (usable text width: 1160px)
 * - 1920x1080: capped at 60px (usable text width: 1800px)
 */
export function computeMarginHPx(frameWidth?: number): number {
  const w = Number(frameWidth);
  if (!Number.isFinite(w) || w <= 0) {
    return LEGACY_MARGIN_H_PX;
  }
  return Math.max(
    SUBTITLE_MARGIN_H_MIN_PX,
    Math.min(LEGACY_MARGIN_H_PX, Math.round(w * SUBTITLE_MARGIN_H_RATIO))
  );
}

/** Outline thickness as a fraction of the font size (master: `fontSize / 16`). */
const LEGACY_OUTLINE_RATIO = 1 / 16;

/**
 * Master's `BackColour`: 61%-opaque black. With `BorderStyle: 1` this is the
 * SHADOW colour, and master sets `Shadow: 0`, so it is never actually drawn —
 * it is carried through unchanged only so a default export stays byte-identical.
 */
const LEGACY_BACK_COLOUR = "&H64000000";

/** Master's `SecondaryColour` (karaoke fill — unused, we emit no `\k` tags). */
const LEGACY_SECONDARY_COLOUR = "&H000000FF";

/* -------------------------------------------------------------------------- */
/* The style contract                                                          */
/* -------------------------------------------------------------------------- */

/** The four fonts the PRD offers. All four already resolve in the container. */
export const SUBTITLE_FONTS = ["arial", "roboto", "poppins", "inter"] as const;

export type SubtitleFont = (typeof SUBTITLE_FONTS)[number];

/**
 * Font key → the `Fontname` libass looks up.
 *
 * These are FAMILY names, not the file paths `resolveFontForDrawtext()` hands to
 * ffmpeg's `drawtext`. libass resolves a family through fontconfig, so the
 * worker additionally points it at the bundled `fonts/` directory — see
 * `subtitles=…:fontsdir=` in render.js. `Arial` resolves via the
 * fonts-liberation alias that master already relies on.
 */
export const SUBTITLE_FONT_NAMES: Record<SubtitleFont, string> = {
  arial: "Arial",
  roboto: "Roboto",
  poppins: "Poppins",
  inter: "Inter",
};

/**
 * Font key → CSS font-family stack for live browser preview.
 * References the Next.js font variables defined in app/layout.tsx with sensible family fallbacks.
 */
export const SUBTITLE_CSS_FONT_FAMILIES: Record<SubtitleFont, string> = {
  arial: "Arial, sans-serif",
  roboto: "var(--font-roboto), Roboto, sans-serif",
  poppins: "var(--font-poppins), Poppins, sans-serif",
  inter: "var(--font-inter), Inter, sans-serif",
};

/** Labels for the font picker. */
export const SUBTITLE_FONT_LABELS: Record<SubtitleFont, string> = {
  arial: "Arial",
  roboto: "Roboto",
  poppins: "Poppins",
  inter: "Inter",
};

export const SUBTITLE_ALIGNMENTS: readonly SubtitleAlignment[] = ["top", "middle", "bottom"];

export const SUBTITLE_ANIMATIONS: readonly SubtitleAnimation[] = ["none", "fade", "pop", "slide"];

/** Alignment → ASS numpad `Alignment`. Horizontal is always centred. */
const ASS_ALIGNMENT: Record<SubtitleAlignment, number> = {
  top: 8,
  middle: 5,
  bottom: 2,
};

/**
 * The height the PRD's 12–72px size slider is quoted at.
 *
 * The slider talks in pixels because that is what a user understands; the store
 * holds a percentage because that is what survives a resolution change. This
 * constant is the exchange rate between the two, and it is a UI concern only —
 * nothing in the ASS or CSS mapping reads it.
 */
export const SUBTITLE_SIZE_REFERENCE_HEIGHT = 1080;

/** PRD §6.5 size range, in px at the reference height. */
export const SUBTITLE_FONT_PX_MIN = 12;
export const SUBTITLE_FONT_PX_MAX = 72;

/** The same range expressed the way the style object stores it. */
export const SUBTITLE_FONT_PCT_MIN = (SUBTITLE_FONT_PX_MIN / SUBTITLE_SIZE_REFERENCE_HEIGHT) * 100;
export const SUBTITLE_FONT_PCT_MAX = (SUBTITLE_FONT_PX_MAX / SUBTITLE_SIZE_REFERENCE_HEIGHT) * 100;

/**
 * The baseline subtitle: exactly what master burns in today.
 *
 * `toAssStyleLine(DEFAULT_SUBTITLE_STYLE, w, h)` reproduces master's hardcoded
 * `Style:` line character for character at every frame height — style.test.ts
 * asserts it against an independent transcription of master's expression. A
 * demo that never opens the style panel therefore exports byte-identically, and
 * the worker additionally keeps master's literal line as its no-style fallback,
 * so byte-identity does not depend on this object being right.
 *
 * Note there is no `backgroundColor`: master draws no box. The preview drew one
 * (`bg-black/70`) and the export never did — removing it is how the two ends
 * come into agreement.
 */
// Intersected with SubtitleStyle so the optional fields it deliberately omits
// (the background box) stay addressable on the defaults object, while everything
// it does define is non-optional for callers.
export type DefaultSubtitleStyle = SubtitleStyle &
  Required<
    Pick<
      SubtitleStyle,
      | "fontFamily"
      | "fontSizePct"
      | "color"
      | "outlineWidth"
      | "outlineColor"
      | "shadowDepth"
      | "alignment"
      | "animation"
    >
  >;

export const DEFAULT_SUBTITLE_STYLE: DefaultSubtitleStyle = {
  fontFamily: "arial",
  fontSizePct: LEGACY_FONT_HEIGHT_RATIO * 100,
  color: "#FFFFFF",
  outlineWidth: LEGACY_OUTLINE_RATIO,
  outlineColor: "#000000",
  shadowDepth: 0,
  alignment: "bottom",
  animation: "none",
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** `#RGB` is widened to `#RRGGBB`; anything else non-conforming is rejected. */
function readHexColour(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return HEX_COLOUR.test(raw) ? raw.toUpperCase() : fallback;
}

export function isSubtitleFont(value: unknown): value is SubtitleFont {
  return typeof value === "string" && (SUBTITLE_FONTS as readonly string[]).includes(value);
}

export function isSubtitleAlignment(value: unknown): value is SubtitleAlignment {
  return typeof value === "string" && (SUBTITLE_ALIGNMENTS as readonly string[]).includes(value);
}

export function isSubtitleAnimation(value: unknown): value is SubtitleAnimation {
  return typeof value === "string" && (SUBTITLE_ANIMATIONS as readonly string[]).includes(value);
}

/**
 * Validate + clamp a style coming from the client (or from a demo's persisted
 * `editing.subtitleStyle`). Every field falls back to the default individually,
 * so a half-written or hand-edited object degrades to today's appearance rather
 * than to nothing.
 *
 * Returns `undefined` for anything that isn't an object, which is what lets the
 * whole feature stay opt-in: no style config → the worker takes its literal
 * master fallback and the export is unchanged. Mirrors
 * `sanitizeWatermarkConfig` in app/lib/wtm/watermark.ts.
 *
 * app/api/jobs/create/route.ts is the authority and re-runs this on whatever the
 * client sends; the editor calls it too so the preview shows what the server
 * will actually bake in.
 */
export function sanitizeSubtitleStyle(raw: unknown): SubtitleStyle | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const s = raw as Record<string, unknown>;

  // A background box is opt-in: absent (or invalid) means "no box", which is
  // what master renders. It is not defaulted to a colour.
  const hasBox = typeof s.backgroundColor === "string" && HEX_COLOUR.test(s.backgroundColor.trim());

  return {
    fontFamily: isSubtitleFont(s.fontFamily) ? s.fontFamily : DEFAULT_SUBTITLE_STYLE.fontFamily,
    fontSizePct: clampNumber(
      s.fontSizePct,
      SUBTITLE_FONT_PCT_MIN,
      SUBTITLE_FONT_PCT_MAX,
      DEFAULT_SUBTITLE_STYLE.fontSizePct
    ),
    color: readHexColour(s.color, DEFAULT_SUBTITLE_STYLE.color),
    ...(hasBox
      ? {
          backgroundColor: readHexColour(s.backgroundColor, "#000000"),
          backgroundOpacity: clampNumber(s.backgroundOpacity, 0, 1, 0.6),
        }
      : {}),
    outlineWidth: clampNumber(s.outlineWidth, 0, 0.25, DEFAULT_SUBTITLE_STYLE.outlineWidth),
    outlineColor: readHexColour(s.outlineColor, DEFAULT_SUBTITLE_STYLE.outlineColor),
    shadowDepth: clampNumber(s.shadowDepth, 0, 0.25, DEFAULT_SUBTITLE_STYLE.shadowDepth),
    alignment: isSubtitleAlignment(s.alignment) ? s.alignment : DEFAULT_SUBTITLE_STYLE.alignment,
    animation: isSubtitleAnimation(s.animation) ? s.animation : DEFAULT_SUBTITLE_STYLE.animation,
  };
}

/** Fill every optional field, so the mappings below never branch on absence. */
function withDefaults(style?: SubtitleStyle): SubtitleStyle {
  return { ...DEFAULT_SUBTITLE_STYLE, ...(style ?? {}) };
}

/* -------------------------------------------------------------------------- */
/* Size ↔ slider conversion                                                    */
/* -------------------------------------------------------------------------- */

/** Stored percentage → the px number the slider shows. */
export function fontPctToSliderPx(pct: number): number {
  return Math.round((pct / 100) * SUBTITLE_SIZE_REFERENCE_HEIGHT);
}

/** Slider px → the percentage that gets stored. */
export function sliderPxToFontPct(px: number): number {
  return (px / SUBTITLE_SIZE_REFERENCE_HEIGHT) * 100;
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

const hex2 = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");

/**
 * `#RRGGBB` + opacity → an ASS colour literal.
 *
 * ASS is `&HAABBGGRR`, and it disagrees with CSS on BOTH axes:
 *   - the RGB bytes are REVERSED (blue first, red last), and
 *   - the alpha byte is INVERTED — `00` is fully OPAQUE, `FF` fully transparent.
 *
 * Getting either backwards produces a plausible-looking colour that is simply
 * the wrong one (red↔blue) or an invisible subtitle (alpha), which is why
 * style.test.ts round-trips this in both directions.
 */
export function hexToAssColour(hex: string, opacity = 1): string {
  const clean = readHexColour(hex, "#000000").slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const alpha = 255 - Math.round(clampNumber(opacity, 0, 1, 1) * 255);
  return `&H${hex2(alpha)}${hex2(b)}${hex2(g)}${hex2(r)}`;
}

/** Inverse of `hexToAssColour`. Exists so the byte order can be tested both ways. */
export function assColourToHex(ass: string): { hex: string; opacity: number } {
  const m = /^&H([0-9a-fA-F]{8})$/.exec(String(ass).trim());
  if (!m) {
    return { hex: "#000000", opacity: 1 };
  }
  const [aa, bb, gg, rr] = [m[1].slice(0, 2), m[1].slice(2, 4), m[1].slice(4, 6), m[1].slice(6, 8)];
  return {
    hex: `#${rr}${gg}${bb}`.toUpperCase(),
    opacity: 1 - Number.parseInt(aa, 16) / 255,
  };
}

/** `#RRGGBB` + opacity → `rgba(...)`, the CSS half of the pair above. */
export function hexToRgba(hex: string, opacity = 1): string {
  const clean = readHexColour(hex, "#000000").slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(clampNumber(opacity, 0, 1, 1).toFixed(3))})`;
}

/* -------------------------------------------------------------------------- */
/* Metrics — the single place a style becomes pixels                           */
/* -------------------------------------------------------------------------- */

export interface SubtitleMetrics {
  /** Font height in px at `frameHeight`. */
  fontPx: number;
  /** Distance from the frame edge (top or bottom) in px. */
  marginVPx: number;
  /** Side margin in px. */
  marginHPx: number;
  /** Outline thickness in px. */
  outlinePx: number;
  /** Shadow offset in px. */
  shadowPx: number;
  /** Box padding in px for highlighted captions (0 if no background box). */
  boxPaddingPx: number;
}

/** Base padding ratio relative to fontPx for background boxes (15% of font height). */
export const SUBTITLE_BOX_PADDING_BASE_RATIO = 0.15;
/** Minimum box padding in px so captions never touch or clip the background box. */
export const SUBTITLE_BOX_PADDING_MIN_PX = 2;

/**
 * Calculates box padding in pixels for highlighted (background box) subtitles.
 *
 * In ASS/libass, BorderStyle: 3 draws an opaque background box behind the text
 * and repurposes the `Outline` field as the box padding in pixels. It does NOT
 * draw a glyph stroke around the characters.
 *
 * To ensure visual parity between CSS preview and ASS export:
 * 1. Both CSS text padding and ASS Outline use this exact derived value.
 * 2. When a background box is present, CSS glyph stroke (-webkit-text-stroke)
 *    is suppressed, preventing a mismatch where preview shows an outline
 *    that libass does not render.
 * 3. Box padding is uniform in horizontal and vertical dimensions.
 * 4. The box padding is proportional to font size: a base padding of 15% of fontPx
 *    (minimum 2px), plus the user-configured outlineWidth ratio if provided,
 *    ensuring the box never hugs or clips the text glyphs.
 */
export function computeBoxPaddingPx(fontPx: number, outlineWidth = 0): number {
  const widthRatio = Number.isFinite(Number(outlineWidth)) ? Math.max(0, Number(outlineWidth)) : 0;
  return Math.max(
    SUBTITLE_BOX_PADDING_MIN_PX,
    Math.round(fontPx * (SUBTITLE_BOX_PADDING_BASE_RATIO + widthRatio))
  );
}

/**
 * A style resolved to pixels at a given frame height. THE one place a percentage
 * becomes a number of pixels — the CSS and ASS mappings below both go through
 * it, so preview and export cannot disagree about size.
 *
 * The px clamp on the font deserves a note. Master clamps the default to
 * `[20, 58]`, which stops subtitles becoming enormous on a tall portrait frame
 * (a 1080×1920 export at a flat 5% would be 96px). Keeping that guard as a fixed
 * px range would silently cap a user who asked for 72px, so the bounds are
 * scaled by the size they chose relative to the default: the default is
 * clamped exactly as master clamps it, and a larger request gets a
 * proportionally larger ceiling.
 */
export function subtitleMetrics(
  style: SubtitleStyle | undefined,
  frameHeight: number,
  frameWidth?: number
): SubtitleMetrics {
  const s = withDefaults(style);
  const h = Math.max(1, Number(frameHeight) || 0);
  const w =
    Number.isFinite(Number(frameWidth)) && Number(frameWidth) > 0
      ? Number(frameWidth)
      : Math.round((h * 16) / 9);

  const pct = clampNumber(
    s.fontSizePct,
    SUBTITLE_FONT_PCT_MIN,
    SUBTITLE_FONT_PCT_MAX,
    DEFAULT_SUBTITLE_STYLE.fontSizePct
  );
  const sizeScale = pct / DEFAULT_SUBTITLE_STYLE.fontSizePct;
  const fontPx = Math.max(
    Math.round(LEGACY_FONT_PX_MIN * sizeScale),
    Math.min(Math.round(LEGACY_FONT_PX_MAX * sizeScale), Math.round(h * (pct / 100)))
  );

  const marginVPx = Math.max(
    LEGACY_MARGIN_V_PX_MIN,
    Math.min(LEGACY_MARGIN_V_PX_MAX, Math.round(h * LEGACY_MARGIN_V_RATIO))
  );

  const outlineWidth = clampNumber(s.outlineWidth, 0, 0.25, DEFAULT_SUBTITLE_STYLE.outlineWidth);
  const shadowDepth = clampNumber(s.shadowDepth, 0, 0.25, DEFAULT_SUBTITLE_STYLE.shadowDepth);
  const hasBox = typeof s.backgroundColor === "string" && s.backgroundColor.length > 0;

  return {
    fontPx,
    marginVPx,
    marginHPx: computeMarginHPx(w),
    outlinePx: Math.round(fontPx * outlineWidth),
    shadowPx: Math.round(fontPx * shadowDepth),
    boxPaddingPx: hasBox ? computeBoxPaddingPx(fontPx, outlineWidth) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* CSS mapping (the preview)                                                   */
/* -------------------------------------------------------------------------- */

export interface SubtitleCssStyle {
  /** Positions the caption block within the frame (alignment + margins). */
  container: CSSProperties;
  /** Paints the caption itself (font, colour, outline, shadow, box). */
  text: CSSProperties;
}

/**
 * A style as CSS for the editor's overlay.
 *
 * `frameHeight` is the height of the frame the metrics are quoted at — pass the
 * EXPORT height, not the preview's, so a clamp that binds on a 1920px portrait
 * export also binds in the preview. `renderedHeight` is the preview box's actual
 * px height; every metric is scaled by `renderedHeight / frameHeight`, which is
 * what makes the preview a true miniature of the export rather than a
 * differently-proportioned lookalike. Omit it and the metrics come back at
 * frame scale.
 *
 * The outline is drawn with `paint-order: stroke` + `-webkit-text-stroke`, which
 * strokes OUTSIDE the glyph the way libass does, rather than the four-way
 * `text-shadow` trick that thickens the letterform.
 */
export interface SubtitleCssOptions {
  /**
   * Lay the text out right-to-left (SUB PR 5). Comes from the ACTIVE TRACK's
   * language, not from the style — RTL is a property of the script, not a knob
   * the user turns. See `isRtlLanguage` in ./languages.
   */
  rtl?: boolean;
  /**
   * Export frame width in px. Used to calculate responsive horizontal margins.
   */
  frameWidth?: number;
}

export function toCssStyle(
  style: SubtitleStyle | undefined,
  frameHeight: number,
  renderedHeight?: number,
  options?: SubtitleCssOptions
): SubtitleCssStyle {
  const s = withDefaults(style);
  const h = Math.max(1, Number(frameHeight) || 0);
  const frameWidth = options?.frameWidth ?? Math.round((h * 16) / 9);
  const m = subtitleMetrics(style, frameHeight, frameWidth);
  const scale =
    Number.isFinite(renderedHeight) && (renderedHeight as number) > 0
      ? (renderedHeight as number) / Math.max(1, Number(frameHeight) || 1)
      : 1;

  const px = (value: number): number => value * scale;
  const marginV = px(m.marginVPx);
  const marginH = px(m.marginHPx);

  const container: CSSProperties = {
    position: "absolute",
    left: `${marginH}px`,
    right: `${marginH}px`,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
    ...(s.alignment === "top"
      ? { top: `${marginV}px`, alignItems: "flex-start" }
      : s.alignment === "middle"
        ? { top: "50%", transform: "translateY(-50%)", alignItems: "center" }
        : { bottom: `${marginV}px`, alignItems: "flex-end" }),
  };

  const hasBox = typeof s.backgroundColor === "string" && s.backgroundColor.length > 0;
  const outlinePx = px(m.outlinePx);
  const shadowPx = px(m.shadowPx);
  const boxPaddingPx = px(m.boxPaddingPx);

  const text: CSSProperties = {
    // `direction` reorders the line; `unicodeBidi: isolate` keeps a Latin
    // product name embedded in an Arabic caption from dragging the surrounding
    // run with it. The burn-in's equivalent is in the worker — see the RTL note
    // on RTL_RENDERING_VERIFIED in ./languages for why neither is offered yet.
    ...(options?.rtl ? { direction: "rtl" as const, unicodeBidi: "isolate" as const } : {}),
    fontFamily:
      SUBTITLE_CSS_FONT_FAMILIES[(s.fontFamily as SubtitleFont) ?? "arial"] ?? "Arial, sans-serif",
    fontSize: `${px(m.fontPx)}px`,
    lineHeight: 1.25,
    color: s.color,
    textAlign: "center",
    whiteSpace: "pre-wrap",
    ...(!hasBox && outlinePx > 0
      ? {
          WebkitTextStrokeWidth: `${outlinePx}px`,
          WebkitTextStrokeColor: s.outlineColor,
          paintOrder: "stroke fill",
        }
      : {}),
    ...(shadowPx > 0
      ? {
          textShadow: `${shadowPx}px ${shadowPx}px ${shadowPx}px ${hexToRgba(s.outlineColor ?? "#000000", 1)}`,
        }
      : {}),
    ...(hasBox
      ? {
          backgroundColor: hexToRgba(s.backgroundColor as string, s.backgroundOpacity ?? 0.6),
          padding: `${boxPaddingPx}px`,
        }
      : {}),
  };

  return { container, text };
}

/**
 * Keyframes backing the three entrance animations, kept next to the ASS override
 * tags they mirror so the pair cannot drift. The overlay injects this once.
 *
 * Durations match `toAssOverrideTags` below: fade 200ms in, pop 300ms total,
 * slide 250ms.
 */
export const SUBTITLE_ANIMATION_KEYFRAMES = `
@keyframes marvedge-sub-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes marvedge-sub-pop {
  0% { transform: scale(1) }
  50% { transform: scale(1.1) }
  100% { transform: scale(1) }
}
@keyframes marvedge-sub-slide {
  from { transform: translateY(80%); opacity: 0 }
  to { transform: translateY(0); opacity: 1 }
}
`.trim();

/** The `animation` shorthand for a style, or `undefined` for `none`. */
export function toCssAnimation(style: SubtitleStyle | undefined): string | undefined {
  const animation = withDefaults(style).animation;
  switch (animation) {
    case "fade":
      return "marvedge-sub-fade 200ms ease-out";
    case "pop":
      return "marvedge-sub-pop 300ms ease-out";
    case "slide":
      return "marvedge-sub-slide 250ms ease-out";
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* ASS mapping (the burn-in)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A style as the ASS `Style: Default,...` line, in the field order the
 * `[V4+ Styles]` `Format:` line declares.
 *
 * Two mappings are worth stating outright, because guessing them wrong produces
 * output that looks almost right:
 *   - a background BOX is `BorderStyle: 3` + `BackColour`, NOT `Outline`. With
 *     `BorderStyle: 1` (master's value) `BackColour` is the shadow colour.
 *   - `Outline` and `Shadow` are px at `PlayResY`, so they come from
 *     `subtitleMetrics()` like everything else.
 */
export function toAssStyleLine(style: SubtitleStyle | undefined, w: number, h: number): string {
  const s = withDefaults(style);
  const m = subtitleMetrics(style, h, w);
  const font = SUBTITLE_FONT_NAMES[(s.fontFamily as SubtitleFont) ?? "arial"] ?? "Arial";

  const hasBox = typeof s.backgroundColor === "string" && s.backgroundColor.length > 0;
  const borderStyle = hasBox ? 3 : 1;
  const backColour = hasBox
    ? hexToAssColour(s.backgroundColor as string, s.backgroundOpacity ?? 0.6)
    : LEGACY_BACK_COLOUR;

  // In ASS BorderStyle 3 (box), libass uses the Outline field as box padding.
  // We align with the preview's boxPaddingPx so the box has appropriate padding
  // and honors user outline adjustments without disappearing or collapsing to 0.
  const outlinePx = hasBox ? m.boxPaddingPx : m.outlinePx;

  return [
    "Style: Default",
    font,
    m.fontPx,
    hexToAssColour(s.color ?? "#FFFFFF", 1),
    LEGACY_SECONDARY_COLOUR,
    hexToAssColour(s.outlineColor ?? "#000000", 1),
    backColour,
    0, // Bold
    0, // Italic
    0, // Underline
    0, // StrikeOut
    100, // ScaleX
    100, // ScaleY
    0, // Spacing
    0, // Angle
    borderStyle,
    outlinePx,
    m.shadowPx,
    ASS_ALIGNMENT[(s.alignment as SubtitleAlignment) ?? "bottom"] ?? 2,
    m.marginHPx,
    m.marginHPx,
    m.marginVPx,
    1, // Encoding
  ].join(",");
}

/**
 * Per-cue ASS override tags for the entrance animation, prepended to a
 * `Dialogue` line's text (`{\fad(200,200)}Hello`).
 *
 * `\fad`, `\t` and `\move` are all standard ASS override tags implemented by
 * libass, which is what ffmpeg's `subtitles` filter uses. `none` returns an
 * empty string so a default export's `Dialogue` lines are unchanged.
 *
 * `\move` overrides the style's margins and positions the text absolutely, so
 * the anchor it slides to is computed here from the same metrics the `Style:`
 * line uses — otherwise a slide-in would land somewhere the static style never
 * puts the caption.
 */
export function toAssOverrideTags(style: SubtitleStyle | undefined, w: number, h: number): string {
  const s = withDefaults(style);
  switch (s.animation) {
    case "fade":
      return "{\\fad(200,200)}";
    case "pop":
      return "{\\t(0,150,\\fscx110\\fscy110)\\t(150,300,\\fscx100\\fscy100)}";
    case "slide": {
      const m = subtitleMetrics(style, h, w);
      const x = Math.round(w / 2);
      const y =
        s.alignment === "top"
          ? m.marginVPx
          : s.alignment === "middle"
            ? Math.round(h / 2)
            : h - m.marginVPx;
      const from = y + Math.round(m.fontPx * 0.8);
      return `{\\move(${x},${from},${x},${y},0,250)}`;
    }
    default:
      return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Frame geometry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The height an export will actually have, for a given frame aspect ratio.
 *
 * Mirrors `computeTargetSizeForRatio()` in cloudrun-worker/render.js. The
 * preview needs it because the font clamp is resolution-dependent: a 9:16 demo
 * exports 1080×1920, where the clamp binds, and a preview that assumed 1080p
 * landscape would show text 60% larger than the export produces.
 *
 * Quality is chosen in the export modal, not in the editor, so the preview asks
 * for the 1080p answer. A 720p export is the same frame scaled down, and the
 * only visible difference is where the px clamp lands.
 */
export function exportFrameHeight(
  aspectRatio: number,
  quality: "720p" | "1080p" = "1080p"
): number {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  let longSide = quality === "1080p" ? 1920 : 1280;
  if (quality !== "1080p" && Math.abs(ratio - 1) < 0.001) {
    longSide = 960;
  }
  const height = ratio >= 1 ? longSide / ratio : longSide;
  // render.js rounds every dimension to an even number.
  return Math.max(2, 2 * Math.round(height / 2));
}
