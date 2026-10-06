// The languages the subtitle feature offers, per PRD §6.6.
//
// Pure data + lookups. No env, no network — the picker, the generation route and
// the translation route all read the same table so a code can never mean one
// thing in the UI and another on the wire.

import type { SttModel, SubtitleLanguage } from "./types";

/**
 * Sentinel the client sends when it wants the provider to detect the language
 * itself. The worker turns this into Deepgram's `detect_language=true` rather
 * than an explicit `language=` parameter.
 *
 * This is what `useSubtitles.ts` has always sent and what existing tracks are
 * stored under, so it stays valid alongside the real BCP-47 codes below. It is
 * NOT a member of `SUBTITLE_LANGUAGES` — you cannot translate *into* "detect".
 */
export const AUTO_DETECT_LANGUAGE = "multi";

/** The model every language used before PR 5, and still the default. */
export const DEFAULT_STT_MODEL: SttModel = "nova-2";

/**
 * Whether right-to-left subtitles have been confirmed to RENDER correctly.
 *
 * THIS IS A SEPARATE QUESTION FROM TRANSCRIPTION, and it is the one that is
 * still open. Deepgram covers Arabic (see the table below), so we can now
 * *produce* Arabic cues — but producing them is useless if they come out
 * reversed, disconnected or as boxes in the burned-in video, and that has not
 * been checked on a real render.
 *
 * Two things would have to hold, and neither was testable while writing PR 5
 * (no ffmpeg locally, no container, no sample audio):
 *   1. the preview must lay the text out RTL — `toCssStyle` sets `direction`
 *      from this, which is ordinary CSS and the low-risk half; and
 *   2. libass (ffmpeg's `subtitles` filter) must reorder the bidirectional text
 *      and shape the Arabic glyphs. libass does this through FriBidi and
 *      HarfBuzz, but only when it was BUILT with them, and the container's
 *      ffmpeg build has not been inspected. A build without them renders Arabic
 *      as isolated, left-to-right letterforms — legible-looking in a log,
 *      wrong on screen.
 *
 * So the whole RTL path is implemented and wired, and switched OFF here.
 * `isSttOffered` and `isTranslationTarget` both consult this, so no RTL language
 * reaches either picker until someone flips this after checking a real 1080p
 * export with real Arabic text. Shipping a language that silently renders
 * garbage is worse than not offering it — the same rule that keeps a language
 * with no STT coverage out of the picker.
 */
export const RTL_RENDERING_VERIFIED = false;

/**
 * The seven PRD languages, in picker order (English first, then the rest by
 * PRD §6.6's own ordering).
 *
 * ABOUT `stt` AND `sttModel`
 * --------------------------
 * `documented` means Deepgram's model matrix lists the language for the model in
 * `sttModel`. It does **not** mean anyone has pushed real audio through the
 * pipeline and read the cues back — see the note on `SttCoverage` in ./types.
 *
 * PR 5 checked all seven against Deepgram's current matrix. Six are on `nova-2`,
 * which is what the worker has always sent, so nothing about their requests
 * changes. Arabic is the exception and the reason `sttModel` exists at all:
 *
 *   **nova-2 does not support Arabic.** It is absent from nova-2's language
 *   list. Arabic is covered by **nova-3**, which added it as its first
 *   right-to-left language across 17 regional variants (`ar`, `ar-EG`, `ar-SA`,
 *   …). This resolves the TODO PR 1 left here.
 *
 * Of the two options the PR offered — route the language to a different Deepgram
 * model, or fall back to OpenAI Whisper — routing to nova-3 was chosen: it is
 * the same vendor, the same endpoint, the same auth and the same response shape,
 * so it costs one parameter in the worker instead of a second transcription
 * pipeline with its own cue-clustering. Whisper would have meant re-implementing
 * `cuesFromDeepgramWords` against a different word-timing format.
 *
 * Arabic still does not appear in any picker, because `RTL_RENDERING_VERIFIED`
 * is false. That gate is about RENDERING, not coverage.
 */
export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
  {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
  {
    code: "es",
    label: "Spanish",
    nativeLabel: "Español",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
  {
    code: "fr",
    label: "French",
    nativeLabel: "Français",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
  {
    code: "de",
    label: "German",
    nativeLabel: "Deutsch",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
  // Covered by nova-3 only — see the block comment above. Held out of the
  // pickers by RTL_RENDERING_VERIFIED, not by its STT coverage.
  {
    code: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    isRtl: true,
    stt: "documented",
    sttModel: "nova-3",
  },
  {
    code: "ja",
    label: "Japanese",
    nativeLabel: "日本語",
    isRtl: false,
    stt: "documented",
    sttModel: "nova-2",
  },
];

/** Look up a language by BCP-47 code. Case-insensitive; `undefined` if unknown. */
export function findLanguage(code: string): SubtitleLanguage | undefined {
  const needle = code.trim().toLowerCase();
  return SUBTITLE_LANGUAGES.find((lang) => lang.code === needle);
}

/** Whether `code` is one of the seven supported languages. */
export function isSupportedLanguage(code: string): boolean {
  return findLanguage(code) !== undefined;
}

/** Whether `code` asks the provider to detect the language itself. */
export function isAutoDetect(code: string): boolean {
  return code.trim().toLowerCase() === AUTO_DETECT_LANGUAGE;
}

/**
 * Whether we are confident this language will DISPLAY correctly, in the preview
 * and in the burn-in. Left-to-right scripts always qualify; a right-to-left one
 * waits on `RTL_RENDERING_VERIFIED`.
 */
export function isRenderable(code: string): boolean {
  if (isAutoDetect(code)) {
    return true;
  }
  const lang = findLanguage(code);
  if (!lang) {
    return false;
  }
  return lang.isRtl ? RTL_RENDERING_VERIFIED : true;
}

/**
 * Whether this language may be offered for *generation*. Auto-detect always
 * qualifies (it is what ships today); a real language needs both documented STT
 * coverage and renderable output.
 */
export function isSttOffered(code: string): boolean {
  if (isAutoDetect(code)) {
    return true;
  }
  return findLanguage(code)?.stt === "documented" && isRenderable(code);
}

/**
 * Whether this language may be offered as a *translation target*.
 *
 * Deliberately independent of STT: translating INTO a language never touches
 * speech-to-text, so a language with no transcription coverage could still be a
 * legitimate target. Rendering is the shared requirement — a translation that
 * burns in as garbage is exactly as broken as a transcription that does.
 * Auto-detect is excluded: "detect" is not a language you can translate into.
 */
export function isTranslationTarget(code: string): boolean {
  return !isAutoDetect(code) && isSupportedLanguage(code) && isRenderable(code);
}

/** Whether a language's script runs right to left (Arabic, of the seven). */
export function isRtlLanguage(code: string): boolean {
  const base = String(code || "").trim().toLowerCase().split("-")[0];
  return findLanguage(code)?.isRtl ?? findLanguage(base)?.isRtl ?? false;
}

/**
 * The Deepgram model to transcribe `code` with.
 *
 * Auto-detect and anything unrecognised get the default, so the request the
 * worker builds is unchanged from before this feature for every path that
 * existed then. The worker keeps its own copy of this rule (it cannot import
 * from `app/`); languages.test.ts pins the two together.
 */
export function sttModelFor(code: string): SttModel {
  if (isAutoDetect(code)) {
    return DEFAULT_STT_MODEL;
  }
  return findLanguage(code)?.sttModel ?? DEFAULT_STT_MODEL;
}

/**
 * Coerce a client-supplied language to something safe to send to the worker.
 * Anything unrecognised falls back to auto-detect — which is exactly today's
 * behaviour, so an old client that sends nothing keeps working.
 */
export function normalizeLanguage(raw: unknown): string {
  if (typeof raw !== "string") {
    return AUTO_DETECT_LANGUAGE;
  }
  const code = raw.trim().toLowerCase();
  if (!code || isAutoDetect(code)) {
    return AUTO_DETECT_LANGUAGE;
  }
  return isSupportedLanguage(code) ? code : AUTO_DETECT_LANGUAGE;
}

/** Display name for a code, falling back to the code itself. */
export function languageLabel(code: string): string {
  if (isAutoDetect(code)) {
    return "Auto-detect";
  }
  return findLanguage(code)?.label ?? code;
}
