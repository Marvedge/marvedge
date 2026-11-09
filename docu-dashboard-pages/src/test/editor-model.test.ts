import { describe, expect, it } from "vitest";
import { defaultDraft, splitEvent, timelineDuration, safeExternal, appendVideoClip, eventTemplate, timelineRows, trimEvent, playbackSpeedOf, exportDuration, type EditorEvent } from "@/lib/editor-model";
describe("Editor timeline", () => {
  it("adds extra videos after existing clips without overlapping them", () => {
    const events = appendVideoClip(defaultDraft().events, { ...eventTemplate("video", "Recording"), duration: 8 });
    expect(events.at(-1)?.start).toBe(30);
    expect(timelineDuration(events)).toBe(38);
  });
  it("gives overlapping elements separate rows while adjacent clips share a row", () => {
    const first = { ...eventTemplate("video", "Recording"), start: 0, duration: 10 };
    const overlap = { ...eventTemplate("video", "Recording"), start: 5, duration: 8 };
    const adjacent = { ...eventTemplate("video", "Recording"), start: 10, duration: 4 };
    const rows = timelineRows([first, overlap, adjacent]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.map((e) => e.id)).toEqual([first.id, adjacent.id]);
    expect(rows[1]?.map((e) => e.id)).toEqual([overlap.id]);
  });
  it("splits a recording and preserves its source offset", () => {
    const draft = defaultDraft("blob:test");
    const events = splitEvent(draft.events, "recording", 12);
    const clips = events.filter((e) => e.lane === "video");
    expect(clips).toHaveLength(2);
    expect(clips[0]?.duration).toBe(12);
    expect(clips[1]?.duration).toBe(18);
    expect(clips[1]?.sourceOffset).toBe(12);
    expect(timelineDuration(events)).toBe(30);
  });
  it("does not split outside the selected clip", () => {
    const events = defaultDraft().events;
    expect(splitEvent(events, "recording", 0)).toBe(events);
    expect(splitEvent(events, "recording", 40)).toBe(events);
  });
  it("only allows safe web destinations", () => {
    expect(safeExternal("javascript:alert(1)")).toBeNull();
    expect(safeExternal("not a url")).toBeNull();
    expect(safeExternal("https://example.com")).toBe("https://example.com/");
  });
});
import { watermarkPlacement, watermarkOf } from "@/lib/editor-model";
describe("Watermark", () => {
  it("anchors corners inside the margin", () => {
    expect(watermarkPlacement("Bottom right", 4)).toEqual({ x: 96, y: 96, tx: -100, ty: -100 });
    expect(watermarkPlacement("Top left", 4)).toEqual({ x: 4, y: 4, tx: 0, ty: 0 });
    expect(watermarkPlacement("Center", 4)).toEqual({ x: 50, y: 50, tx: -50, ty: -50 });
  });
  it("is off by default for existing drafts", () => {
    expect(watermarkOf(defaultDraft()).enabled).toBe(false);
  });
});

describe("trimEvent", () => {
  const base: EditorEvent[] = [{ ...eventTemplate("video", "Video", 5), id: "a", name: "Clip", duration: 10 }];
  it("trims the end with a minimum duration", () => {
    expect(trimEvent(base, "a", "end", 12)[0]).toMatchObject({ start: 5, duration: 7 });
    expect(trimEvent(base, "a", "end", 5.1)[0]?.duration).toBe(0.5);
  });
  it("trims the start, clamps at zero, and shifts sourceOffset", () => {
    expect(trimEvent(base, "a", "start", 8)[0]).toMatchObject({ start: 8, duration: 7, sourceOffset: 3 });
    expect(trimEvent(base, "a", "start", -4)[0]).toMatchObject({ start: 0, duration: 15 });
    expect(trimEvent(base, "a", "start", 14.9)[0]).toMatchObject({ start: 14.5, duration: 0.5 });
  });
  it("leaves other events untouched", () => {
    const other: EditorEvent = { ...eventTemplate("text", "Text", 0), id: "b", name: "T", duration: 2 };
    expect(trimEvent([...base, other], "a", "end", 9)[1]).toEqual(other);
  });
  it("does not extend a recording before its source begins", () => {
    const events = [{ ...base[0], ...eventTemplate("video", "Video", 5), source: "blob:clip", sourceOffset: 2, sourceDuration: 12, duration: 8, id: "a" }];
    expect(trimEvent(events, "a", "start", 0)[0]).toMatchObject({ start: 3, sourceOffset: 0, duration: 10 });
  });
  it("extends only to the end of the original media", () => {
    const events = [{ ...eventTemplate("video", "Video", 5), source: "blob:clip", sourceDuration: 12, sourceOffset: 2, duration: 8, id: "a" }];
    expect(trimEvent(events, "a", "end", 100)[0]?.duration).toBe(10);
  });
  it("ignores invalid trim coordinates", () => {
    expect(trimEvent(base, "a", "end", NaN)).toBe(base);
  });
});
describe("Export video speed", () => {
  it("defaults existing drafts to normal speed", () => {
    expect(playbackSpeedOf(defaultDraft())).toBe(1);
  });
  it("halves output duration at double speed", () => {
    expect(exportDuration({ ...defaultDraft(), playbackSpeed: 2 })).toBe(15);
  });
  it("doubles output duration at half speed", () => {
    expect(exportDuration({ ...defaultDraft(), playbackSpeed: 0.5 })).toBe(60);
  });
  it("rejects unsupported or invalid speeds", () => {
    expect(playbackSpeedOf({ playbackSpeed: 0 })).toBe(1);
    expect(playbackSpeedOf({ playbackSpeed: NaN })).toBe(1);
  });
});
import { waveformSlice } from "@/lib/editor-model";
describe("waveformSlice", () => {
  it("shows only the trimmed part of the audio", () => {
    const e = { id: "a", peaks: [0.1, 0.2, 0.9, 1], sourceDuration: 4, sourceOffset: 2, duration: 2 };
    expect(waveformSlice(e, 2)).toEqual([0.9, 1]);
  });
  it("draws silence past the end of the audio", () => {
    expect(waveformSlice({ id: "a", peaks: [1, 1], sourceDuration: 2, sourceOffset: 0, duration: 4 }, 4)).toEqual([1, 1, 0, 0]);
  });
});
