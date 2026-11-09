import { describe, expect, it } from "vitest";
import { isValidCustomDomain, normalizeCustomDomain } from "./customDomain";

describe("normalizeCustomDomain", () => {
  it("lowercases and accepts a simple domain", () => {
    expect(normalizeCustomDomain("Example.COM")).toEqual({
      ok: true,
      value: "example.com",
    });
  });

  it("accepts multi-part public suffixes", () => {
    expect(normalizeCustomDomain("hub.example.co.uk")).toEqual({
      ok: true,
      value: "hub.example.co.uk",
    });
  });

  it("strips one trailing dot", () => {
    expect(normalizeCustomDomain("example.com.")).toEqual({
      ok: true,
      value: "example.com",
    });
  });

  it("clears the domain for null, undefined, and blank input", () => {
    expect(normalizeCustomDomain(null)).toEqual({ ok: true, value: null });
    expect(normalizeCustomDomain(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeCustomDomain("")).toEqual({ ok: true, value: null });
    expect(normalizeCustomDomain("   ")).toEqual({ ok: true, value: null });
  });

  it.each(["http://example.com", "example.com/path", "example.com:443", "user@example.com"])(
    "rejects scheme, path, port, or credentials: %s",
    (raw) => {
      expect(normalizeCustomDomain(raw).ok).toBe(false);
    }
  );

  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "0x7f000001"])(
    "rejects IP literals: %s",
    (raw) => {
      expect(normalizeCustomDomain(raw).ok).toBe(false);
    }
  );

  it.each(["localhost", "foo.local", "metadata.google.internal", "service.internal"])(
    "rejects private or reserved names: %s",
    (raw) => {
      expect(normalizeCustomDomain(raw).ok).toBe(false);
    }
  );

  it.each(["-bad.example.com", "bad-.example.com", "foo_bar.example.com"])(
    "rejects invalid labels: %s",
    (raw) => {
      expect(normalizeCustomDomain(raw).ok).toBe(false);
    }
  );

  it("rejects a label longer than 63 characters", () => {
    const raw = `${"a".repeat(64)}.example.com`;
    expect(normalizeCustomDomain(raw).ok).toBe(false);
  });

  it("rejects a hostname longer than 253 characters", () => {
    const label = "a".repeat(60);
    const raw = `${label}.${label}.${label}.${label}.example.com`;
    expect(raw.length).toBeGreaterThan(253);
    expect(normalizeCustomDomain(raw).ok).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(normalizeCustomDomain(42)).toEqual({
      ok: false,
      error: "Custom domain must be a string",
    });
    expect(normalizeCustomDomain({ domain: "example.com" }).ok).toBe(false);
  });

  it("does not echo raw input in error messages", () => {
    const result = normalizeCustomDomain("127.0.0.1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("127.0.0.1");
    }
  });
});

describe("isValidCustomDomain", () => {
  it("wraps the validator result", () => {
    expect(isValidCustomDomain("example.com")).toBe(true);
    expect(isValidCustomDomain("localhost")).toBe(false);
    expect(isValidCustomDomain(null)).toBe(true);
  });
});
