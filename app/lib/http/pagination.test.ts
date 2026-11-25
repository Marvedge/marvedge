import { describe, expect, it } from "vitest";

import { parsePagination, parsePositiveLimit } from "./pagination";

const OPTIONS = { defaultPageSize: 25, maxPageSize: 100 };

function params(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

describe("parsePagination", () => {
  it("uses defaults when values are absent", () => {
    expect(parsePagination(params({}), OPTIONS)).toEqual({ page: 1, pageSize: 25, skip: 0 });
  });

  it("caps page size and page number, and bounds the offset", () => {
    expect(parsePagination(params({ pageSize: "10000", page: "999999" }), OPTIONS)).toEqual({
      page: 10001,
      pageSize: 100,
      skip: 1_000_000,
    });
  });

  it("falls back for negative, fractional, NaN and infinite values", () => {
    for (const bad of ["-5", "0", "2.5", "NaN", "Infinity", "abc"]) {
      expect(parsePagination(params({ pageSize: bad, page: bad }), OPTIONS)).toEqual({
        page: 1,
        pageSize: 25,
        skip: 0,
      });
    }
  });

  it("keeps valid values", () => {
    expect(parsePagination(params({ pageSize: "50", page: "3" }), OPTIONS)).toEqual({
      page: 3,
      pageSize: 50,
      skip: 100,
    });
  });
});

describe("parsePositiveLimit", () => {
  it("caps and sanitizes a sweep limit", () => {
    expect(parsePositiveLimit("5000", 50, 200)).toBe(200);
    expect(parsePositiveLimit("12", 50, 200)).toBe(12);
    expect(parsePositiveLimit("-1", 50, 200)).toBe(50);
    expect(parsePositiveLimit("1.5", 50, 200)).toBe(50);
    expect(parsePositiveLimit(null, 50, 200)).toBe(50);
  });
});
