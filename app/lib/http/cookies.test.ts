import { describe, expect, it } from "vitest";

import { hasCookie } from "./cookies";

describe("hasCookie", () => {
  it("matches an exact cookie name", () => {
    expect(hasCookie("viewed_x=1", "viewed_x")).toBe(true);
  });

  it("does not match a longer cookie name that contains the key", () => {
    expect(hasCookie("viewed_x_extra=1", "viewed_x")).toBe(false);
    expect(hasCookie("viewed_x_extra=1; other=2", "viewed_x")).toBe(false);
  });

  it("does not match a shorter cookie name that contains the key", () => {
    expect(hasCookie("not_viewed_x=1", "viewed_x")).toBe(false);
  });

  it("does not match when only a value contains the name", () => {
    expect(hasCookie("other=viewed_x", "viewed_x")).toBe(false);
    expect(hasCookie("other=something; note=viewed_x_extra", "viewed_x")).toBe(false);
  });

  it("ignores whitespace around names and segments", () => {
    expect(hasCookie("a=1;  viewed_x = 1 ; b=2", "viewed_x")).toBe(true);
    expect(hasCookie("  viewed_x=1  ", "viewed_x")).toBe(true);
  });

  it("finds a cookie among several", () => {
    expect(hasCookie("a=1; b=2; viewed_x=1; c=3", "viewed_x")).toBe(true);
  });

  it("returns false for empty, missing, or malformed headers", () => {
    expect(hasCookie("", "viewed_x")).toBe(false);
    expect(hasCookie(null, "viewed_x")).toBe(false);
    expect(hasCookie(undefined, "viewed_x")).toBe(false);
    expect(hasCookie(";;;", "viewed_x")).toBe(false);
    expect(hasCookie("viewed_x", "viewed_x")).toBe(false);
  });

  it("handles duplicate names safely", () => {
    expect(hasCookie("viewed_x=1; viewed_x=2", "viewed_x")).toBe(true);
    expect(hasCookie("viewed_x=; viewed_x=1", "viewed_x")).toBe(true);
  });

  it("returns false for an empty name", () => {
    expect(hasCookie("viewed_x=1", "")).toBe(false);
  });
});
