import { describe, expect, it } from "vitest";

import { shareAspectRatio, shareBackgroundStyle } from "./sharePresentation";

const fallback = { backgroundColor: "#F3F0FC" };

describe("shareBackgroundStyle", () => {
  it("falls back for a missing or invalid background", () => {
    expect(shareBackgroundStyle(null, fallback)).toEqual(fallback);
    expect(shareBackgroundStyle({ background: "url(https://evil.example)" }, fallback)).toEqual(
      fallback
    );
  });

  it("renders known image and gradient backgrounds", () => {
    expect(shareBackgroundStyle({ background: "def_mac_1" }, fallback)).toMatchObject({
      backgroundImage: "url(/background-default-images/mac-1.jpg)",
    });
    expect(shareBackgroundStyle({ background: "gradient:royal" }, fallback)).toHaveProperty(
      "background"
    );
  });

  it("renders only hex colours", () => {
    expect(shareBackgroundStyle({ background: "color:#123456" }, fallback)).toEqual({
      backgroundColor: "#123456",
    });
    expect(shareBackgroundStyle({ background: "color:red;background:url(x)" }, fallback)).toEqual(
      fallback
    );
  });

  it("refuses unsafe custom background URLs", () => {
    expect(
      shareBackgroundStyle(
        { background: "custom", customBackgroundUrl: "javascript:alert(1)" },
        fallback
      )
    ).toEqual(fallback);
    expect(
      shareBackgroundStyle(
        { background: "custom", customBackgroundUrl: "http://169.254.169.254/x.png" },
        fallback
      )
    ).toEqual(fallback);
  });

  it("encodes a safe custom background URL", () => {
    const style = shareBackgroundStyle(
      { background: "custom", customBackgroundUrl: "https://cdn.example.com/bg.png" },
      fallback
    );
    expect(style).toMatchObject({
      backgroundImage: 'url("https://cdn.example.com/bg.png")',
    });
  });
});

describe("shareAspectRatio", () => {
  it("only allows a real ratio or native", () => {
    expect(shareAspectRatio({ aspectRatio: "9:16" })).toBe("9:16");
    expect(shareAspectRatio({ aspectRatio: "native" })).toBe("native");
    expect(shareAspectRatio({ aspectRatio: "16:9;url(x)" })).toBe("16:9");
    expect(shareAspectRatio(null)).toBe("16:9");
  });
});
