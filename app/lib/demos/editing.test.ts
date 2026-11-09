import { describe, expect, it } from "vitest";

import { isSafeBackgroundValue, sanitizeEditingPayload } from "./editing";

describe("sanitizeEditingPayload", () => {
  it("accepts a canonical editor payload", () => {
    const result = sanitizeEditingPayload({
      segments: [{ start: "0", end: "4" }],
      background: "gradient:royal",
      backgroundType: "gradient",
      aspectRatio: "16:9",
      subtitleStyle: { color: "#ffffff", fontSizePct: 12 },
      textOverlays: [{ id: "a", text: "Hello <world>" }],
    });

    expect(result.ok).toBe(true);
  });

  it("returns null for an absent payload", () => {
    expect(sanitizeEditingPayload(undefined)).toEqual({ ok: true, value: null });
    expect(sanitizeEditingPayload(null)).toEqual({ ok: true, value: null });
  });

  it("rejects non-objects", () => {
    expect(sanitizeEditingPayload("string").ok).toBe(false);
    expect(sanitizeEditingPayload([1, 2]).ok).toBe(false);
  });

  it("rejects CSS injection in the background field", () => {
    const result = sanitizeEditingPayload({
      background: "color:red;background-image:url(https://evil.example/x)",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects javascript: and http: custom backgrounds", () => {
    expect(
      sanitizeEditingPayload({ background: "custom", customBackgroundUrl: "javascript:alert(1)" })
        .ok
    ).toBe(false);
    expect(
      sanitizeEditingPayload({
        background: "custom",
        customBackgroundUrl: "http://example.com/bg.png",
      }).ok
    ).toBe(false);
  });

  it("accepts a public https custom background", () => {
    const result = sanitizeEditingPayload({
      background: "custom",
      customBackgroundUrl: "https://cdn.example.com/bg.png",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects prototype pollution keys", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(sanitizeEditingPayload(payload).ok).toBe(false);
  });

  it("rejects invalid subtitle colours", () => {
    expect(sanitizeEditingPayload({ subtitleStyle: { color: "red;background:url(x)" } }).ok).toBe(
      false
    );
  });

  it("rejects invalid aspect ratios", () => {
    expect(sanitizeEditingPayload({ aspectRatio: "16:9;url(x)" }).ok).toBe(false);
    expect(sanitizeEditingPayload({ aspectRatio: "native" }).ok).toBe(true);
    expect(sanitizeEditingPayload({ aspectRatio: "9:16" }).ok).toBe(true);
  });

  it("keeps text content as data rather than stripping it", () => {
    const result = sanitizeEditingPayload({ textOverlays: [{ text: "<script>x</script>" }] });
    expect(result.ok).toBe(true);
  });
});

describe("isSafeBackgroundValue", () => {
  it("allows only known backgrounds", () => {
    expect(isSafeBackgroundValue("def_mac_1")).toBe(true);
    expect(isSafeBackgroundValue("color:#ffffff")).toBe(true);
    expect(isSafeBackgroundValue("gradient:royal")).toBe(true);
    expect(isSafeBackgroundValue("gradient:unknown")).toBe(false);
    expect(isSafeBackgroundValue("url(https://evil.example)")).toBe(false);
  });
});
