    it("simplifies stationary crop targets down to boundaries", () => {
      const stationaryTargets = Array.from({ length: 100 }, (_, i) => ({
        timestamp_sec: i * 0.04,
        frame: i,
        crop: { x: 100, y: 50, width: 608, height: 1080 },
      }));
      const filter = buildFfmpegCropFilter(stationaryTargets);
      expect(filter).toBeDefined();
      // Should not contain 100 nested if statements
      expect(filter).not.toContain("if(lt(t,3.0000)");
      // Stationary simplifies to start and end
      expect(filter).toContain("100.0000");
    });

  });

  describe("run_autoflip_to_json contract conformance", () => {
    it("validates mock output payload from run_autoflip_to_json", () => {
      const autoflipOutput: CropTargetData = {
        schema_version: 1,
        source: {
          width: 1920,
          height: 1080,
          fps: 29.97,
          duration_sec: 15.5,
        },
        output: {
          aspect_ratio: "9:16",
        },
        timeline: {
          timebase: "seconds",
          sampling: "keyframes_interpolated",
        },
        crop_targets: [
          {
            timestamp_sec: 0.0,
            frame: 0,
            crop: { x: 650.0, y: 0.0, width: 608.0, height: 1080.0 },
            source: "autoflip",
          },
          {
            timestamp_sec: 0.0334,
            frame: 1,
            crop: { x: 652.5, y: 0.0, width: 608.0, height: 1080.0 },
            source: "autoflip",
          },
        ],
      };
      expect(() => validateCropTargetData(autoflipOutput)).not.toThrow();
    });

    it("rejects overflowed timestamp payload from run_autoflip_to_json", () => {
      const overflowOutput = {
        schema_version: 1,
        source: {
          width: 720,
          height: 480,
          fps: 29.97,
          duration_sec: 15.45,
        },
        output: {
          aspect_ratio: "9:16",
        },
        timeline: {
          timebase: "seconds",
          sampling: "keyframes_interpolated",
        },
        crop_targets: [
          {
            timestamp_sec: 18446744073709.52,
            frame: 0,
            crop: { x: 225.0, y: 0.0, width: 270.0, height: 480.0 },
            source: "autoflip",
          },
        ],
      };
      expect(() => validateCropTargetData(overflowOutput)).toThrow(
        CropTargetValidationError
      );
      expect(() => validateCropTargetData(overflowOutput)).toThrow(
        /exceeds duration/
      );
    });
  });

});