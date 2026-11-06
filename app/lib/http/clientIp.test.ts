import { describe, expect, it } from "vitest";

import { getClientIp } from "./clientIp";

function headers(values: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return values[name] ?? null;
    },
  };
}

describe("getClientIp", () => {
  it("returns a single x-forwarded-for value", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("uses the rightmost value and ignores a spoofed left-hand entry", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("skips empty entries when selecting the rightmost value", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, ," }))).toBe(
      "203.0.113.9"
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    expect(getClientIp(headers({ "x-real-ip": "198.51.100.20" }))).toBe("198.51.100.20");
  });

  it("falls back to x-real-ip when every forwarded entry is empty", () => {
    expect(getClientIp(headers({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.20" }))).toBe(
      "198.51.100.20"
    );
  });

  it("returns unknown when no header is present", () => {
    expect(getClientIp(headers({}))).toBe("unknown");
  });

  it("rejects oversized values", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "1".repeat(65) }))).toBe("unknown");
  });

  it("rejects values containing whitespace or control characters", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "203.0.113.9\tbad" }))).toBe("unknown");
    expect(getClientIp(headers({ "x-real-ip": "203.0.113.9\u0000" }))).toBe("unknown");
  });

  it("rejects an invalid rightmost value instead of trusting a left-hand one", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9 bad" }))).toBe("unknown");
  });
});
