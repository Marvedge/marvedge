import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUBTITLE_STYLE,
  hexToAssColour,
  sanitizeSubtitleStyle,
  toAssOverrideTags,
  toAssStyleLine,
} from "./style";
import type { SubtitleStyle } from "./types";

/**
 * THE ANTI-DRIFT TEST.
 *
 * app/lib/subtitles/style.ts is the source of truth for what a subtitle looks
 * like, and the editor's preview reads it directly. The renderer cannot:
 * cloudrun-worker/ is a standalone package deployed from its own directory, with
 * its own package.json, and nothing in it can import from `app/`. So the ASS
 * mapping exists twice — a TypeScript original and a JavaScript port.
 *
 * Two independent implementations that "look similar" is the exact failure this
 * whole PR exists to fix (see Subtitle-Implementation-Plan.md §2.3: the preview
 * and the burn-in had already silently diverged). Rather than trusting a comment
 * to keep them together, this suite loads the REAL worker file and asserts the
 * two produce identical output across a matrix of styles and frame heights.
 *
 * If this fails, the port and the original have drifted: fix whichever is wrong.
 * Do not relax the assertion — a passing test here is the only mechanical reason
 * to believe the preview shows what the export will render.
 */

const require_ = createRequire(import.meta.url);
const worker = require_(path.join(process.cwd(), "cloudrun-worker", "render.js")) as {
  writeAssSubtitles: (
    tempDir: string,
    cues: { start: number; end: number; text: string }[],
    w: number,
    h: number,
    style?: unknown,
    language?: unknown
  ) => string;
  subtitleAssStyleLine: (style: unknown, w: number, h: number) => string;
  subtitleAssOverrideTags: (style: unknown, w: number, h: number) => string;
  subtitleAssColour: (hex: string, opacity: number) => string;
  isRtlSubtitleLanguage: (language: unknown) => boolean;
};

const NEWLINE = String.fromCharCode(10);
/** U+202B RIGHT-TO-LEFT EMBEDDING and U+202C POP DIRECTIONAL FORMATTING. */
const RLE = String.fromCharCode(0x202b);
const PDF = String.fromCharCode(0x202c);

/** Every frame size computeTargetSizeForRatio() can produce, plus real cropped targets. */
const FRAMES: [number, number][] = [
  [1920, 1080],
  [1280, 720],
  [1080, 1920],
  [404, 720],
  [1920, 1920],
  [960, 960],
  [1920, 1440],
  [854, 480],
  [640, 360],
  [3840, 2160],
];

/** A spread of styles, including every enum value and both box states. */
const STYLES: SubtitleStyle[] = [
  DEFAULT_SUBTITLE_STYLE,
  { ...DEFAULT_SUBTITLE_STYLE, fontFamily: "roboto" },
  { ...DEFAULT_SUBTITLE_STYLE, fontFamily: "poppins", alignment: "top" },
  { ...DEFAULT_SUBTITLE_STYLE, fontFamily: "inter", alignment: "middle" },
  { ...DEFAULT_SUBTITLE_STYLE, color: "#8A76FC", outlineColor: "#2D1F61" },
  { ...DEFAULT_SUBTITLE_STYLE, fontSizePct: (72 / 1080) * 100 },
  { ...DEFAULT_SUBTITLE_STYLE, fontSizePct: (12 / 1080) * 100 },
  { ...DEFAULT_SUBTITLE_STYLE, outlineWidth: 0, shadowDepth: 0.08 },
  { ...DEFAULT_SUBTITLE_STYLE, backgroundColor: "#000000", backgroundOpacity: 0.7 },
  { ...DEFAULT_SUBTITLE_STYLE, backgroundColor: "#F6F3FF", backgroundOpacity: 0.25 },
  { ...DEFAULT_SUBTITLE_STYLE, animation: "fade" },
  { ...DEFAULT_SUBTITLE_STYLE, animation: "pop" },
  { ...DEFAULT_SUBTITLE_STYLE, animation: "slide" },
  { ...DEFAULT_SUBTITLE_STYLE, animation: "slide", alignment: "top" },
  { ...DEFAULT_SUBTITLE_STYLE, animation: "slide", alignment: "middle" },
];

describe("worker / library ASS parity", () => {
  it("produces the same Style: line for every style at every frame size", () => {
    for (const style of STYLES) {
      for (const [w, h] of FRAMES) {
        expect(
          worker.subtitleAssStyleLine(style, w, h),
          `${JSON.stringify(style)} @ ${w}x${h}`
        ).toBe(toAssStyleLine(style, w, h));
      }
    }
  });

  it("produces the same override tags for every animation at every frame size", () => {
    for (const style of STYLES) {
      for (const [w, h] of FRAMES) {
        expect(
          worker.subtitleAssOverrideTags(style, w, h),
          `${JSON.stringify(style)} @ ${w}x${h}`
        ).toBe(toAssOverrideTags(style, w, h));
      }
    }
  });

  it("encodes colours identically, including the inverted alpha", () => {
    for (const hex of ["#FFFFFF", "#000000", "#FF0000", "#0000FF", "#8A76FC", "#A594F9"]) {
      for (const opacity of [0, 0.25, 0.5, 0.61, 1]) {
        expect(worker.subtitleAssColour(hex, opacity)).toBe(hexToAssColour(hex, opacity));
      }
    }
  });

  it("agrees on styles that came through the sanitizer", () => {
    const raw = { fontFamily: "poppins", color: "#abc", alignment: "top", fontSizePct: 999 };
    const style = sanitizeSubtitleStyle(raw);
    for (const [w, h] of FRAMES) {
      expect(worker.subtitleAssStyleLine(style, w, h)).toBe(toAssStyleLine(style, w, h));
    }
  });
});

describe("worker byte-identity with master", () => {
  const CUES = [
    { start: 0, end: 1.5, text: "Hello" },
    { start: 1.5, end: 3.25, text: "there\nfriend" },
  ];

  /** master's writeAssSubtitles(), transcribed independently. */
  function masterAss(cues: typeof CUES, w: number, h: number): string {
    const fontSize = Math.max(20, Math.min(58, Math.round(h * 0.05)));
    const marginV = Math.max(20, Math.min(96, Math.round(h * 0.06)));
    const outline = Math.max(1, Math.min(4, Math.round(fontSize / 16)));
    const formatAssTime = (seconds: number): string => {
      const s = Math.max(0, seconds);
      const hh = Math.floor(s / 3600);
      const mm = Math.floor((s % 3600) / 60);
      const ss = Math.floor(s % 60);
      const cs = Math.floor((s - Math.floor(s)) * 100);
      return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    };
    const escape = (text: string): string =>
      String(text || "")
        .replace(/\r\n|\r|\n/g, "\\N")
        .replace(/{/g, "(")
        .replace(/}/g, ")");
    const header = [
      "[Script Info]",
      "ScriptType: v4.00+",
      `PlayResX: ${w}`,
      `PlayResY: ${h}`,
      "WrapStyle: 2",
      "ScaledBorderAndShadow: yes",
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},0,2,60,60,${marginV},1`,
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ].join("\n");
    const lines = cues.map(
      (c) =>
        `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${escape(c.text)}`
    );
    return `${header}\n${lines.join("\n")}\n`;
  }

  /**
   * THE MOST IMPORTANT ASSERTION IN THIS PR. A demo with no style config must
   * produce the exact bytes master produces — not "equivalent", not "close".
   */
  it("writes a byte-identical .ass file when no style is passed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-parity-"));
    try {
      for (const [w, h] of FRAMES) {
        for (const style of [undefined, null]) {
          const written = fs.readFileSync(worker.writeAssSubtitles(dir, CUES, w, h, style), "utf8");
          expect(written, `${w}x${h} style=${String(style)}`).toBe(masterAss(CUES, w, h));
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the default style's file identically to the no-style file on landscape frames", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-parity-"));
    try {
      for (const [w, h] of FRAMES.filter(([w]) => w >= 1200)) {
        const bare = fs.readFileSync(worker.writeAssSubtitles(dir, CUES, w, h), "utf8");
        const defaulted = fs.readFileSync(
          worker.writeAssSubtitles(dir, CUES, w, h, DEFAULT_SUBTITLE_STYLE),
          "utf8"
        );
        expect(defaulted, `${w}x${h}`).toBe(bare);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces identical default style lines between worker and library across all frames including portrait and cropped", () => {
    for (const [w, h] of FRAMES) {
      expect(
        worker.subtitleAssStyleLine(DEFAULT_SUBTITLE_STYLE, w, h),
        `DEFAULT_SUBTITLE_STYLE @ ${w}x${h}`
      ).toBe(toAssStyleLine(DEFAULT_SUBTITLE_STYLE, w, h));
    }
  });

  it("produces identical style lines between worker and library for background box styles across all frames", () => {
    const boxStyles: SubtitleStyle[] = [
      { backgroundColor: "#000000", backgroundOpacity: 0.6 },
      { backgroundColor: "#112233", backgroundOpacity: 0.8, outlineWidth: 0 },
      { backgroundColor: "#FF0000", backgroundOpacity: 1.0, outlineWidth: 0.15, fontSizePct: 6 },
    ];
    for (const [w, h] of FRAMES) {
      for (const style of boxStyles) {
        expect(
          worker.subtitleAssStyleLine(style, w, h),
          `boxStyle @ ${w}x${h} outline=${style.outlineWidth}`
        ).toBe(toAssStyleLine(style, w, h));
      }
    }
  });

  /**
   * SUB PR 5 added a `language` parameter for right-to-left text. Every existing
   * caller passes nothing, so the absent case must stay byte-identical — the
   * assertions above already cover that by calling with five arguments; this
   * pins the LTR language case too, since a demo that picks English must not
   * start emitting bidi marks.
   */
  it("leaves Dialogue text untouched for a left-to-right language", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-parity-"));
    try {
      for (const [w, h] of FRAMES) {
        const bare = fs.readFileSync(worker.writeAssSubtitles(dir, CUES, w, h), "utf8");
        for (const language of [null, undefined, "en", "ja", "multi"]) {
          const withLang = fs.readFileSync(
            worker.writeAssSubtitles(dir, CUES, w, h, null, language),
            "utf8"
          );
          expect(withLang, `${w}x${h} ${String(language)}`).toBe(bare);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("wraps Dialogue text in bidi marks only for a right-to-left language", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-parity-"));
    try {
      const written = fs.readFileSync(
        worker.writeAssSubtitles(dir, CUES, 1920, 1080, null, "ar"),
        "utf8"
      );
      const dialogue = written.split(NEWLINE).filter((l) => l.startsWith("Dialogue:"));
      expect(dialogue).toHaveLength(2);
      for (const line of dialogue) {
        // U+202B … U+202C around the text, after the ASS field separators.
        expect(line).toContain(RLE);
        expect(line).toContain(PDF);
      }
      // A regional variant resolves to the same base language.
      expect(worker.isRtlSubtitleLanguage("ar-EG")).toBe(true);
      expect(worker.isRtlSubtitleLanguage("en")).toBe(false);
      expect(worker.isRtlSubtitleLanguage(null)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prepends override tags to every Dialogue line when an animation is set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sub-parity-"));
    try {
      const written = fs.readFileSync(
        worker.writeAssSubtitles(dir, CUES, 1920, 1080, {
          ...DEFAULT_SUBTITLE_STYLE,
          animation: "fade",
        }),
        "utf8"
      );
      const dialogue = written.split("\n").filter((l) => l.startsWith("Dialogue:"));
      expect(dialogue).toHaveLength(2);
      for (const line of dialogue) {
        expect(line).toContain("{\\fad(200,200)}");
      }
      // The newline escape master applies is untouched by the tag prefix.
      expect(written).toContain("there\\Nfriend");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
