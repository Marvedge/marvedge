import { describe, expect, it } from "vitest";

import { mediaExtensionFor, normalizedMediaType } from "./mediaTypes";

describe("normalizedMediaType", () => {
  it("accepts allowlisted raster, video and audio types", () => {
    expect(normalizedMediaType("image/png")).toBe("image/png");
    expect(normalizedMediaType("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
    expect(normalizedMediaType("video/mp4")).toBe("video/mp4");
    expect(normalizedMediaType("audio/mpeg")).toBe("audio/mpeg");
  });

  it("rejects script-bearing and generic types", () => {
    expect(normalizedMediaType("image/svg+xml")).toBeNull();
    expect(normalizedMediaType("text/html")).toBeNull();
    expect(normalizedMediaType("application/octet-stream")).toBeNull();
    expect(normalizedMediaType("image/*")).toBeNull();
  });

  it("maps validated types to fixed suffixes", () => {
    expect(mediaExtensionFor("image/png")).toBe("png");
    expect(mediaExtensionFor("video/webm")).toBe("webm");
    expect(mediaExtensionFor("audio/mpeg")).toBe("mp3");
  });
});
