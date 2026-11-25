import { describe, expect, it } from "vitest";

import { getSafeCallbackUrl, SIGN_IN_FALLBACK_URL } from "./redirect";

const BASE = "https://app.example.com";

describe("getSafeCallbackUrl", () => {
  it("keeps relative same-origin paths", () => {
    expect(getSafeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeCallbackUrl("/videos/1?tab=2#captions")).toBe("/videos/1?tab=2#captions");
    expect(getSafeCallbackUrl("/")).toBe("/");
  });

  it("accepts absolute URLs on the configured origin", () => {
    expect(getSafeCallbackUrl(`${BASE}/dashboard`, BASE)).toBe("/dashboard");
    expect(getSafeCallbackUrl(`${BASE}/share/abc?utm=1`, BASE)).toBe("/share/abc?utm=1");
  });

  it("rejects other origins and protocol-relative URLs", () => {
    expect(getSafeCallbackUrl("https://evil.example/phish", BASE)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("//evil.example/phish", BASE)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("http://app.example.com/phish", BASE)).toBe(SIGN_IN_FALLBACK_URL);
  });

  it("rejects scheme, backslash and control-character tricks", () => {
    expect(getSafeCallbackUrl("javascript:alert(1)", BASE)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("/\\evil.example", BASE)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("/dashboard\nhttps://evil.example", BASE)).toBe(SIGN_IN_FALLBACK_URL);
  });

  it("falls back when no base URL is available for an absolute URL", () => {
    expect(getSafeCallbackUrl(`${BASE}/dashboard`)).toBe(SIGN_IN_FALLBACK_URL);
  });
});
