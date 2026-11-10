import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CANONICAL_SCHEMA,
  CANONICAL_SCHEMA_VERSION,
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

  describe("Task-107: Canonical Versioned Speaker-Tracks Contract", () => {
    const validCanonicalPayload = {
      schema: CANONICAL_SCHEMA,
      schema_version: CANONICAL_SCHEMA_VERSION,
      source: {
        width: 1920,
        height: 1080,
        fps: 25.0,
        duration_sec: 4.0,
      },
      speakers: [
        {
          track_id: "00000",
          start_sec: 0.0,
          end_sec: 4.0,
          average_confidence: 0.92,
          frames: [
            {
              frame: 0,
              timestamp_sec: 0.0,
              bbox: [200, 100, 400, 300], // center x = 300
              speaking_score: 1.5,
              is_speaking: true,
            },
          ],
        },
        {
          track_id: "00001",
          start_sec: 0.0,
          end_sec: 4.0,
          average_confidence: 0.88,
          frames: [
            {
              frame: 0,
              timestamp_sec: 0.0,
              bbox: [1000, 100, 1200, 300], // center x = 1100
              speaking_score: 1.2,
              is_speaking: true,
            },
          ],
        },
      ],
    };

    it("accepts a valid canonical version-1 payload and triggers split-screen beyond threshold", () => {
      const parsed = parseSpeakerTracks(validCanonicalPayload);
      expect(parsed.valid).toBe(true);
      expect(parsed.speakers).toHaveLength(2);
      expect(parsed.speakers[0].track_id).toBe("00000");
      expect(parsed.speakers[0].x).toBe(300);
      expect(parsed.speakers[1].track_id).toBe("00001");
      expect(parsed.speakers[1].x).toBe(1100);

      const result = evaluateSplitScreen(validCanonicalPayload);
      expect(result.splitScreen).toBe(true);
      expect(result.fallback).toBe(false);
      expect(result.horizontalDistance).toBe(800);
      expect(result.threshold).toBe(672); // 35% of 1920
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("evaluates a valid canonical payload within threshold as fallback without errors", () => {
      const closeSpeakersPayload = {
        ...validCanonicalPayload,
        speakers: [
          {
            ...validCanonicalPayload.speakers[0],
            frames: [
              {
                frame: 0,
                timestamp_sec: 0.0,
                bbox: [600, 100, 800, 300], // center x = 700
                speaking_score: 1.5,
                is_speaking: true,
              },
            ],
          },
          validCanonicalPayload.speakers[1], // center x = 1100, distance = 400 < 672
        ],
      };

      const result = evaluateSplitScreen(closeSpeakersPayload);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.horizontalDistance).toBe(400);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("handles a valid empty-speakers canonical payload safely", () => {
      const emptyPayload = {
        schema: "marvedge.speaker-tracks",
        schema_version: 1,
        source: {
          width: 1920,
          height: 1080,
          fps: 25.0,
          duration_sec: 0.0,
        },
        speakers: [],
      };

      const parsed = parseSpeakerTracks(emptyPayload);
      expect(parsed.valid).toBe(true);
      expect(parsed.speakers).toHaveLength(0);

      const result = evaluateSplitScreen(emptyPayload);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("no_speakers");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No speaker track coordinates available; falling back to normal single-speaker crop")
      );
    });

    it("safely rejects an unsupported canonical schema version", () => {
      const badVersionPayload = {
        ...validCanonicalPayload,
        schema_version: 2,
      };

      const parsed = parseSpeakerTracks(badVersionPayload);
      expect(parsed.valid).toBe(false);
      expect(parsed.reason).toBe("unsupported_schema_version");

      const result = evaluateSplitScreen(badVersionPayload);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("unsupported_schema_version");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported schema version "2"')
      );
    });

    it("safely rejects an unknown explicit schema discriminator", () => {
      const unknownSchemaPayload = {
        ...validCanonicalPayload,
        schema: "other.speaker-tracks",
      };

      const parsed = parseSpeakerTracks(unknownSchemaPayload);
      expect(parsed.valid).toBe(false);
      expect(parsed.reason).toBe("unsupported_schema");

      const result = evaluateSplitScreen(unknownSchemaPayload);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("unsupported_schema");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported schema "other.speaker-tracks"')
      );
    });

    it("safely rejects malformed canonical source metadata", () => {
      const badSourcePayloads = [
        { ...validCanonicalPayload, source: null },
        { ...validCanonicalPayload, source: { width: 0, height: 1080, fps: 25, duration_sec: 4 } },
        { ...validCanonicalPayload, source: { width: 1920, height: -10, fps: 25, duration_sec: 4 } },
        { ...validCanonicalPayload, source: { width: 1920, height: 1080, fps: 0, duration_sec: 4 } },
        { ...validCanonicalPayload, source: { width: 1920, height: 1080, fps: 25, duration_sec: -1 } },
        { ...validCanonicalPayload, source: "invalid" },
      ];

      for (const payload of badSourcePayloads) {
        const parsed = parseSpeakerTracks(payload);
        expect(parsed.valid).toBe(false);
        expect(parsed.reason).toBe("invalid_schema");

        const result = evaluateSplitScreen(payload);
        expect(result.splitScreen).toBe(false);
        expect(result.fallback).toBe(true);
        expect(result.reason).toBe("invalid_schema");
      }
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid canonical source metadata")
      );
    });

    it("safely rejects non-array speakers in canonical payload", () => {
      const nonArraySpeakers = {
        ...validCanonicalPayload,
        speakers: "invalid",
      };

      const parsed = parseSpeakerTracks(nonArraySpeakers);
      expect(parsed.valid).toBe(false);
      expect(parsed.reason).toBe("invalid_schema");

      const result = evaluateSplitScreen(nonArraySpeakers);
      expect(result.splitScreen).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.reason).toBe("invalid_schema");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Canonical 'speakers' must be an array")
      );
    });

    it("safely rejects malformed speaker and frame data in canonical payload", () => {
      const invalidSpeakerPayloads = [
        {
          ...validCanonicalPayload,
          speakers: [{ ...validCanonicalPayload.speakers[0], track_id: "" }],
        },
        {
          ...validCanonicalPayload,
          speakers: [{ ...validCanonicalPayload.speakers[0], average_confidence: "high" }],
        },
        {
          ...validCanonicalPayload,
          speakers: [{ ...validCanonicalPayload.speakers[0], frames: null }],
        },
        {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], frame: 1.5 }],
            },
          ],
        },
        {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], frame: -1 }],
            },
          ],
        },
        {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], timestamp_sec: -0.5 }],
            },
          ],
        },
        {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], is_speaking: "yes" }],
            },
          ],
        },
        {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], speaking_score: NaN }],
            },
          ],
        },
      ];

      for (const payload of invalidSpeakerPayloads) {
        const parsed = parseSpeakerTracks(payload);
        expect(parsed.valid).toBe(false);
        expect(parsed.reason).toBe("invalid_schema");

        const result = evaluateSplitScreen(payload);
        expect(result.splitScreen).toBe(false);
        expect(result.fallback).toBe(true);
        expect(result.reason).toBe("invalid_schema");
      }
    });

    it("safely rejects invalid bounding boxes with non-positive area or invalid coordinates", () => {
      const invalidBboxPayloads = [
        [400, 100, 200, 300], // inverted x
        [200, 100, 200, 300], // zero width
        [200, 300, 400, 100], // inverted y
        [200, 100, 400, 100], // zero height
        [200, 100, 400], // wrong length
        [200, 100, "400", 300], // non-numeric coordinate
      ];

      for (const bbox of invalidBboxPayloads) {
        const payload = {
          ...validCanonicalPayload,
          speakers: [
            {
              ...validCanonicalPayload.speakers[0],
              frames: [{ ...validCanonicalPayload.speakers[0].frames[0], bbox }],
            },
          ],
        };

        const parsed = parseSpeakerTracks(payload);
        expect(parsed.valid).toBe(false);
        expect(parsed.reason).toBe("invalid_schema");

        const result = evaluateSplitScreen(payload);
        expect(result.splitScreen).toBe(false);
        expect(result.fallback).toBe(true);
        expect(result.reason).toBe("invalid_schema");
      }
    });

    it("preserves Task-00016 crop_targets payloads as legacy compatibility", () => {
      const cropTargetsPayload = {
        crop_targets: [
          { source: "speaker", crop: { x: 200, width: 200 } }, // center = 300
          { source: "speaker", crop: { x: 1000, width: 200 } }, // center = 1100
        ],
        source: { width: 1920, height: 1080 },
      };

      const parsed = parseSpeakerTracks(cropTargetsPayload);
      expect(parsed.speakers).toHaveLength(2);
      expect(parsed.speakers[0].x).toBe(300);
      expect(parsed.speakers[1].x).toBe(1100);

      const result = evaluateSplitScreen(cropTargetsPayload);
      expect(result.splitScreen).toBe(true);
      expect(result.horizontalDistance).toBe(800);
    });

    it("preserves top-level array legacy payloads", () => {
      const arrayPayload = [
        { id: "spk_1", x: 200 },
        { id: "spk_2", x: 900 },
      ];

      const parsed = parseSpeakerTracks(arrayPayload, 1280);
      expect(parsed.speakers).toHaveLength(2);
      expect(parsed.speakers[0].x).toBe(200);
      expect(parsed.speakers[1].x).toBe(900);

      const result = evaluateSplitScreen(arrayPayload, 1280);
      expect(result.splitScreen).toBe(true);
      expect(result.horizontalDistance).toBe(700);
    });

    it("preserves track_id in legacy payloads while maintaining fallback", () => {
      const legacyWithTrackId = {
        speakers: [
          { track_id: "trk_alpha", x: 250 },
          { speaker_id: "spk_beta", x: 850 },
        ],
        width: 1280,
      };

      const parsed = parseSpeakerTracks(legacyWithTrackId);
      expect(parsed.speakers).toHaveLength(2);
      expect(parsed.speakers[0].id).toBe("trk_alpha");
      expect(parsed.speakers[1].id).toBe("spk_beta");
    });
  });
});