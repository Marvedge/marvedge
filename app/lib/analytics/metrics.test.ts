import { describe, expect, it } from "vitest";

import {
  averageSeconds,
  completion,
  rollingWindowStart,
  trend,
  utcMonthStart,
  utcPreviousMonthStart,
  type CompletionView,
} from "./metrics";

describe("utcMonthStart / utcPreviousMonthStart", () => {
  it("snap to midnight UTC on the first of the month", () => {
    expect(utcMonthStart(new Date("2026-10-19T15:30:00.000Z")).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    );
    expect(utcPreviousMonthStart(new Date("2026-10-19T15:30:00.000Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z"
    );
  });

  it("roll the year over in January", () => {
    expect(utcMonthStart(new Date("2026-01-31T23:59:59.999Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
    expect(utcPreviousMonthStart(new Date("2026-01-31T23:59:59.999Z")).toISOString()).toBe(
      "2025-12-01T00:00:00.000Z"
    );
  });
});

describe("rollingWindowStart", () => {
  it("starts 30 UTC day-buckets that end today", () => {
    const start = rollingWindowStart(new Date("2026-10-19T15:30:00.000Z"), 30);
    // 29 days before Oct 19 is Sep 20, at midnight UTC.
    expect(start.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("snaps the start to a UTC day boundary, not to the current minute", () => {
    const early = rollingWindowStart(new Date("2026-10-19T00:01:00.000Z"), 30);
    const late = rollingWindowStart(new Date("2026-10-19T23:59:00.000Z"), 30);
    expect(early.toISOString()).toBe(late.toISOString());
  });

  it("degenerates to today for a nonsense day count rather than throwing", () => {
    expect(rollingWindowStart(new Date("2026-10-19T15:30:00.000Z"), 0).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z"
    );
    expect(rollingWindowStart(new Date("2026-10-19T15:30:00.000Z"), NaN).toISOString()).toBe(
      "2026-10-19T00:00:00.000Z"
    );
  });
});

describe("averageSeconds", () => {
  it("treats a missing duration as zero watched seconds", () => {
    expect(averageSeconds([30, null, 0])).toBe(10);
  });

  it("returns null for an empty list so the caller can render an em dash", () => {
    expect(averageSeconds([])).toBeNull();
  });

  it("ignores non-finite values rather than poisoning the mean", () => {
    expect(averageSeconds([10, Number.NaN, Number.POSITIVE_INFINITY])).toBe(10 / 3);
  });
});

describe("completion", () => {
  const view = (duration: number | null, demoDuration: number | null): CompletionView => ({
    duration,
    demoDuration,
  });

  it("counts a view only when it reaches the demo's length", () => {
    const result = completion([view(45, 45), view(44, 45), view(60, 45)]);
    expect(result).toEqual({ percent: 67, completed: 2, measurable: 3 });
  });

  it("excludes views with no known demo length from the denominator", () => {
    // Two export views (no demo, no length) must not drag the rate down.
    const result = completion([view(30, 30), view(5, null), view(null, null)]);
    expect(result).toEqual({ percent: 100, completed: 1, measurable: 1 });
  });

  it("returns null, not 0%, when nothing is measurable", () => {
    expect(completion([view(10, null), view(null, 0)])).toEqual({
      percent: null,
      completed: 0,
      measurable: 0,
    });
  });

  it("caps at 100% even if a duration somehow overshoots", () => {
    expect(completion([view(999, 10), view(20, 10)]).percent).toBe(100);
  });
});

describe("trend", () => {
  it("reports a percent change for counts", () => {
    expect(trend(120, 100, "change")).toEqual({ value: "+20%", direction: "up" });
    expect(trend(80, 100, "change")).toEqual({ value: "-20%", direction: "down" });
  });

  it("reports a percentage-point delta for two rates", () => {
    expect(trend(42, 40, "points")).toEqual({ value: "+2%", direction: "up" });
    expect(trend(38, 40, "points")).toEqual({ value: "-2%", direction: "down" });
  });

  it("reports a raw second delta for durations", () => {
    expect(trend(72, 60, "seconds")).toEqual({ value: "+12s", direction: "up" });
    expect(trend(48, 60, "seconds")).toEqual({ value: "-12s", direction: "down" });
  });

  it("flattens an unchanged value", () => {
    expect(trend(100, 100, "change")).toEqual({ value: "0%", direction: "flat" });
  });

  it("gives a neutral dash when there is no baseline", () => {
    // A workspace whose first view landed this month has no previous month to
    // compare against; "+Infinity%" is not a number worth printing.
    expect(trend(5, 0, "change")).toEqual({ value: "—", direction: "none" });
    expect(trend(42, null, "points")).toEqual({ value: "—", direction: "none" });
    expect(trend(null, 10, "seconds")).toEqual({ value: "—", direction: "none" });
  });
});