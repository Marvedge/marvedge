import { describe, expect, it } from "vitest";
import { buildSplitScreenBlurFilter } from "./splitScreenBlur";

describe("buildSplitScreenBlurFilter", () => {
  it("uses the default blur strength", () => {
    expect(
      buildSplitScreenBlurFilter({ width: 1280, height: 720 })
    ).toContain("gblur=sigma=20");
  });

  it("supports custom blur strength", () => {
    expect(
      buildSplitScreenBlurFilter({
        width: 1280,
        height: 720,
        blurStrength: 10,
      })
    ).toContain("gblur=sigma=10");
  });

  it("scales and crops to the requested dimensions", () => {
    const filter = buildSplitScreenBlurFilter({
      width: 1280,
      height: 720,
    });

    expect(filter).toContain(
      "scale=1280:720:force_original_aspect_ratio=increase"
    );
    expect(filter).toContain("crop=1280:720");
  });

  it("configures output format and aspect ratio", () => {
    expect(
      buildSplitScreenBlurFilter({ width: 1280, height: 720 })
    ).toContain("setsar=1,format=yuv420p");
  });

  it("rejects zero width", () => {
    expect(() =>
      buildSplitScreenBlurFilter({ width: 0, height: 720 })
    ).toThrow();
  });

  it("rejects negative height", () => {
    expect(() =>
      buildSplitScreenBlurFilter({ width: 1280, height: -720 })
    ).toThrow();
  });

  it("rejects negative blur strength", () => {
    expect(() =>
      buildSplitScreenBlurFilter({
        width: 1280,
        height: 720,
        blurStrength: -5,
      })
    ).toThrow();
  });
});