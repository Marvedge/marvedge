import { describe, expect, it } from "vitest";
import {
  CropTargetValidationError,
  validateCropTargetData,
  interpolateCropTarget,
  buildCropExpression,
  buildFfmpegCropFilter,
  type CropTargetData,
} from "./crop-target";

const validCropTargetPayload: CropTargetData = {
  schema_version: 1,
  video_id: "demo-123",
  source: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration_sec: 12.4,
  },
  output: {
    aspect_ratio: "9:16",
    width: 720,
    height: 1280,
  },
  timeline: {
    timebase: "seconds",
    sampling: "keyframes_interpolated",
  },
  crop_targets: [
    {
      timestamp_sec: 0,
      frame: 0,
      crop: { x: 640, y: 0, width: 608, height: 1080 },
      confidence: 0.94,
      source: "autoflip",
    },
    {
      timestamp_sec: 2,
      frame: 60,
      crop: { x: 720, y: 0, width: 608, height: 1080 },
      confidence: 0.88,
      source: "speaker",
    },
    {
      timestamp_sec: 5.5,
      frame: 165,
      crop: { x: 680, y: 0, width: 608, height: 1080 },
      confidence: 0.91,
      source: "fused",
    },
  ],
};

describe("Revised Crop coordinate JSON contract validation suite", () => {
  // 1. Valid crop coordinate payload
  it("accepts a valid crop coordinate payload", () => {
    expect(() => validateCropTargetData(validCropTargetPayload)).not.toThrow();
  });

  // 2. Trajectories starting after timestamp 0 (startup adaptation lag tolerance)
  it("accepts trajectories starting after timestamp 0", () => {
    const delayedStart = structuredClone(validCropTargetPayload);
    delayedStart.crop_targets[0].timestamp_sec = 1.2;
    delayedStart.crop_targets[1].timestamp_sec = 2.5;
    delayedStart.crop_targets[2].timestamp_sec = 5.0;
    expect(() => validateCropTargetData(delayedStart)).not.toThrow();

    // Interpolation should hold initial crop position for t < t_first
    expect(interpolateCropTarget(delayedStart.crop_targets, 0.5)?.x).toBe(640);
  });

  // 3. Dynamic scale / varying crop dimensions across shots
  it("accepts varying crop dimensions across trajectory (supports multi-shot / scale adaptation)", () => {
    const varyingScale = structuredClone(validCropTargetPayload);
    // Shot 2 has a tighter crop / zoom
    varyingScale.crop_targets[1].crop.width = 540;
    varyingScale.crop_targets[1].crop.height = 960;
    expect(() => validateCropTargetData(varyingScale)).not.toThrow();
  });

  // 4. Temporal ordering
  it("rejects non-monotonic or decreasing timestamps", () => {
    const decreasing = structuredClone(validCropTargetPayload);
    decreasing.crop_targets[1].timestamp_sec = 0.5;
    decreasing.crop_targets[2].timestamp_sec = 0.4;
    expect(() => validateCropTargetData(decreasing)).toThrow(CropTargetValidationError);
    expect(() => validateCropTargetData(decreasing)).toThrow(/strictly increasing/);
  });

  it("rejects duplicate timestamps", () => {
    const duplicate = structuredClone(validCropTargetPayload);
    duplicate.crop_targets[1].timestamp_sec = 0;
    expect(() => validateCropTargetData(duplicate)).toThrow(CropTargetValidationError);
    expect(() => validateCropTargetData(duplicate)).toThrow(/strictly increasing/);
  });

  // 5. Duration drift tolerance
  it("allows minor timestamp drift beyond duration_sec within tolerance", () => {
    const slightDrift = structuredClone(validCropTargetPayload);
    slightDrift.crop_targets[2].timestamp_sec = 12.6; // 12.4 + 0.2s drift
    expect(() => validateCropTargetData(slightDrift)).not.toThrow();
  });

  it("rejects timestamps excessively exceeding video duration", () => {
    const exceedsDuration = structuredClone(validCropTargetPayload);
    exceedsDuration.crop_targets[2].timestamp_sec = 15.0; // 12.4 + 2.6s (way beyond tolerance)
    expect(() => validateCropTargetData(exceedsDuration)).toThrow(CropTargetValidationError);
    expect(() => validateCropTargetData(exceedsDuration)).toThrow(/exceeds duration/);
  });

  // 6. Invalid/missing coordinates
  it("rejects negative coordinate positions", () => {
    const negativeX = structuredClone(validCropTargetPayload);
    negativeX.crop_targets[0].crop.x = -10;
    expect(() => validateCropTargetData(negativeX)).toThrow(/crop.x must be non-negative/);

    const negativeY = structuredClone(validCropTargetPayload);
    negativeY.crop_targets[0].crop.y = -5;
    expect(() => validateCropTargetData(negativeY)).toThrow(/crop.y must be non-negative/);
  });

  it("rejects non-numeric coordinates", () => {
    const invalidCoord = structuredClone(validCropTargetPayload);
    // @ts-expect-error testing invalid input type
    invalidCoord.crop_targets[0].crop.x = "center";
    expect(() => validateCropTargetData(invalidCoord)).toThrow(CropTargetValidationError);
  });

  // 7. Invalid dimensions
  it("rejects zero or negative crop dimensions", () => {
    const zeroWidth = structuredClone(validCropTargetPayload);
    zeroWidth.crop_targets[0].crop.width = 0;
    expect(() => validateCropTargetData(zeroWidth)).toThrow(/width must be positive/);

    const negativeHeight = structuredClone(validCropTargetPayload);
    negativeHeight.crop_targets[0].crop.height = -100;
    expect(() => validateCropTargetData(negativeHeight)).toThrow(/height must be positive/);
  });

  // 8. Out-of-range coordinates
  it("rejects crops exceeding source width or height bounds", () => {
    const exceedsWidth = structuredClone(validCropTargetPayload);
    exceedsWidth.crop_targets[0].crop.x = 1500; // 1500 + 608 > 1920
    expect(() => validateCropTargetData(exceedsWidth)).toThrow(/exceeds source width/);

    const exceedsHeight = structuredClone(validCropTargetPayload);
    exceedsHeight.crop_targets[0].crop.y = 50; // 50 + 1080 > 1080
    expect(() => validateCropTargetData(exceedsHeight)).toThrow(/exceeds source height/);
  });

  it("rejects confidence outside [0, 1]", () => {
    const highConf = structuredClone(validCropTargetPayload);
    highConf.crop_targets[0].confidence = 1.2;
    expect(() => validateCropTargetData(highConf)).toThrow(/confidence must be between 0 and 1/);

    const lowConf = structuredClone(validCropTargetPayload);
    lowConf.crop_targets[0].confidence = -0.1;
    expect(() => validateCropTargetData(lowConf)).toThrow(/confidence must be between 0 and 1/);
  });

  // 9. Optional fields & minimal schema
  it("accepts minimal payload without optional fields", () => {
    const minimalPayload: CropTargetData = {
      schema_version: 1,
      source: { width: 1920, height: 1080 },
      output: { aspect_ratio: "9:16" },
      crop_targets: [
        {
          timestamp_sec: 0,
          crop: { x: 640, y: 0, width: 608, height: 1080 },
        },
      ],
    };
    expect(() => validateCropTargetData(minimalPayload)).not.toThrow();
  });

  // 10. Empty trajectory behaviour
  it("handles empty trajectory gracefully without crashing", () => {
    const emptyTrajectory = structuredClone(validCropTargetPayload);
    emptyTrajectory.crop_targets = [];
    expect(() => validateCropTargetData(emptyTrajectory)).not.toThrow();

    expect(interpolateCropTarget([], 5.0)).toBeNull();
    expect(buildCropExpression([], "x")).toBe("0");
    expect(buildFfmpegCropFilter([])).toBeNull();
  });

  // 11. JSON serialization/deserialization
  it("survives round-trip JSON serialization and deserialization without data loss", () => {
    const jsonString = JSON.stringify(validCropTargetPayload);
    const parsed = JSON.parse(jsonString);
    expect(() => validateCropTargetData(parsed)).not.toThrow();
    expect(parsed).toEqual(validCropTargetPayload);
  });

  // 12. Renderer compatibility (FFmpeg expression and filter generation)
  describe("FFmpeg renderer expression compatibility", () => {
    it("interpolates crop box linearly and clamps before/after keyframes", () => {
      const targets = validCropTargetPayload.crop_targets;
      // At t=0, x=640
      expect(interpolateCropTarget(targets, 0)?.x).toBe(640);
      // At t=1 (midpoint of [0, 2]), x should be 680
      expect(interpolateCropTarget(targets, 1)?.x).toBe(680);
      // At t=2, x=720
      expect(interpolateCropTarget(targets, 2)?.x).toBe(720);
      // Beyond end (t=10), clamp to last target x=680
      expect(interpolateCropTarget(targets, 10)?.x).toBe(680);
    });

    it("generates valid FFmpeg crop expressions with conditional timing", () => {
      const expression = buildCropExpression(validCropTargetPayload.crop_targets, "x");
      expect(expression).toContain("if(lt(t,2.0000)");
      expect(expression).toContain("if(lt(t,5.5000)");
      expect(expression).toContain("640.0000+(80.0000)*(t-0.0000)/2.0000");
    });

    it("holds the first crop position in FFmpeg expressions when starting at t > 0", () => {
      const delayed = [
        { timestamp_sec: 2.0, crop: { x: 500, y: 0 } },
        { timestamp_sec: 4.0, crop: { x: 700, y: 0 } },
      ];
      const expression = buildCropExpression(delayed, "x");
      expect(expression).toContain("if(lt(t,2.0000),500.0000,");
    });

    it("generates complete FFmpeg crop filter string", () => {
      const filter = buildFfmpegCropFilter(validCropTargetPayload.crop_targets);
      expect(filter).toBeDefined();
      expect(filter).toContain("crop=608:1080:");
      expect(filter).toContain(":exact=1");
      expect(filter).toContain("min(max(");
      expect(filter).toContain("iw-608");
      expect(filter).toContain("ih-1080");
    });
  });
});
