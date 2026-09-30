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
  });

});