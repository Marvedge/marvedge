import { describe, expect, it } from "vitest";

import {
  AUTO_DETECT_LANGUAGE,
  DEFAULT_STT_MODEL,
  RTL_RENDERING_VERIFIED,
  SUBTITLE_LANGUAGES,
  findLanguage,
  isAutoDetect,
  isRenderable,
  isRtlLanguage,
  isSttOffered,
  isSupportedLanguage,
  isTranslationTarget,
  languageLabel,
  normalizeLanguage,
  sttModelFor,
} from "./languages";

describe("the language table", () => {
  it("carries the seven PRD languages", () => {
    expect(SUBTITLE_LANGUAGES.map((l) => l.code)).toEqual([
      "en",
      "hi",
      "es",
      "fr",
      "de",
      "ar",
      "ja",
    ]);
  });

  it("routes Arabic to nova-3 and leaves every other language on nova-2", () => {
    // nova-2 has no Arabic coverage; nova-3 added it as its first RTL language.
    // This is the resolution of PR 1's TODO — see the block comment in
    // languages.ts. If this flips, cloudrun-worker/server.js must move with it.
    expect(sttModelFor("ar")).toBe("nova-3");
    for (const code of ["en", "hi", "es", "fr", "de", "ja"]) {
      expect(sttModelFor(code), code).toBe("nova-2");
    }
  });

  it("keeps auto-detect and unknown codes on the model the worker always used", () => {
    // The request built for an existing path must be unchanged by this feature.
    expect(sttModelFor(AUTO_DETECT_LANGUAGE)).toBe(DEFAULT_STT_MODEL);
    expect(sttModelFor("klingon")).toBe(DEFAULT_STT_MODEL);
    expect(DEFAULT_STT_MODEL).toBe("nova-2");
  });

  it("marks only Arabic as right-to-left", () => {
    expect(isRtlLanguage("ar")).toBe(true);
    expect(isRtlLanguage("ar-EG")).toBe(true);
    expect(isRtlLanguage("ar-SA")).toBe(true);
    for (const code of ["en", "hi", "es", "fr", "de", "ja"]) {
      expect(isRtlLanguage(code), code).toBe(false);
    }
  });
});

describe("lookups", () => {
  it("finds languages case-insensitively and ignores surrounding space", () => {
    expect(findLanguage("EN")?.label).toBe("English");
    expect(findLanguage("  ja  ")?.label).toBe("Japanese");
    expect(findLanguage("xx")).toBeUndefined();
  });

  it("recognises the auto-detect sentinel", () => {
    expect(isAutoDetect("multi")).toBe(true);
    expect(isAutoDetect("MULTI")).toBe(true);
    expect(isAutoDetect("en")).toBe(false);
    expect(isSupportedLanguage("multi")).toBe(false);
  });

  it("labels codes, including auto-detect", () => {
    expect(languageLabel("multi")).toBe("Auto-detect");
    expect(languageLabel("de")).toBe("German");
    expect(languageLabel("xx")).toBe("xx");
  });
});

describe("normalizeLanguage", () => {
  it("passes supported codes through", () => {
    expect(normalizeLanguage("es")).toBe("es");
    expect(normalizeLanguage(" JA ")).toBe("ja");
  });

  it("falls back to auto-detect for anything else, preserving today's behaviour", () => {
    expect(normalizeLanguage(undefined)).toBe(AUTO_DETECT_LANGUAGE);
    expect(normalizeLanguage(null)).toBe(AUTO_DETECT_LANGUAGE);
    expect(normalizeLanguage("")).toBe(AUTO_DETECT_LANGUAGE);
    expect(normalizeLanguage("klingon")).toBe(AUTO_DETECT_LANGUAGE);
    expect(normalizeLanguage(42)).toBe(AUTO_DETECT_LANGUAGE);
  });
});

describe("what may be offered in a picker", () => {
  it("offers auto-detect, which is what ships today", () => {
    expect(isSttOffered(AUTO_DETECT_LANGUAGE)).toBe(true);
    expect(isRenderable(AUTO_DETECT_LANGUAGE)).toBe(true);
  });

  it("offers every documented left-to-right language for generation", () => {
    for (const code of ["en", "hi", "es", "fr", "de", "ja"]) {
      expect(isSttOffered(code), code).toBe(true);
      expect(isTranslationTarget(code), code).toBe(true);
    }
  });

  it("never offers auto-detect as a translation target", () => {
    // "Detect" is not a language you can translate into.
    expect(isTranslationTarget(AUTO_DETECT_LANGUAGE)).toBe(false);
  });

  it("rejects unknown codes everywhere", () => {
    expect(isSttOffered("klingon")).toBe(false);
    expect(isTranslationTarget("klingon")).toBe(false);
    expect(isRenderable("klingon")).toBe(false);
  });

  /**
   * Arabic's two axes are deliberately independent: Deepgram covers it (on
   * nova-3), but nothing has confirmed it RENDERS correctly in the preview and
   * the burn-in. Until it does, it is offered nowhere.
   */
  it("holds Arabic out of both pickers while RTL rendering is unverified", () => {
    expect(findLanguage("ar")?.stt).toBe("documented");
    expect(sttModelFor("ar")).toBe("nova-3");

    if (RTL_RENDERING_VERIFIED) {
      expect(isRenderable("ar")).toBe(true);
      expect(isSttOffered("ar")).toBe(true);
      expect(isTranslationTarget("ar")).toBe(true);
    } else {
      expect(isRenderable("ar")).toBe(false);
      expect(isSttOffered("ar")).toBe(false);
      expect(isTranslationTarget("ar")).toBe(false);
    }
  });

  it("still normalizes Arabic, so a direct API call is handled rather than mangled", () => {
    // Not offered in the UI, but a supported code: it must reach the worker as
    // "ar" (and therefore nova-3), not be silently rewritten to auto-detect.
    expect(normalizeLanguage("ar")).toBe("ar");
    expect(isSupportedLanguage("ar")).toBe(true);
  });
});
