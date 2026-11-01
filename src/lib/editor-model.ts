export type Lane = "video" | "camera" | "effects" | "text" | "interactions" | "audio";
export type EditorEvent = {
  id: string;
  lane: Lane;
  kind: string;
  name: string;
  start: number;
  duration: number;
  text: string;
  color: string;
  x: number;
  y: number;
  size: number;
  intensity: number;
  easing: string;
  shape: string;
  source?: string;
  sourceOffset?: number;
  peaks?: number[];
  sourceDuration?: number;
};
export type EditorDraft = {
  description: string;
  ratio: string;
  background: string;
  backgroundImage: string;
  frame: string;
  shadow: boolean;
  border: boolean;
  padding: number;
  volume: number;
  muted: boolean;
  font: string;
  fontSize: number;
  align: string;
  captionStyle: string;
  language: string;
  cta: string;
  destination: string;
  gate: string;
  branchOne: string;
  branchOneUrl: string;
  branchTwo: string;
  branchTwoUrl: string;
  scheduleUrl: string;
  events: EditorEvent[];
  hidden: Lane[];
  locked: Lane[];
  watermark?: Watermark;
  playbackSpeed?: number;
};
export const lanes: { id: Lane; name: string }[] = [
  { id: "video", name: "Recording" },
  { id: "camera", name: "Camera & zoom" },
  { id: "effects", name: "Focus effects" },
  { id: "text", name: "Text & captions" },
  { id: "interactions", name: "Interactions" },
  { id: "audio", name: "Audio" },
];
export const effectPresets = [
  "Spotlight",
  "Glow",
  "Border highlight",
  "Pulse",
  "Dim surroundings",
  "Blur surroundings",
  "Magnify",
  "Privacy mask",
];
export const interactionPresets = [
  "Click",
  "Hover",
  "Typing",
  "Scroll",
  "Cursor movement",
  "Page navigation",
  "Pause / wait",
];
export const annotationPresets = [
  "Arrow",
  "Rectangle",
  "Circle",
  "Numbered step",
  "Speech bubble",
  "Tooltip",
  "Connector line",
];
export const transitionPresets = [
  "Fade", "Dissolve", "Blur",
  "Slide left", "Slide right", "Slide up", "Slide down",
  "Wipe left", "Wipe right", "Circle wipe",
  "Zoom in", "Zoom out", "Pop", "Bounce",
];
export const transitionGroups: { name: string; presets: string[] }[] = [
  { name: "Basic", presets: ["Fade", "Dissolve", "Blur"] },
  { name: "Slide", presets: ["Slide left", "Slide right", "Slide up", "Slide down"] },
  { name: "Wipe", presets: ["Wipe left", "Wipe right", "Circle wipe"] },
  { name: "Playful", presets: ["Zoom in", "Zoom out", "Pop", "Bounce"] },
];
export function isTransitionEvent(e: EditorEvent) {
  return e.lane === "effects" && transitionPresets.includes(e.kind);
}
/** Junctions between adjacent video clips, with the transition covering each (if any). */
export function clipJunctions(events: EditorEvent[]) {
  const clips = events.filter((e) => e.lane === "video").sort((a, b) => a.start - b.start);
  const junctions: { at: number; before: EditorEvent; after: EditorEvent; transition?: EditorEvent }[] = [];
  for (let i = 0; i < clips.length - 1; i++) {
    const before = clips[i];
    const after = clips[i + 1];
    if (!before || !after) continue;
    const at = before.start + before.duration;
    const transition = events.find(
      (e) => isTransitionEvent(e) && e.start < at && e.start + e.duration > at,
    );
    junctions.push({ at, before, after, ...(transition ? { transition } : {}) });
  }
  return junctions;
}
/** Place a transition centered on a junction time, replacing any transition already there. */
export function addTransitionAt(events: EditorEvent[], kind: string, at: number, duration = 1): EditorEvent[] {
  const kept = events.filter((e) => !(isTransitionEvent(e) && e.start < at && e.start + e.duration > at));
  const event = eventTemplate("effects", kind, Math.max(0, at - duration / 2));
  event.duration = duration;
  event.name = `${kind} transition`;
  return [...kept, event];
}
export function eventTemplate(lane: Lane, kind: string, start = 0): EditorEvent {
  return {
    id: crypto.randomUUID(),
    lane,
    kind,
    name: kind,
    start,
    duration: lane === "video" ? 15 : 5,
    text: lane === "text" ? "Your next big idea starts here." : kind,
    color: "purple",
    x: 50,
    y: 50,
    size: 45,
    intensity: 50,
    easing: "Ease in out",
    shape: "Rectangle",
  };
}
export function defaultDraft(source?: string, ratio?: string): EditorDraft {
  return {
    description: "",
    ratio: ratio || "16:9",
    background: "lavender",
    backgroundImage: "",
    frame: "Default",
    shadow: true,
    border: false,
    padding: 32,
    volume: 80,
    muted: false,
    font: "DM Sans",
    fontSize: 24,
    align: "Center",
    captionStyle: "Classic",
    language: "English",
    cta: "Get started",
    destination: "",
    gate: "Off",
    branchOne: "Explore Developer APIs",
    branchOneUrl: "",
    branchTwo: "View Analytics Tour",
    branchTwoUrl: "",
    scheduleUrl: "",
    events: [
      {
        id: "recording",
        lane: "video",
        kind: "Recording",
        name: source ? "Source recording" : "Product walkthrough",
        start: 0,
        duration: 30,
        text: "",
        color: "purple",
        x: 50,
        y: 50,
        size: 100,
        intensity: 0,
        easing: "Linear",
        shape: "Rectangle",
        ...(source ? { source } : {}),
        sourceOffset: 0,
      },
      {
        id: "caption-1",
        lane: "text",
        kind: "Heading",
        name: "Welcome message",
        start: 0,
        duration: 10,
        text: "Your workspace, at a glance.",
        color: "purple",
        x: 50,
        y: 85,
        size: 50,
        intensity: 100,
        easing: "Ease in out",
        shape: "Rectangle",
      },
      {
        id: "spotlight-1",
        lane: "effects",
        kind: "Spotlight",
        name: "Focus on what matters",
        start: 3,
        duration: 6,
        text: "",
        color: "purple",
        x: 50,
        y: 48,
        size: 40,
        intensity: 50,
        easing: "Ease in out",
        shape: "Rectangle",
      },
    ],
    hidden: [],
    locked: [],
  };
}
export function timelineDuration(events: EditorEvent[]) {
  return Math.max(1, ...events.map((e) => e.start + e.duration));
}
export const videoSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export function playbackSpeedOf(draft: Pick<EditorDraft, "playbackSpeed">) {
  return videoSpeeds.includes(draft.playbackSpeed ?? 1) ? (draft.playbackSpeed ?? 1) : 1;
}
export function exportDuration(draft: EditorDraft) {
  return timelineDuration(draft.events) / playbackSpeedOf(draft);
}
export function appendVideoClip(events: EditorEvent[], clip: EditorEvent): EditorEvent[] {
  const start = Math.max(0, ...events.filter((e) => e.lane === "video").map((e) => e.start + e.duration));
  return [...events, { ...clip, lane: "video", start }];
}

export function timelineRows(events: EditorEvent[]): EditorEvent[][] {
  const rows: EditorEvent[][] = [];
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    const row = rows.find((items) => items.every((item) => item.start + item.duration <= event.start || event.start + event.duration <= item.start));
    if (row) row.push(event);
    else rows.push([event]);
  }
  return rows;
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor((seconds % 1) * 10)}`;
}
export function splitEvent(events: EditorEvent[], id: string, at: number): EditorEvent[] {
  const selected = events.find((e) => e.id === id);
  if (!selected || at <= selected.start || at >= selected.start + selected.duration) return events;
  return events.flatMap((e) =>
    e.id === id
      ? [
          { ...e, duration: at - e.start },
          {
            ...e,
            id: crypto.randomUUID(),
            name: `${e.name} (split)`,
            start: at,
            duration: e.start + e.duration - at,
            sourceOffset: (e.sourceOffset || 0) + (at - e.start),
          },
        ]
      : [e],
  );
}
export function trimEvent(events: EditorEvent[], id: string, edge: "start" | "end", to: number): EditorEvent[] {
  if (!Number.isFinite(to)) return events;
  const min = 0.5;
  return events.map((e) => {
    if (e.id !== id) return e;
    if (edge === "start") {
      const end = e.start + e.duration;
      const earliest = e.source ? Math.max(0, e.start - (e.sourceOffset ?? 0)) : 0;
      const start = Math.min(end - Math.min(min, e.duration), Math.max(earliest, to));
      return { ...e, start, duration: end - start, sourceOffset: (e.sourceOffset || 0) + (start - e.start) };
    }
    const available = e.sourceDuration === undefined ? Infinity : Math.max(0, e.sourceDuration - (e.sourceOffset ?? 0));
    return { ...e, duration: Math.min(available, Math.max(Math.min(min, e.duration), to - e.start)) };
  });
}
export function downloadFile(content: Blob | string, name: string, type = "application/json") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeExternal(url: string) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export type WatermarkShape = "None" | "Pill" | "Rounded" | "Square" | "Circle" | "Badge" | "Ribbon";
export type WatermarkPosition =
  | "Top left" | "Top center" | "Top right"
  | "Middle left" | "Center" | "Middle right"
  | "Bottom left" | "Bottom center" | "Bottom right"
  | "Tiled";
export type Watermark = {
  enabled: boolean;
  type: "Text" | "Logo";
  text: string;
  image: string;
  shape: WatermarkShape;
  position: WatermarkPosition;
  opacity: number;
  size: number;
  rotation: number;
  margin: number;
  color: "light" | "dark" | "brand";
};
export const watermarkShapes: WatermarkShape[] = ["None", "Pill", "Rounded", "Square", "Circle", "Badge", "Ribbon"];
export const watermarkPositions: WatermarkPosition[] = [
  "Top left", "Top center", "Top right",
  "Middle left", "Center", "Middle right",
  "Bottom left", "Bottom center", "Bottom right",
];
export const defaultWatermark: Watermark = {
  enabled: false,
  type: "Text",
  text: "Marvedge",
  image: "",
  shape: "Pill",
  position: "Bottom right",
  opacity: 70,
  size: 14,
  rotation: 0,
  margin: 4,
  color: "light",
};
export function watermarkOf(draft: EditorDraft): Watermark {
  return { ...defaultWatermark, ...(draft.watermark || {}) };
}
/** Percent coordinates and anchor translate for a watermark position. */
export function watermarkPlacement(position: WatermarkPosition, margin: number) {
  const [row, col] = position === "Center" ? ["Middle", "center"] : position.split(" ");
  const x = col === "left" ? margin : col === "right" ? 100 - margin : 50;
  const y = row === "Top" ? margin : row === "Bottom" ? 100 - margin : 50;
  const tx = col === "left" ? 0 : col === "right" ? -100 : -50;
  const ty = row === "Top" ? 0 : row === "Bottom" ? -100 : -50;
  return { x, y, tx, ty };
}

/** Peaks (0..1) for the visible part of a clip, resampled to `bars` values. Falls back to a stable pseudo-wave. */
export function waveformSlice(event: Pick<EditorEvent, "id" | "peaks" | "sourceDuration" | "sourceOffset" | "duration">, bars: number): number[] {
  const count = Math.max(1, Math.round(bars));
  const peaks = event.peaks;
  if (peaks?.length && event.sourceDuration && event.sourceDuration > 0) {
    const from = (event.sourceOffset ?? 0) / event.sourceDuration;
    const span = event.duration / event.sourceDuration;
    return Array.from({ length: count }, (_, i) => {
      const r = from + ((i + 0.5) / count) * span;
      if (r < 0 || r > 1) return 0;
      return peaks[Math.min(peaks.length - 1, Math.floor(r * peaks.length))] ?? 0;
    });
  }
  let seed = 0;
  for (const c of event.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    const t = i + Math.floor((event.sourceOffset ?? 0) * 4);
    const v = Math.abs(Math.sin(t * 0.7 + seed) * 0.5 + Math.sin(t * 0.23 + seed / 7) * 0.35);
    return Math.min(1, 0.15 + v);
  });
}
