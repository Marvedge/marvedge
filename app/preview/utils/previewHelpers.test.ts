import { describe, expect, it, vi } from "vitest";

import {
  downloadVideoAs,
  getVideoFormatLabel,
  isSafePreviewUrl,
} from "./previewHelpers";

const VALID_URL = "https://res.cloudinary.com/demo/video/upload/v12345/clip.mp4";

describe("isSafePreviewUrl", () => {
  it("allows http(s) URLs of sane length", () => {
    expect(isSafePreviewUrl(VALID_URL)).toBe(true);
    expect(isSafePreviewUrl("http://cdn.example.com/videos/clip.webm")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafePreviewUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePreviewUrl("  javascript:alert(1)  ")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafePreviewUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafePreviewUrl("data:video/mp4;base64,AAAA")).toBe(false);
  });

  it("rejects protocol-relative and non-string inputs", () => {
    expect(isSafePreviewUrl("//evil.example/clip.mp4")).toBe(false);
    expect(isSafePreviewUrl(null)).toBe(false);
    expect(isSafePreviewUrl(undefined)).toBe(false);
  });

  it("rejects short strings", () => {
    expect(isSafePreviewUrl("")).toBe(false);
    expect(isSafePreviewUrl("abc")).toBe(false);
    expect(isSafePreviewUrl("x.mp4")).toBe(false);
    expect(isSafePreviewUrl("short")).toBe(false);
  });
});

describe("getVideoFormatLabel", () => {
  it("labels valid URLs exactly like before", () => {
    expect(getVideoFormatLabel(VALID_URL)).toBe("MP4");
    expect(getVideoFormatLabel("https://cdn.example.com/videos/clip.webm?x=1")).toBe("WEBM");
  });

  it("never throws on hostile or short inputs", () => {
    expect(getVideoFormatLabel("javascript:alert(1)")).toBe("Unknown");
    expect(getVideoFormatLabel("data:video/mp4;base64,AAAA")).toBe("Unknown");
    expect(getVideoFormatLabel("abc")).toBe("Unknown");
    expect(getVideoFormatLabel("x")).toBe("Unknown");
    expect(getVideoFormatLabel("https://cdn.example.com/nodotpath")).toBe("Unknown");
  });
});

describe("downloadVideoAs", () => {
  it("blocks the fetch sink for unsafe URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(downloadVideoAs("javascript:alert(1)", "clip.mp4")).rejects.toThrow(
        /unsafe/i
      );
      await expect(
        downloadVideoAs("data:video/mp4;base64,AAAA", "clip.mp4")
      ).rejects.toThrow(/unsafe/i);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
