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
  words?: SubtitleWord[];
};
