import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  buildSplitScreenBlurFilter,
  getSplitScreenDecision,
  parseSpeakerTracks,
  loadSpeakerTracks,
  evaluateSplitScreen,
} from "./split-screen-blur";

describe("Task 36: Split-Screen & Blur Helpers", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("buildSplitScreenBlurFilter", () => {
    it("uses default blur strength of 20 and scales/crops to requested dimensions", () => {
      const filter = buildSplitScreenBlurFilter({ width: 1280, height: 720 });
      expect(filter).toContain("scale=1280:720:force_original_aspect_ratio=increase");
      expect(filter).toContain("crop=1280:720");
      expect(filter).toContain("gblur=sigma=20");
      expect(filter).toContain("setsar=1,format=yuv420p");
    });

    it("supports custom blur strength", () => {
      const filter = buildSplitScreenBlurFilter({ width: 1920, height: 1080, blurStrength: 35 });
      expect(filter).toContain("gblur=sigma=35");
    });

    it("rejects invalid dimensions and negative blur strength", () => {
      expect(() => buildSplitScreenBlurFilter({ width: 0, height: 720 })).toThrow();
      expect(() => buildSplitScreenBlurFilter({ width: 1280, height: -10 })).toThrow();
      expect(() => buildSplitScreenBlurFilter({ width: 1280, height: 720, blurStrength: -1 })).toThrow();
    });
  });

  describe("Threshold Decision: Two active speakers vs 35% frame width", () => {
    it("triggers split-screen when two active speakers' horizontal distance exceeds 35% of frame width (1280px)", () => {
      // 35% of 1280 is 448px. Distance |300 - 800| = 500px > 448px -> splitScreen true
      const decision = getSplitScreenDecision({ x: 300 }, { x: 800 }, 1280);
      expect(decision.splitScreen).toBe(true);
      expect(decision.horizontalDistance).toBe(500);
      expect(decision.threshold).toBe(448);
    });

    it("does not trigger split-screen when two speakers are within 35% threshold (1280px)", () => {
      // Distance |300 - 700| = 400px <= 448px -> splitScreen false
      const decision = getSplitScreenDecision({ x: 300 }, { x: 700 }, 1280);
      expect(decision.splitScreen).toBe(false);
      expect(decision.horizontalDistance).toBe(400);
      expect(decision.threshold).toBe(448);
    });

    it("triggers split-screen on 1920px frame when distance exceeds 35%", () => {
      // 35% of 1920 is 672px. Distance |300 - 1100| = 800px > 672px -> splitScreen true
      const decision = getSplitScreenDecision({ x: 300 }, { x: 1100 }, 1920);
      expect(decision.splitScreen).toBe(true);
      expect(decision.horizontalDistance).toBe(800);
      expect(decision.threshold).toBe(672);
    });

    it("does not trigger split-screen when speakers are exactly at threshold", () => {
      // Distance |300 - 748| = 448px == 448px -> splitScreen false
      const decision = getSplitScreenDecision({ x: 300 }, { x: 748 }, 1280);
      expect(decision.splitScreen).toBe(false);
    });
  });

  describe("evaluateSplitScreen: Task-00016 schema and fallbacks", () => {
    it("evaluates split-screen successfully from Task-00016 JSON with speakers exceeding 35%", () => {
      const task00016Data = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        speakers: [
          { speaker_id: "spk_1", bbox: [200, 100, 400, 300] }, // center x = 300
          { speaker_id: "spk_2", bbox: [1000, 100, 1200, 300] }, // center x = 1100
        ],
      };

      const result = evaluateSplitScreen(task00016Data);
      expect(result.splitScreen).toBe(true);
      expect(result.horizontalDistance).toBe(800);
      expect(result.threshold).toBe(672);
      expect(result.fallback).toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("uses normal crop when two speakers in Task-00016 data are within 35% threshold", () => {
      const task00016Data = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        speakers: [
          { speaker_id: "spk_1", bbox: [600, 100, 800, 300] }, // center x = 700
          { speaker_id: "spk_2", bbox: [1000, 100, 1200, 300] }, // center x = 1100 (dist = 400 < 672)
        ],
      };

      const result = evaluateSplitScreen(task00016Data);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("falls back to normal crop with warning when only one speaker is available", () => {
      const singleSpeakerData = {
        schema_version: 1,
        source: { width: 1920, height: 1080 },
        speakers: [{ speaker_id: "spk_1", bbox: [200, 100, 400, 300] }],
      };

      const result = evaluateSplitScreen(singleSpeakerData);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("single_speaker");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Only one speaker available; falling back to normal single-speaker crop")
      );
    });

    it("falls back to normal crop with warning when speakerTracksUri is missing or null", () => {
      const result = evaluateSplitScreen(null, 1280);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("missing_speaker_tracks");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("speakerTracksUri is missing; falling back to normal single-speaker crop")
      );
    });

    it("falls back to normal crop with warning when speakerTracksUri is an empty string", () => {
      const result = evaluateSplitScreen("", 1280);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("speakerTracksUri is missing; falling back to normal single-speaker crop")
      );
    });

    it("falls back to normal crop with warning when speaker-track file is empty", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task36-test-"));
      const emptyFile = path.join(tempDir, "empty_speaker_tracks.json");
      fs.writeFileSync(emptyFile, "   \n");

      try {
        const result = evaluateSplitScreen(emptyFile, 1280);
        expect(result.splitScreen).toBe(false);
        expect(result.fallback).toBe(true);
        expect(result.reason).toBe("empty_file");
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("speakerTracksUri file is empty; falling back to normal single-speaker crop")
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("loads speaker-track data from a valid file and triggers split-screen beyond threshold", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "task36-test-"));
      const validFile = path.join(tempDir, "speaker_tracks.json");
      fs.writeFileSync(
        validFile,
        JSON.stringify({
          source: { width: 1280, height: 720 },
          speakers: [{ x: 200 }, { x: 800 }],
        })
      );

      try {
        const result = evaluateSplitScreen(validFile);
        expect(result.splitScreen).toBe(true);
        expect(result.horizontalDistance).toBe(600);
        expect(result.threshold).toBe(448);
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});