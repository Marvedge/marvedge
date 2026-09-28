import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_FONT_PCT_MAX,
  SUBTITLE_FONT_PCT_MIN,
  assColourToHex,
  exportFrameHeight,
  fontPctToSliderPx,
  hexToAssColour,
  hexToRgba,
  sanitizeSubtitleStyle,
  sliderPxToFontPct,
  subtitleMetrics,
  toAssOverrideTags,
  toAssStyleLine,
  toCssStyle,
} from "./style";
import type { SubtitleStyle } from "./types";

/**
 * An INDEPENDENT transcription of the `Style:` line master's
 * `writeAssSubtitles()` hardcodes (cloudrun-worker/render.js). Deliberately
 * written out longhand rather than imported, so it keeps testing what master
 * does even if the style module's own constants are refactored — this is the
 * backstop for "a demo with no style config exports byte-identically".
 */
function masterStyleLine(h: number): string {
  const fontSize = Math.max(20, Math.min(58, Math.round(h * 0.05)));
  const marginV = Math.max(20, Math.min(96, Math.round(h * 0.06)));
  const outline = Math.max(1, Math.min(4, Math.round(fontSize / 16)));
  return `Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},0,2,60,60,${marginV},1`;
}

/** Every frame height computeTargetSizeForRatio() can actually produce. */
const EXPORT_HEIGHTS = [720, 1080, 1440, 1920, 960, 1280, 540, 608, 800];

describe("ASS colour encoding", () => {
  it("reverses the RGB byte order and inverts alpha", () => {
    // Pure red in CSS is the LAST byte pair in ASS.
    expect(hexToAssColour("#FF0000", 1)).toBe("&H000000FF");
    // Pure blue in CSS is the FIRST colour byte pair in ASS.
    expect(hexToAssColour("#0000FF", 1)).toBe("&H00FF0000");
    expect(hexToAssColour("#00FF00", 1)).toBe("&H0000FF00");
    expect(hexToAssColour("#FFFFFF", 1)).toBe("&H00FFFFFF");
    expect(hexToAssColour("#000000", 1)).toBe("&H00000000");
  });

  it("treats alpha 00 as fully opaque and FF as fully transparent", () => {
    expect(hexToAssColour("#FFFFFF", 1)).toBe("&H00FFFFFF");
    expect(hexToAssColour("#FFFFFF", 0)).toBe("&HFFFFFFFF");
    // Master's BackColour: &H64 == 100/255 transparent == ~61% opaque.
    expect(hexToAssColour("#000000", 1 - 100 / 255)).toBe("&H64000000");
  });

  it("round-trips through assColourToHex in both directions", () => {
    for (const hex of ["#FF0000", "#0000FF", "#123456", "#8A76FC", "#FFFFFF", "#000000"]) {
      const round = assColourToHex(hexToAssColour(hex, 1));
      expect(round.hex).toBe(hex.toUpperCase());
      expect(round.opacity).toBeCloseTo(1, 5);
    }
    for (const opacity of [0, 0.25, 0.5, 0.61, 1]) {
      const round = assColourToHex(hexToAssColour("#A594F9", opacity));
      expect(round.hex).toBe("#A594F9");
      expect(round.opacity).toBeCloseTo(opacity, 2);
    }
  });

  it("decodes a known ASS literal back to CSS", () => {
    expect(assColourToHex("&H00FFFFFF")).toEqual({ hex: "#FFFFFF", opacity: 1 });
    expect(assColourToHex("&H000000FF").hex).toBe("#FF0000");
    expect(assColourToHex("&H00FF0000").hex).toBe("#0000FF");
  });

  it("maps hex to rgba() for the preview", () => {
    expect(hexToRgba("#FF0000", 1)).toBe("rgba(255, 0, 0, 1)");
    expect(hexToRgba("#000000", 0.6)).toBe("rgba(0, 0, 0, 0.6)");
  });
});

describe("DEFAULT_SUBTITLE_STYLE reproduces master's burn-in", () => {
  it("emits master's Style: line character for character at every export height", () => {
    for (const h of EXPORT_HEIGHTS) {
      expect(toAssStyleLine(DEFAULT_SUBTITLE_STYLE, Math.round((h * 16) / 9), h)).toBe(
        masterStyleLine(h)
      );
    }
  });

  it("emits master's Style: line for an undefined style too", () => {
    for (const h of EXPORT_HEIGHTS) {
      expect(toAssStyleLine(undefined, 1920, h)).toBe(masterStyleLine(h));
    }
  });

  it("keeps matching master across the whole plausible height range", () => {
    for (let h = 120; h <= 2160; h += 4) {
      expect(toAssStyleLine(DEFAULT_SUBTITLE_STYLE, 1920, h)).toBe(masterStyleLine(h));
    }
  });

  it("adds no override tags, so Dialogue lines are unchanged", () => {
    expect(toAssOverrideTags(DEFAULT_SUBTITLE_STYLE, 1920, 1080)).toBe("");
    expect(toAssOverrideTags(undefined, 1920, 1080)).toBe("");
  });

  it("survives a round trip through the sanitizer", () => {
    const sanitized = sanitizeSubtitleStyle({ ...DEFAULT_SUBTITLE_STYLE });
    for (const h of EXPORT_HEIGHTS) {
      expect(toAssStyleLine(sanitized, 1920, h)).toBe(masterStyleLine(h));
    }
  });
});

describe("subtitleMetrics", () => {
  it("scales font size with frame height", () => {
    expect(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 1080).fontPx).toBe(54);
    expect(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 720).fontPx).toBe(36);
  });

  it("clamps the default exactly as master does on a tall portrait frame", () => {
    // 5% of 1920 is 96px; master caps it at 58.
    expect(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 1920).fontPx).toBe(58);
  });

  it("scales the clamp with the requested size, so a large choice is not capped away", () => {
    const large: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, fontSizePct: sliderPxToFontPct(72) };
    // 72px is honoured at the reference height rather than cut to 58.
    expect(subtitleMetrics(large, 1080).fontPx).toBe(72);
    expect(subtitleMetrics(large, 1920).fontPx).toBeGreaterThan(58);
  });

  it("derives the outline from the font size and the shadow from shadowDepth", () => {
    expect(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 1080).outlinePx).toBe(3);
    expect(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 1080).shadowPx).toBe(0);
    expect(subtitleMetrics({ ...DEFAULT_SUBTITLE_STYLE, shadowDepth: 0.1 }, 1080).shadowPx).toBe(5);
    expect(subtitleMetrics({ ...DEFAULT_SUBTITLE_STYLE, outlineWidth: 0 }, 1080).outlinePx).toBe(0);
  });

  it("never divides by zero on a degenerate frame height", () => {
    expect(Number.isFinite(subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 0).fontPx)).toBe(true);
  });
});

describe("sanitizeSubtitleStyle", () => {
  it("returns undefined for a non-object, so 'no style' stays distinguishable", () => {
    expect(sanitizeSubtitleStyle(undefined)).toBeUndefined();
    expect(sanitizeSubtitleStyle(null)).toBeUndefined();
    expect(sanitizeSubtitleStyle("bottom")).toBeUndefined();
    expect(sanitizeSubtitleStyle(42)).toBeUndefined();
  });

  it("falls back per field rather than discarding the whole object", () => {
    const s = sanitizeSubtitleStyle({
      fontFamily: "comic sans",
      color: "not-a-colour",
      alignment: "diagonal",
      animation: "explode",
      fontSizePct: "huge",
    });
    expect(s).toMatchObject({
      fontFamily: DEFAULT_SUBTITLE_STYLE.fontFamily,
      color: DEFAULT_SUBTITLE_STYLE.color,
      alignment: DEFAULT_SUBTITLE_STYLE.alignment,
      animation: DEFAULT_SUBTITLE_STYLE.animation,
      fontSizePct: DEFAULT_SUBTITLE_STYLE.fontSizePct,
    });
  });

  it("whitelists the four fonts, three alignments and the animations", () => {
    expect(sanitizeSubtitleStyle({ fontFamily: "poppins" })?.fontFamily).toBe("poppins");
    expect(sanitizeSubtitleStyle({ fontFamily: "inter" })?.fontFamily).toBe("inter");
    expect(sanitizeSubtitleStyle({ fontFamily: "caveat" })?.fontFamily).toBe("arial");
    expect(sanitizeSubtitleStyle({ alignment: "top" })?.alignment).toBe("top");
    expect(sanitizeSubtitleStyle({ animation: "slide" })?.animation).toBe("slide");
  });

  it("clamps the size to the PRD's 12-72px range", () => {
    expect(sanitizeSubtitleStyle({ fontSizePct: 0.1 })?.fontSizePct).toBeCloseTo(
      SUBTITLE_FONT_PCT_MIN,
      6
    );
    expect(sanitizeSubtitleStyle({ fontSizePct: 99 })?.fontSizePct).toBeCloseTo(
      SUBTITLE_FONT_PCT_MAX,
      6
    );
    expect(fontPctToSliderPx(sanitizeSubtitleStyle({ fontSizePct: 99 })!.fontSizePct!)).toBe(72);
    expect(fontPctToSliderPx(sanitizeSubtitleStyle({ fontSizePct: 0 })!.fontSizePct!)).toBe(12);
  });

  it("normalizes hex colours and widens the #RGB shorthand", () => {
    expect(sanitizeSubtitleStyle({ color: "#abc" })?.color).toBe("#AABBCC");
    expect(sanitizeSubtitleStyle({ color: "  #8a76fc " })?.color).toBe("#8A76FC");
    expect(sanitizeSubtitleStyle({ color: "#12345" })?.color).toBe(DEFAULT_SUBTITLE_STYLE.color);
  });

  it("treats a background box as opt-in", () => {
    expect(sanitizeSubtitleStyle({})?.backgroundColor).toBeUndefined();
    expect(sanitizeSubtitleStyle({ backgroundColor: "nope" })?.backgroundColor).toBeUndefined();
    const boxed = sanitizeSubtitleStyle({ backgroundColor: "#000000", backgroundOpacity: 2 });
    expect(boxed?.backgroundColor).toBe("#000000");
    expect(boxed?.backgroundOpacity).toBe(1);
  });
});

describe("toAssStyleLine for explicit styles", () => {
  it("maps alignment to the ASS numpad values", () => {
    const at = (alignment: SubtitleStyle["alignment"]) =>
      toAssStyleLine({ ...DEFAULT_SUBTITLE_STYLE, alignment }, 1920, 1080).split(",");
    expect(at("bottom")[18]).toBe("2");
    expect(at("middle")[18]).toBe("5");
    expect(at("top")[18]).toBe("8");
  });

  it("uses BorderStyle 3 + BackColour for a background box, not Outline", () => {
    const fields = toAssStyleLine(
      { ...DEFAULT_SUBTITLE_STYLE, backgroundColor: "#8A76FC", backgroundOpacity: 0.5 },
      1920,
      1080
    ).split(",");
    expect(fields[15]).toBe("3"); // BorderStyle
    expect(fields[6]).toBe(hexToAssColour("#8A76FC", 0.5)); // BackColour
    // Without a box master's BorderStyle 1 is kept.
    expect(toAssStyleLine(DEFAULT_SUBTITLE_STYLE, 1920, 1080).split(",")[15]).toBe("1");
  });

  it("writes the chosen font family name", () => {
    expect(toAssStyleLine({ fontFamily: "poppins" }, 1920, 1080).split(",")[1]).toBe("Poppins");
    expect(toAssStyleLine({ fontFamily: "inter" }, 1920, 1080).split(",")[1]).toBe("Inter");
    expect(toAssStyleLine({ fontFamily: "roboto" }, 1920, 1080).split(",")[1]).toBe("Roboto");
  });

  it("writes the text colour in ASS byte order", () => {
    expect(toAssStyleLine({ color: "#FF0000" }, 1920, 1080).split(",")[3]).toBe("&H000000FF");
  });
});

describe("toAssOverrideTags", () => {
  it("emits a fade tag", () => {
    expect(toAssOverrideTags({ animation: "fade" }, 1920, 1080)).toBe("{\\fad(200,200)}");
  });

  it("emits a scale-pulse for pop", () => {
    expect(toAssOverrideTags({ animation: "pop" }, 1920, 1080)).toBe(
      "{\\t(0,150,\\fscx110\\fscy110)\\t(150,300,\\fscx100\\fscy100)}"
    );
  });

  it("slides to the anchor the Style: line would have used", () => {
    const m = subtitleMetrics({ animation: "slide" }, 1080);
    const bottom = toAssOverrideTags({ animation: "slide", alignment: "bottom" }, 1920, 1080);
    expect(bottom).toBe(
      `{\\move(960,${1080 - m.marginVPx + Math.round(m.fontPx * 0.8)},960,${1080 - m.marginVPx},0,250)}`
    );
    const top = toAssOverrideTags({ animation: "slide", alignment: "top" }, 1920, 1080);
    expect(top).toContain(`,960,${m.marginVPx},0,250)`);
  });
});

describe("toCssStyle", () => {
  it("agrees with the ASS mapping about size once scaled to the preview box", () => {
    // A 400px-tall preview of a 1080p frame: the CSS px must be the ASS px
    // scaled by 400/1080, which is what makes the preview a true miniature.
    const css = toCssStyle(DEFAULT_SUBTITLE_STYLE, 1080, 400);
    const assPx = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, 1080).fontPx;
    expect(css.text.fontSize).toBe(`${assPx * (400 / 1080)}px`);
  });

  it("returns frame-scale metrics when no rendered height is given", () => {
    const css = toCssStyle(DEFAULT_SUBTITLE_STYLE, 1080);
    expect(css.text.fontSize).toBe("54px");
  });

  it("positions by alignment", () => {
    expect(toCssStyle({ alignment: "bottom" }, 1080, 400).container.bottom).toBeDefined();
    expect(toCssStyle({ alignment: "top" }, 1080, 400).container.top).toBeDefined();
    expect(toCssStyle({ alignment: "middle" }, 1080, 400).container.top).toBe("50%");
  });

  it("draws no background box by default, matching the burn-in", () => {
    expect(toCssStyle(DEFAULT_SUBTITLE_STYLE, 1080, 400).text.backgroundColor).toBeUndefined();
    expect(
      toCssStyle({ backgroundColor: "#000000", backgroundOpacity: 0.7 }, 1080, 400).text
        .backgroundColor
    ).toBe("rgba(0, 0, 0, 0.7)");
  });

  it("strokes the outline outside the glyph", () => {
    const css = toCssStyle(DEFAULT_SUBTITLE_STYLE, 1080, 1080);
    expect(css.text.WebkitTextStrokeWidth).toBe("3px");
    expect(css.text.paintOrder).toBe("stroke fill");
    expect(toCssStyle({ outlineWidth: 0 }, 1080, 1080).text.WebkitTextStrokeWidth).toBeUndefined();
  });
});

describe("exportFrameHeight", () => {
  it("mirrors computeTargetSizeForRatio for the ratios the editor offers", () => {
    expect(exportFrameHeight(16 / 9, "1080p")).toBe(1080);
    expect(exportFrameHeight(16 / 9, "720p")).toBe(720);
    expect(exportFrameHeight(9 / 16, "1080p")).toBe(1920);
    expect(exportFrameHeight(1, "1080p")).toBe(1920);
    expect(exportFrameHeight(1, "720p")).toBe(960);
    expect(exportFrameHeight(4 / 3, "1080p")).toBe(1440);
  });

  it("falls back to 16:9 on a nonsense ratio", () => {
    expect(exportFrameHeight(0, "1080p")).toBe(1080);
    expect(exportFrameHeight(Number.NaN, "1080p")).toBe(1080);
  });

  it("always returns an even dimension", () => {
    for (const ratio of [16 / 9, 4 / 3, 1, 9 / 16, 2.35, 0.8]) {
      expect(exportFrameHeight(ratio, "1080p") % 2).toBe(0);
      expect(exportFrameHeight(ratio, "720p") % 2).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Per-cue fontSizePct override (Task-00061)                                  */
/* -------------------------------------------------------------------------- */

describe("subtitleMetrics — cueFontSizePct override", () => {
  const FRAME_H = 1080;

  it("uses the cue override when provided instead of the style value", () => {
    const styleMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H);
    const cueMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, SUBTITLE_FONT_PCT_MIN);
    // The cue override requests the minimum size — must be smaller than default.
    expect(cueMetrics.fontPx).toBeLessThan(styleMetrics.fontPx);
  });

  it("produces the same fontPx whether passed via style or as cueFontSizePct", () => {
    const pct = 3.5; // arbitrary value within range
    const viaStyle = subtitleMetrics({ fontSizePct: pct }, FRAME_H);
    const viaOverride = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, pct);
    expect(viaOverride.fontPx).toBe(viaStyle.fontPx);
  });

  it("keeps margin/outline/shadow unchanged by a cue override", () => {
    const base = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H);
    const overridden = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, SUBTITLE_FONT_PCT_MIN);
    // Only fontPx differs — the layout metrics are from the style, not the cue.
    expect(overridden.marginVPx).toBe(base.marginVPx);
    expect(overridden.marginHPx).toBe(base.marginHPx);
  });

  it("clamps the cue override at SUBTITLE_FONT_PCT_MIN", () => {
    const tinyMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, 0.001);
    const minMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, SUBTITLE_FONT_PCT_MIN);
    expect(tinyMetrics.fontPx).toBe(minMetrics.fontPx);
  });

  it("clamps the cue override at SUBTITLE_FONT_PCT_MAX", () => {
    const hugeMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, 9999);
    const maxMetrics = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, SUBTITLE_FONT_PCT_MAX);
    expect(hugeMetrics.fontPx).toBe(maxMetrics.fontPx);
  });

  it("returns smaller fontPx CSS when cueFontSizePct < style fontSizePct", () => {
    const base = toCssStyle(DEFAULT_SUBTITLE_STYLE, FRAME_H, FRAME_H);
    const smaller = toCssStyle(DEFAULT_SUBTITLE_STYLE, FRAME_H, FRAME_H, {
      cueFontSizePct: SUBTITLE_FONT_PCT_MIN,
    });
    const basePx = parseFloat(base.text.fontSize as string);
    const smallerPx = parseFloat(smaller.text.fontSize as string);
    expect(smallerPx).toBeLessThan(basePx);
  });

  it("produces the same CSS fontSize as subtitleMetrics when cueFontSizePct is set", () => {
    const pct = 3.0;
    const m = subtitleMetrics(DEFAULT_SUBTITLE_STYLE, FRAME_H, pct);
    const css = toCssStyle(DEFAULT_SUBTITLE_STYLE, FRAME_H, FRAME_H, { cueFontSizePct: pct });
    // renderedHeight === frameHeight → scale = 1, so CSS px === metric px.
    expect(css.text.fontSize).toBe(`${m.fontPx}px`);
  });

  it("toCssStyle without cueFontSizePct is byte-identical to the pre-Task-61 call", () => {
    const legacy = toCssStyle(DEFAULT_SUBTITLE_STYLE, FRAME_H, FRAME_H);
    const noOverride = toCssStyle(DEFAULT_SUBTITLE_STYLE, FRAME_H, FRAME_H, {});
    expect(legacy).toEqual(noOverride);
  });
});

