// The arithmetic behind the signed-in analytics page.
//
// PURE, and deliberately so: no prisma, no Date.now(), no env. The page owns the
// queries and the clock; this module owns the maths, so every edge — an empty
// workspace, a month with no views, a demo whose length was never recorded, a
// view that has no demo at all — is a fixture in metrics.test.ts rather than a
// branch someone has to reason about while staring at a dashboard.

import { utcDayStart } from "@/app/lib/overlays/rollup";

export const DAY_MS = 86_400_000;

/** Midnight UTC on the first day of the month containing `value`. */
export function utcMonthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** Midnight UTC on the first day of the month BEFORE the one containing `value`. */
export function utcPreviousMonthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1, 0, 0, 0, 0));
}

/**
 * Midnight UTC `days` calendar days before the day containing `now`, counting
 * today as the last day. `rollingWindowStart(now, 30)` therefore starts a window
 * of exactly 30 day-buckets ending today (UTC).
 *
 * UTC rather than a fixed `now - N*86400000`: the chart's buckets are UTC days
 * (see app/lib/overlays/rollup.ts), and an unsnapped start would make the first
 * bucket a partial day that silently under-counts.
 */
export function rollingWindowStart(now: Date, days: number): Date {
  const safe = Number.isFinite(days) && days > 1 ? Math.floor(days) : 1;
  return new Date(utcDayStart(now).getTime() - (safe - 1) * DAY_MS);
}

/**
 * Mean watched seconds across `durations`.
 *
 * Nulls and non-finite values count as zero, which keeps the page's historical
 * "sum over every view" convention: a view that never reported a duration is a
 * view with zero watched seconds, not a view to ignore. An empty list has no
 * mean and returns null so the caller renders an em dash rather than "NaN".
 */
export function averageSeconds(durations: readonly (number | null)[]): number | null {
  if (durations.length === 0) {
    return null;
  }
  const total = durations.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0
  );
  return total / durations.length;
}

export interface CompletionView {
  /** Seconds watched, from `View.duration`. */
  duration: number | null;
  /** The demo's own length in seconds, or null when it is unknown. */
  demoDuration: number | null;
}

export interface CompletionResult {
  /** Whole-percent 0-100, or null when no view had a known demo length. */
  percent: number | null;
  completed: number;
  /** Views that had a positive demo length, and so could be judged at all. */
  measurable: number;
}

/**
 * Share of views that watched their demo to the end.
 *
 * A view counts as completed when the watched duration reaches the demo's own
 * length. Only views attached to a demo with a KNOWN positive length can be
 * judged: an exported-video view has no length, and a demo saved before
 * durations were recorded has none either. Those views are excluded from the
 * denominator rather than assumed incomplete, so a workspace with nothing
 * measurable reads "—" instead of a confident, fabricated "0%".
 */
export function completion(views: readonly CompletionView[]): CompletionResult {
  let completed = 0;
  let measurable = 0;

  for (const view of views) {
    const length = view.demoDuration;
    if (typeof length !== "number" || !Number.isFinite(length) || length <= 0) {
      continue;
    }
    measurable++;
    if (
      typeof view.duration === "number" &&
      Number.isFinite(view.duration) &&
      view.duration >= length
    ) {
      completed++;
    }
  }

  if (measurable === 0) {
    return { percent: null, completed, measurable };
  }
  return {
    percent: Math.min(100, Math.round((completed / measurable) * 100)),
    completed,
    measurable,
  };
}

export type TrendDirection = "up" | "down" | "flat" | "none";

export interface Trend {
  /** Display string, e.g. "+23%", "+12s", "-4%", or "—". */
  value: string;
  /** Which way the number moved, so the card can pick an arrow and a colour. */
  direction: TrendDirection;
}

/** A rounded integer with an explicit "+" so a rise reads as a rise. */
function signed(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function directionOf(delta: number): TrendDirection {
  if (!Number.isFinite(delta) || delta === 0) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
}

/**
 * Month-over-month change for a stat card.
 *
 * `kind` decides the unit:
 *   - "change": percent change of two counts (Total Views).
 *   - "points": percentage-POINT delta of two rates (Completion Rate, CTR).
 *   - "seconds": raw second delta of two averages (Avg Duration).
 *
 * A missing value — either month had nothing to measure, or the previous count
 * was zero and a percent change is undefined — yields a neutral "—" instead of
 * "+Infinity%" or a misleading 0%.
 */
export function trend(
  current: number | null,
  previous: number | null,
  kind: "change" | "points" | "seconds"
): Trend {
  if (current === null || previous === null) {
    return { value: "—", direction: "none" };
  }
  if (kind === "change") {
    if (previous <= 0) {
      return { value: "—", direction: "none" };
    }
    const delta = ((current - previous) / previous) * 100;
    return { value: `${signed(delta)}%`, direction: directionOf(delta) };
  }
  const delta = current - previous;
  const unit = kind === "seconds" ? "s" : "%";
  return { value: `${signed(delta)}${unit}`, direction: directionOf(delta) };
}