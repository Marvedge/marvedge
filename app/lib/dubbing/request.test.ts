import { describe, expect, it } from "vitest";

import { buildDubRequest, dubToHttpsUrl, sanitizeDubSteps, sanitizeDubTimings } from "./request";

const VALID_INPUT = {
  videoUrl: "https://cdn.example/demo.mp4",
  dubUrl: "https://cdn.example/dub.mp3",
  steps: [
    { id: "step-0", index: 0, startTime: 0, endTime: 4.2 },
    { id: "step-4200", index: 1, startTime: 4.2, endTime: 9.7 },
  ],
  dubTimings: [
    { stepId: "step-0", start: 0, end: 4.1 },
    { stepId: "step-4200", start: 4.1, end: 9.5 },
  ],
  duration: 9.7,
  demoId: "demo-1",
};

describe("buildDubRequest", () => {
  it("builds the documented contract body and sends both duration spellings", () => {
    const result = buildDubRequest(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.body.videoUrl).toBe(VALID_INPUT.videoUrl);
    expect(result.body.dubUrl).toBe(VALID_INPUT.dubUrl);
    expect(result.body.duration).toBe(9.7);
    expect(result.body.sourceDuration).toBe(9.7);
    expect(result.body.demoId).toBe("demo-1");
    expect(result.body.steps).toHaveLength(2);
    expect(result.body.dubTimings).toHaveLength(2);
  });

  it("rejects a missing videoUrl", () => {
    expect(buildDubRequest({ ...VALID_INPUT, videoUrl: "" }).ok).toBe(false);
    expect(buildDubRequest({ ...VALID_INPUT, videoUrl: null }).ok).toBe(false);
    expect(buildDubRequest({ ...VALID_INPUT, videoUrl: "   " }).ok).toBe(false);
  });

  it("rejects a non-positive source duration", () => {
    expect(buildDubRequest({ ...VALID_INPUT, duration: 0 }).ok).toBe(false);
    expect(buildDubRequest({ ...VALID_INPUT, duration: -3 }).ok).toBe(false);
    expect(buildDubRequest({ ...VALID_INPUT, duration: NaN }).ok).toBe(false);
  });

  it("defaults sourceDuration to duration", () => {
    const result = buildDubRequest(VALID_INPUT);
    if (!result.ok) {
      return;
    }
    expect(result.body.sourceDuration).toBe(result.body.duration);
  });

  it("normalizes gs:// URLs to public https URLs", () => {
    const result = buildDubRequest({
      ...VALID_INPUT,
      videoUrl: "gs://bucket/demo.mp4",
      dubUrl: "gs://bucket/dub.mp3",
    });
    if (!result.ok) {
      return;
    }
    expect(result.body.videoUrl).toBe("https://storage.googleapis.com/bucket/demo.mp4");
    expect(result.body.dubUrl).toBe("https://storage.googleapis.com/bucket/dub.mp3");
  });

  it("degrades like the route when dubUrl or dubTimings are absent", () => {
    for (const partial of [
      { ...VALID_INPUT, dubUrl: "" },
      { ...VALID_INPUT, dubTimings: [] },
      { ...VALID_INPUT, steps: [] },
    ]) {
      const result = buildDubRequest(partial);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.body.demoId).toBe("demo-1");
    }
  });

  it("dropped demoId when it is not a non-empty string", () => {
    const result = buildDubRequest({ ...VALID_INPUT, demoId: null });
    if (!result.ok) {
      return;
    }
    expect(result.body.demoId).toBeNull();
  });
});

describe("sanitizeDubSteps", () => {
  it("keeps only valid, forward-ordered steps", () => {
    const steps = sanitizeDubSteps([
      { id: "a", startTime: 0, endTime: 5 },
      { id: "b", startTime: 5, endTime: 2 }, // end <= start → dropped
      { id: "c", startTime: NaN, endTime: 5 }, // non-finite → dropped
      { id: 42, startTime: 0, endTime: 5 }, // id not string → dropped
      "not-an-object",
      null,
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("a");
    expect(steps[0].index).toBe(0);
  });

  it("assigns positional index when one is absent", () => {
    const steps = sanitizeDubSteps([
      { id: "a", startTime: 0, endTime: 5 },
      { id: "b", startTime: 5, endTime: 10 },
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1]);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeDubSteps(null)).toEqual([]);
    expect(sanitizeDubSteps("abc")).toEqual([]);
  });
});

describe("sanitizeDubTimings", () => {
  it("keeps only valid, forward-ordered markers", () => {
    const timings = sanitizeDubTimings([
      { stepId: "s1", start: 0, end: 4 },
      { stepId: "s2", start: 9, end: 2 }, // end <= start → dropped
      { stepId: "s1", start: "0", end: "4" }, // non-number → dropped
    ]);
    expect(timings).toHaveLength(1);
    expect(timings[0]).toEqual({ stepId: "s1", start: 0, end: 4 });
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeDubTimings(undefined)).toEqual([]);
    expect(sanitizeDubTimings({})).toEqual([]);
  });
});

describe("dubToHttpsUrl", () => {
  it("maps gs:// to storage.googleapis.com and leaves https untouched", () => {
    expect(dubToHttpsUrl("gs://b/f.mp4")).toBe("https://storage.googleapis.com/b/f.mp4");
    expect(dubToHttpsUrl("https://cdn.example/f.mp4")).toBe("https://cdn.example/f.mp4");
  });
});
