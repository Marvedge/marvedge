import { describe, it, expect } from "vitest";
import {
  clipJunctions,
  addTransitionAt,
  isTransitionEvent,
  eventTemplate,
  type EditorEvent,
} from "@/lib/editor-model";

function clip(id: string, start: number, duration: number): EditorEvent {
  return { ...eventTemplate("video", "Recording", start), id, duration };
}

describe("clipJunctions", () => {
  it("finds the join between two adjacent clips", () => {
    const events = [clip("a", 0, 10), clip("b", 10, 5)];
    const junctions = clipJunctions(events);
    expect(junctions).toHaveLength(1);
    expect(junctions[0]!.at).toBe(10);
    expect(junctions[0]!.before.id).toBe("a");
    expect(junctions[0]!.after.id).toBe("b");
    expect(junctions[0]!.transition).toBeUndefined();
  });

  it("reports no junctions for a single clip", () => {
    expect(clipJunctions([clip("a", 0, 10)])).toHaveLength(0);
  });
});

describe("addTransitionAt", () => {
  it("centers the transition on the junction", () => {
    const events = addTransitionAt([clip("a", 0, 10), clip("b", 10, 5)], "Fade", 10, 1);
    const t = events.find(isTransitionEvent);
    expect(t).toBeDefined();
    expect(t!.kind).toBe("Fade");
    expect(t!.start).toBeCloseTo(9.5);
    expect(t!.duration).toBe(1);
  });

  it("replaces an existing transition at the same junction", () => {
    let events = addTransitionAt([clip("a", 0, 10), clip("b", 10, 5)], "Fade", 10, 1);
    events = addTransitionAt(events, "Slide left", 10, 2);
    const transitions = events.filter(isTransitionEvent);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.kind).toBe("Slide left");
  });

  it("keeps transitions at other junctions", () => {
    let events = [clip("a", 0, 10), clip("b", 10, 5), clip("c", 15, 5)];
    events = addTransitionAt(events, "Fade", 10, 1);
    events = addTransitionAt(events, "Pop", 15, 1);
    expect(events.filter(isTransitionEvent)).toHaveLength(2);
  });
});
