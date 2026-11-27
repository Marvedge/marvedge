import { describe, expect, it } from "vitest";

import { detectMediaMime, mediaExtensionFor, normalizedMediaType } from "./mediaTypes";

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

describe("detectMediaMime", () => {
  it("recognises the supported raster signatures", () => {
    expect(detectMediaMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(detectMediaMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "image/png"
    );
    expect(detectMediaMime(Buffer.from("GIF89a trailing bytes"))).toBe("image/gif");
    expect(detectMediaMime(Buffer.from("GIF87a trailing bytes"))).toBe("image/gif");

    const webp = Buffer.alloc(16);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    expect(detectMediaMime(webp)).toBe("image/webp");
  });

  it("recognises mp4 and webm container signatures", () => {
    const mp4 = Buffer.alloc(16);
    mp4.write("ftyp", 4, "ascii");
    expect(detectMediaMime(mp4)).toBe("video/mp4");
    expect(detectMediaMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x43, 0xb6, 0x75]))).toBe(
      "video/webm"
    );
  });

  it("rejects script-bearing and truncated content", () => {
    expect(detectMediaMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectMediaMime(Buffer.from("<!doctype html><html></html>"))).toBeNull();
    expect(detectMediaMime(Buffer.alloc(0))).toBeNull();
    expect(detectMediaMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();

    const notWebp = Buffer.alloc(16);
    notWebp.write("RIFF", 0, "ascii");
    notWebp.write("AVI ", 8, "ascii");
    expect(detectMediaMime(notWebp)).toBeNull();
  });
});
