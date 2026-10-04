/**
 * Unit tests for the AVS dubbed-audio pacing logic (Task-00052).
 *
 * Tests the pure-logic decisions made by processDubSyncJob's per-step loop:
 * stretch ratio computation, freeze-residual detection, silence-pad detection.
 * FFmpeg calls are NOT invoked here (no real media files needed).
 */

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Inline the pure-logic helpers from server.js so we can test them without
// importing the entire Express app.
// ---------------------------------------------------------------------------

const AVS_DUB_STRETCH_MIN = 0.8;
const AVS_DUB_STRETCH_MAX = 1.25;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Mirrors the per-step pacing decision inside processDubSyncJob.
 * Returns { stretchedVideoDur, freeze, totalDur, outcome }.
 */
function computeDubPacing(tVideo, tDub) {
  if (tDub <= 0) {
    return {
      stretchedVideoDur: tVideo,
      freeze: 0,
      totalDur: tVideo,
      outcome: "silence",
    };
  }
  const ratio = tDub / tVideo;
  const clampedRatio = Math.min(
    AVS_DUB_STRETCH_MAX,
    Math.max(AVS_DUB_STRETCH_MIN, ratio),
  );
  const stretchedVideoDur = round3(tVideo * clampedRatio);
  let freeze = 0;
  let outcome;
  if (ratio > AVS_DUB_STRETCH_MAX) {
    freeze = round3(tDub - stretchedVideoDur);
    outcome = "stretch+freeze";
  } else if (ratio < AVS_DUB_STRETCH_MIN) {
    outcome = "stretch+silence";
  } else {
    outcome = "stretch";
  }
  const totalDur = round3(stretchedVideoDur + freeze);
  return { stretchedVideoDur, freeze, totalDur, outcome };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition, label) {
  expect(Boolean(condition), label).toBe(true);
}

function assertApprox(a, b, label, tol = 0.002) {
  expect(Math.abs(a - b), `${label} (${a} ≈ ${b})`).toBeLessThanOrEqual(tol);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AVS dubbed-audio pacing engine (Task-00052)", () => {
  // 1. Ratio exactly 1.0 — no stretch, no freeze.
  it("ratio=1.0 — no stretch, no freeze", () => {
    const r = computeDubPacing(5.0, 5.0);
    assert(r.outcome === "stretch", "ratio=1.0 → stretch outcome");
    assertApprox(r.stretchedVideoDur, 5.0, "ratio=1.0 → stretchedVideoDur=5.0");
    assertApprox(r.freeze, 0, "ratio=1.0 → no freeze");
    assertApprox(r.totalDur, 5.0, "ratio=1.0 → totalDur=5.0");
  });

  // 2. ratio=1.1 (dub 10% longer) — in-range stretch, video slows.
  it("ratio=1.1 (dub 10% longer) — in-range stretch, video slows", () => {
    const r = computeDubPacing(5.0, 5.5);
    assert(r.outcome === "stretch", "ratio=1.1 → stretch outcome");
    assertApprox(r.stretchedVideoDur, 5.5, "ratio=1.1 → stretchedVideoDur=5.5");
    assertApprox(r.freeze, 0, "ratio=1.1 → no freeze");
    assertApprox(r.totalDur, 5.5, "ratio=1.1 → totalDur=5.5");
  });

  // 3. ratio=0.9 (dub 10% shorter) — in-range stretch, video speeds up.
  it("ratio=0.9 (dub 10% shorter) — in-range stretch, video speeds up", () => {
    const r = computeDubPacing(5.0, 4.5);
    assert(r.outcome === "stretch", "ratio=0.9 → stretch outcome");
    assertApprox(r.stretchedVideoDur, 4.5, "ratio=0.9 → stretchedVideoDur=4.5");
    assertApprox(r.freeze, 0, "ratio=0.9 → no freeze");
    assertApprox(r.totalDur, 4.5, "ratio=0.9 → totalDur=4.5");
  });

  // 4. ratio=1.25 (right at MAX) — still pure stretch, no freeze.
  it("ratio=1.25 (right at MAX) — still pure stretch, no freeze", () => {
    const r = computeDubPacing(4.0, 5.0);
    assert(r.outcome === "stretch", "ratio=1.25 → stretch outcome (at MAX boundary)");
    assertApprox(r.stretchedVideoDur, 5.0, "ratio=1.25 → stretchedVideoDur=5.0");
    assertApprox(r.freeze, 0, "ratio=1.25 → no freeze");
  });

  // 5. ratio=1.5 (dub much longer) — exceeds MAX: stretch clamped to 1.25 + freeze residual.
  it("ratio=1.5 (dub much longer) — exceeds MAX: stretch clamped to 1.25 + freeze residual", () => {
    const r = computeDubPacing(4.0, 6.0);
    assert(r.outcome === "stretch+freeze", "ratio=1.5 → stretch+freeze outcome");
    assertApprox(r.stretchedVideoDur, 5.0, "ratio=1.5 → stretchedVideoDur=5.0 (4*1.25)");
    assertApprox(r.freeze, 1.0, "ratio=1.5 → freeze=1.0 (residual)");
    assertApprox(r.totalDur, 6.0, "ratio=1.5 → totalDur=6.0");
  });

  // 6. ratio=0.8 (right at MIN) — still pure stretch.
  it("ratio=0.8 (right at MIN) — still pure stretch", () => {
    const r = computeDubPacing(5.0, 4.0);
    assert(r.outcome === "stretch", "ratio=0.8 → stretch outcome (at MIN boundary)");
    assertApprox(r.stretchedVideoDur, 4.0, "ratio=0.8 → stretchedVideoDur=4.0");
    assertApprox(r.freeze, 0, "ratio=0.8 → no freeze");
  });

  // 7. ratio=0.5 (dub much shorter) — below MIN: silence pad.
  it("ratio=0.5 (dub much shorter) — below MIN: silence pad", () => {
    const r = computeDubPacing(6.0, 3.0);
    assert(r.outcome === "stretch+silence", "ratio=0.5 → stretch+silence outcome");
    assertApprox(r.stretchedVideoDur, round3(6.0 * 0.8), "ratio=0.5 → stretchedVideoDur=4.8 (6*MIN)");
    assertApprox(r.freeze, 0, "ratio=0.5 → no freeze-frame (silence tail instead)");
    assertApprox(r.totalDur, round3(6.0 * 0.8), "ratio=0.5 → totalDur=4.8");
  });

  // 8. tDub=0 (no dub for this step) — silence only, video unchanged.
  it("tDub=0 (no dub for this step) — silence only, video unchanged", () => {
    const r = computeDubPacing(5.0, 0);
    assert(r.outcome === "silence", "tDub=0 → silence outcome");
    assertApprox(r.stretchedVideoDur, 5.0, "tDub=0 → stretchedVideoDur=5.0");
    assertApprox(r.freeze, 0, "tDub=0 → no freeze");
    assertApprox(r.totalDur, 5.0, "tDub=0 → totalDur=5.0");
  });

  // 9. Very short step (tVideo=0.1) — ratio=1.5 > MAX: stretch+freeze, no crash or negative values.
  it("Very short step (tVideo=0.1) — ratio=1.5 > MAX: stretch+freeze, no crash or negative values", () => {
    const r = computeDubPacing(0.1, 0.15);
    assert(r.outcome === "stretch+freeze", "short step → stretch+freeze outcome (ratio=1.5)");
    assert(r.freeze >= 0, "short step → freeze non-negative");
    assert(r.totalDur > 0, "short step → totalDur positive");
  });

  // 10. totalDur integrity: stretchedVideoDur + freeze must always equal totalDur.
  it("totalDur integrity: stretchedVideoDur + freeze must always equal totalDur", () => {
    const cases = [
      [5, 5], [5, 5.5], [5, 4.5], [4, 6], [6, 3], [3, 7], [10, 8],
    ];
    for (const [tv, td] of cases) {
      const r = computeDubPacing(tv, td);
      assertApprox(
        r.totalDur,
        round3(r.stretchedVideoDur + r.freeze),
        `totalDur integrity [tVideo=${tv}, tDub=${td}]`,
      );
    }
  });
});
