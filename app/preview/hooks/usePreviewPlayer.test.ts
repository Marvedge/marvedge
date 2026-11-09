import { describe, expect, it } from "vitest";

import { resolvePreviewVideoUrl } from "./usePreviewPlayer";

const VALID_URL = "https://res.cloudinary.com/demo/video/upload/v12345/clip.mp4";

describe("resolvePreviewVideoUrl", () => {
  it("passes through valid http(s) video URLs", () => {
    expect(resolvePreviewVideoUrl(VALID_URL)).toBe(VALID_URL);
  });

  it("blocks javascript: URLs", () => {
    expect(resolvePreviewVideoUrl("javascript:alert(1)")).toBeNull();
  });

  it("blocks data: URLs", () => {
    expect(resolvePreviewVideoUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(resolvePreviewVideoUrl("data:video/mp4;base64,AAAA")).toBeNull();
  });

  it("blocks short strings and missing params", () => {
    expect(resolvePreviewVideoUrl("abc")).toBeNull();
    expect(resolvePreviewVideoUrl("x.mp4")).toBeNull();
    expect(resolvePreviewVideoUrl("")).toBeNull();
    expect(resolvePreviewVideoUrl(null)).toBeNull();
    expect(resolvePreviewVideoUrl(undefined)).toBeNull();
  });

  it("blocks protocol-relative URLs", () => {
    expect(resolvePreviewVideoUrl("//evil.example/clip.mp4")).toBeNull();
  });
});
