"use client";

import React from "react";

import {
  SUBTITLE_ANIMATION_KEYFRAMES,
  exportFrameHeight,
  isRtlLanguage,
  toCssAnimation,
  toCssStyle,
} from "@/app/lib/subtitles";
import type { SubtitleStyle } from "@/app/lib/subtitles";

interface SubtitleOverlayProps {
  text: string;
  /**
   * The demo's `editing.subtitleStyle`, or `null` when it has never been styled.
   * `null` renders the defaults, which are master's burn-in appearance.
   */
  style?: SubtitleStyle | null;
  /**
   * The active track's language (SUB PR 5). Only used to decide right-to-left
   * layout — RTL follows the script, not a style knob. Absent → left-to-right,
   * which is every demo that predates languages.
   */
  language?: string;
}

/**
 * The live subtitle preview (SUB PR 4 / US-3, PRD §6.5).
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This used to hardcode its own appearance — a 16px white line in a `bg-black/70`
 * box, pinned 24px above the bottom. The export hardcoded a DIFFERENT one: an
 * ASS style with a height-proportional font and an outline, and no box at all.
 * The preview was showing something the render never produced.
 *
 * Both ends now read app/lib/subtitles/style.ts, so "styling changes are
 * reflected in the preview" is structural rather than something two files have
 * to be kept in sync by hand. The visible consequence on an unstyled demo is
 * that the black box disappears and the text gains an outline — the preview
 * moving to match the export, not the export changing. Nothing about the
 * exported file differs.
 *
 * SIZING
 * ------
 * A subtitle's size is a percentage of FRAME height, so px only make sense
 * against a specific frame. The stage is measured, the export frame height is
 * derived from its aspect ratio (`exportFrameHeight`, which mirrors the worker's
 * `computeTargetSizeForRatio`), metrics are resolved at THAT height, and the
 * result is scaled down by `stageHeight / frameHeight`. The preview is therefore
 * a true miniature of the export — including the font clamp, which binds on a
 * tall portrait frame and would otherwise show text 60% too large.
 */
export default function SubtitleOverlay({ text, style, language }: SubtitleOverlayProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ width: 0, height: 0 });

  // The stage has no intrinsic size — it fills the editor's flex column — so its
  // pixel height is only knowable after layout, and it changes with the window,
  // the sidebar and the aspect-ratio control.
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rtl = React.useMemo(() => (language ? isRtlLanguage(language) : false), [language]);

  const css = React.useMemo(() => {
    const ratio = box.height > 0 ? box.width / box.height : 16 / 9;
    const frameHeight = exportFrameHeight(ratio);
    const frameWidth = Math.max(2, 2 * Math.round((frameHeight * ratio) / 2));
    return toCssStyle(style ?? undefined, frameHeight, box.height || undefined, {
      rtl,
      frameWidth,
    });
  }, [style, box.width, box.height, rtl]);

  const animation = React.useMemo(() => toCssAnimation(style ?? undefined), [style]);

  // The measuring box stays mounted with no text so the first cue renders at the
  // right size instead of popping from an unmeasured 16:9 guess.
  return (
    <div ref={stageRef} className="pointer-events-none absolute inset-0 z-40">
      {text ? (
        <>
          <style>{SUBTITLE_ANIMATION_KEYFRAMES}</style>
          <div style={css.container}>
            {/* Keyed on the text so an entrance animation replays per cue rather
                than once per mount. */}
            <div key={text} style={{ ...css.text, maxWidth: "100%", animation }}>
              {text}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
