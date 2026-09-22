// Public surface of the subtitle library. Import from here rather than reaching
// into the individual modules, so the internal split can change without a rename
// sweep across the app.
//
// Everything behind this barrel is isomorphic and pure: no fs, no env beyond the
// flags module, no DOM, no node-only API. One code path has to serve a React
// component, a route handler and (serialized) the render worker.

export {
  MIN_CUE_SECONDS,
  cuesToSearchText,
  deleteCue,
  findActiveCue,
  insertCue,
  mergeCues,
  normalizeCues,
  readCueList,
  splitCueAt,
  type NormalizeCuesOptions,
} from "./cues";

export {
  SUBTITLE_FORMATS,
  SUBTITLE_FORMAT_MIME,
  cuesToSrt,
  cuesToTxt,
  cuesToVtt,
  formatSrtTimestamp,
  formatVttTimestamp,
  isSubtitleFormat,
  parseSrt,
  parseSubtitleFile,
  parseVtt,
  serializeCues,
  subtitleFileName,
  type SubtitleFormat,
} from "./formats";

export { isSubtitleEditorEnabled, isSubtitleTranslateEnabled } from "./flags";

export {
  MAX_SUBTITLE_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  UPLOAD_FORMAT_HINT,
  UPLOAD_VIDEO_ACCEPT,
  UPLOAD_VIDEO_EXTENSIONS,
  fileExtension,
  formatBytes,
  formatDuration,
  isVideoUploadKind,
  subtitleWorkerTimeoutMs,
  validateSubtitleDuration,
  validateVideoUpload,
  type UploadCandidate,
  type UploadValidation,
} from "./limits";

export {
  DEFAULT_SUBTITLE_STYLE,
  LEGACY_MARGIN_H_PX,
  SUBTITLE_ALIGNMENTS,
  SUBTITLE_ANIMATIONS,
  SUBTITLE_ANIMATION_KEYFRAMES,
  SUBTITLE_BOX_PADDING_BASE_RATIO,
  SUBTITLE_BOX_PADDING_MIN_PX,
  SUBTITLE_CSS_FONT_FAMILIES,
  SUBTITLE_FONTS,
  SUBTITLE_FONT_LABELS,
  SUBTITLE_FONT_NAMES,
  SUBTITLE_FONT_PCT_MAX,
  SUBTITLE_FONT_PCT_MIN,
  SUBTITLE_FONT_PX_MAX,
  SUBTITLE_FONT_PX_MIN,
  SUBTITLE_MARGIN_H_MIN_PX,
  SUBTITLE_MARGIN_H_RATIO,
  SUBTITLE_SIZE_REFERENCE_HEIGHT,
  assColourToHex,
  computeBoxPaddingPx,
  computeMarginHPx,
  exportFrameHeight,
  fontPctToSliderPx,
  hexToAssColour,
  hexToRgba,
  isSubtitleAlignment,
  isSubtitleAnimation,
  isSubtitleFont,
  sanitizeSubtitleStyle,
  sliderPxToFontPct,
  subtitleMetrics,
  toAssOverrideTags,
  toAssStyleLine,
  toCssAnimation,
  toCssStyle,
  type DefaultSubtitleStyle,
  type SubtitleCssStyle,
  type SubtitleFont,
  type SubtitleMetrics,
} from "./style";

export {
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

export { isSubtitleTranslateAllowed } from "./access";

export {
  TRANSLATION_BATCH_SIZE,
  TRANSLATION_SYSTEM_PROMPT,
  TranslationAlignmentError,
  applyTranslations,
  buildTranslationBatches,
  buildTranslationPrompt,
  parseTranslationBatch,
  toTranslationSegments,
  type TranslationSegment,
} from "./translate";

export type {
  SttCoverage,
  SttModel,
  SubtitleAlignment,
  SubtitleAnimation,
  SubtitleCue,
  SubtitleLanguage,
  SubtitleStyle,
  SubtitleTrack,
  SubtitleTrackSource,
  SubtitleTrackStatus,
} from "./types";
