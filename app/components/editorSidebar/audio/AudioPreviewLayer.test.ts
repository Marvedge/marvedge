import { describe, expect, it } from "vitest";
import type { AudioClipDto } from "@/app/types/audio";
import { clipWindow } from "./previewTiming";

const clip: AudioClipDto = {
  id: "clip-1",
  fileName: "voice.mp3",
  mimeType: "audio/mpeg",
  durationSec: 20,
  trimStartSec: 10,
  trimEndSec: 12,
  order: 0,
  status: "READY",
  error: null,
  originalUrl: "https://example.test/original.mp3",
  trimmedUrl: "https://example.test/trim.mp3",
  createdAt: "2026-11-24T00:00:00Z",
  updatedAt: "2026-11-24T00:00:00Z",
};

describe("audio preview seeking", () => {
  it("seeks relative to the start of the trimmed file", () => {
    const window = clipWindow(clip, {});
    expect(window.sourcePosFor(10)).toBe(0);
    expect(window.sourcePosFor(11)).toBe(1);
  });

  it.each([null, ""])("uses the original file offset when the trimmed URL is %s", (trimmedUrl) => {
    const window = clipWindow({ ...clip, trimmedUrl }, {});
    expect(window.sourcePosFor(10)).toBe(10);
    expect(window.sourcePosFor(11)).toBe(11);
  });

  it("loops a trimmed file within a longer manual placement", () => {
    const window = clipWindow(clip, { [clip.id]: { start: 20, len: 6 } });
    expect(window.sourcePosFor(23)).toBe(1);
  });

  it("starts at zero just before the timeline boundary", () => {
    expect(clipWindow(clip, {}).sourcePosFor(9.995)).toBe(0);
  });
});
