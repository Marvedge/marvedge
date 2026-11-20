import { describe, expect, it } from "vitest";
import type { AudioClipDto } from "../types/audio";
import { getClipTimelineWindow } from "./audioClipStore";

const clip: AudioClipDto = {
  id: "clip-1",
  fileName: "voice.mp3",
  mimeType: "audio/mpeg",
  durationSec: 12,
  trimStartSec: 0,
  trimEndSec: null,
  order: 0,
  status: "READY",
  error: null,
  originalUrl: "https://example.test/voice.mp3",
  trimmedUrl: null,
  createdAt: "2026-11-20T00:00:00Z",
  updatedAt: "2026-11-20T00:00:00Z",
};

describe("audio clip timeline length", () => {
  it("ends the default timeline window at the source duration", () => {
    const trimmed = { ...clip, trimStartSec: 3, trimEndSec: 20 };
    expect(getClipTimelineWindow(trimmed, {})).toEqual({ start: 3, len: 9 });
  });

  it("uses the selected trim window when it fits inside the source", () => {
    const trimmed = { ...clip, trimStartSec: 3, trimEndSec: 8 };
    expect(getClipTimelineWindow(trimmed, {})).toEqual({ start: 3, len: 5 });
  });

  it("preserves a longer manual placement for looping", () => {
    const trimmed = { ...clip, trimStartSec: 3, trimEndSec: 20 };
    const placement = { start: 5, len: 30 };
    expect(getClipTimelineWindow(trimmed, { [clip.id]: placement })).toEqual(placement);
  });
});
