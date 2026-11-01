import { describe, expect, it } from "vitest";
import { detectMedia, kindOf, nameFromFile } from "@/lib/media-detect";

const f = (name: string, type = "") => ({ name, type });

describe("media detection", () => {
  it("sends videos to the video editor", () => {
    expect(detectMedia([f("a.mp4", "video/mp4"), f("b.mov", "video/quicktime")]).suggestion).toBe("video");
  });
  it("sends images to the guided demo editor", () => {
    expect(detectMedia([f("s.png", "image/png"), f("t.jpg", "image/jpeg")]).suggestion).toBe("demo");
  });
  it("asks when videos and images are mixed", () => {
    expect(detectMedia([f("a.mp4", "video/mp4"), f("s.png", "image/png")]).suggestion).toBe("mixed");
  });
  it("skips unsupported files", () => {
    const d = detectMedia([f("notes.pdf", "application/pdf"), f("logo.svg", "image/svg+xml")]);
    expect(d.suggestion).toBe("none");
    expect(d.skipped).toHaveLength(2);
  });
  it("falls back to the file ending when the type is missing", () => {
    expect(kindOf(f("clip.webm"))).toBe("video");
    expect(kindOf(f("shot.PNG"))).toBe("image");
  });
  it("orders screenshots by file name, numbers naturally", () => {
    const d = detectMedia([f("step 10.png", "image/png"), f("step 2.png", "image/png"), f("step 1.png", "image/png")]);
    expect(d.images.map((x) => x.name)).toEqual(["step 1.png", "step 2.png", "step 10.png"]);
  });
  it("names the project from the first file", () => {
    expect(nameFromFile("product_tour-v2.mp4")).toBe("product tour v2");
  });
});
