import { describe, expect, it } from "vitest";

import { getSafeCallbackUrl, SIGN_IN_FALLBACK_URL } from "./useSignIn";

describe("getSafeCallbackUrl", () => {
  it("passes through valid same-origin paths unchanged", () => {
    expect(getSafeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeCallbackUrl("/videos/123?tab=1")).toBe("/videos/123?tab=1");
    expect(getSafeCallbackUrl("/")).toBe("/");
  });

  it("falls back for missing or empty values", () => {
    expect(getSafeCallbackUrl(null)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl(undefined)).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("")).toBe(SIGN_IN_FALLBACK_URL);
  });

  it("rejects protocol-relative open redirects", () => {
    expect(getSafeCallbackUrl("//evil.example")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("//evil.example/phish")).toBe(SIGN_IN_FALLBACK_URL);
  });

  it("rejects backslash-prefixed bypasses", () => {
    expect(getSafeCallbackUrl("/\\/evil")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("/\\evil.example")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("\\evil.example")).toBe(SIGN_IN_FALLBACK_URL);
  });

  it("rejects absolute URLs", () => {
    expect(getSafeCallbackUrl("https://evil")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("https://evil.example/phish")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("http://evil.example")).toBe(SIGN_IN_FALLBACK_URL);
    expect(getSafeCallbackUrl("javascript:alert(1)")).toBe(SIGN_IN_FALLBACK_URL);
  });
});
