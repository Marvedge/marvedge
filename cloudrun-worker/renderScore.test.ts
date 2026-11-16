import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { scoreClip } from "./renderScore";

describe("Clip Scorer (Task 112: cloudrun-worker/renderScore)", () => {
  it("returns default zero scores for non-existent video path without throwing", () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}.mp4`);
    const score = scoreClip(nonExistent);
    expect(score).toEqual({ durationScore: 0, bitrateScore: 0 });
  });

  it("returns default zero scores for empty video path", () => {
    const score = scoreClip("");
    expect(score).toEqual({ durationScore: 0, bitrateScore: 0 });
  });

  it("calculates finite scores in 0-100 range on valid local video", () => {
    // public/icons/two-speaker.mp4 is available in repo
    const sampleVideo = path.resolve(process.cwd(), "public", "icons", "two-speaker.mp4");
    if (fs.existsSync(sampleVideo)) {
      const score = scoreClip(sampleVideo);
      expect(typeof score.durationScore).toBe("number");
      expect(typeof score.bitrateScore).toBe("number");
      expect(Number.isFinite(score.durationScore)).toBe(true);
      expect(Number.isFinite(score.bitrateScore)).toBe(true);
      expect(score.durationScore).toBeGreaterThanOrEqual(0);
      expect(score.durationScore).toBeLessThanOrEqual(100);
      expect(score.bitrateScore).toBeGreaterThanOrEqual(0);
      expect(score.bitrateScore).toBeLessThanOrEqual(100);
    }
  });

  it("calculates overlapScore from an ASS caption file with overlapping dialogue", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "score-test-"));
    const assFile = path.join(tmpDir, "sample.ass");

    // Two dialogues that overlap from 0:00:02.00 to 0:00:03.00 (1 second overlap)
    // Cue 1: 0:00:00.00 to 0:00:03.00 (3s)
    // Cue 2: 0:00:02.00 to 0:00:05.00 (3s)
    // Total dialogue duration = 6s, overlap = 1s -> 1/6 ≈ 16.67% -> 17
    const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,First sentence
Dialogue: 0,0:00:02.00,0:00:05.00,Default,,0,0,0,,Second sentence
`;
    fs.writeFileSync(assFile, assContent, "utf8");

    try {
      const dummyVideo = path.join(tmpDir, "dummy.mp4");
      // score with valid ASS file
      const score = scoreClip(dummyVideo, assFile);
      expect(score.overlapScore).toBeDefined();
      expect(typeof score.overlapScore).toBe("number");
      expect(score.overlapScore).toBeGreaterThan(0);
      expect(score.overlapScore).toBeLessThanOrEqual(100);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns overlapScore = 0 for ASS caption file without overlapping dialogue", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "score-test-"));
    const assFile = path.join(tmpDir, "non-overlapping.ass");

    const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,First sentence
Dialogue: 0,0:00:03.00,0:00:05.00,Default,,0,0,0,,Second sentence
`;
    fs.writeFileSync(assFile, assContent, "utf8");

    try {
      const dummyVideo = path.join(tmpDir, "dummy.mp4");
      const score = scoreClip(dummyVideo, assFile);
      expect(score.overlapScore).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("omits overlapScore when captionPath is not provided", () => {
    const score = scoreClip("fake-video.mp4");
    expect(score.overlapScore).toBeUndefined();
  });
});

