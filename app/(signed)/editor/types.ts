export type TextOverlayItem = {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  startTime: number;
  endTime: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  parentW?: number;
  parentH?: number;
};

export type SubtitleWord = { word: string; start: number; end: number };

export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
  /**
   * Per-cue font-size override (Task-00061): percentage of frame height.
   *
   * Set by `localizeTranslatedCues` when a translated cue's text is
   * significantly longer than the source and the font needs to shrink to fit.
   * Absent on every non-translated and non-resized cue — consumers must fall
   * back to the track-level `subtitleStyle.fontSizePct` when it is undefined.
   */
  fontSizePct?: number;
  words?: SubtitleWord[];
};
