import { describe, it, expect } from "vitest";
import { emptyGuide, addStep, moveStep, removeStep, duplicateStep, toHotspot, chapters, updateStep } from "@/lib/demo-guide";

describe("guided demo steps", () => {
  it("adds, reorders, duplicates and removes steps", () => {
    let g = addStep(addStep(emptyGuide()));
    const [a, b] = g.steps;
    g = moveStep(g, b!.id, -1);
    expect(g.steps.map((s) => s.id)).toEqual([b!.id, a!.id]);
    expect(moveStep(g, b!.id, -1)).toBe(g);
    g = duplicateStep(g, a!.id);
    expect(g.steps).toHaveLength(3);
    g = removeStep(g, a!.id);
    expect(g.steps).toHaveLength(2);
  });
  it("clamps hotspot clicks to 0-100%", () => {
    expect(toHotspot(50, 25, 200, 100)).toEqual({ x: 25, y: 25 });
    expect(toHotspot(-5, 300, 200, 100)).toEqual({ x: 0, y: 100 });
  });
  it("lists chapters at their first step", () => {
    let g = addStep(addStep(addStep(emptyGuide())));
    g = updateStep(g, g.steps[0]!.id, { chapter: "Intro" });
    g = updateStep(g, g.steps[1]!.id, { chapter: "Intro" });
    g = updateStep(g, g.steps[2]!.id, { chapter: "Setup" });
    expect(chapters(g)).toEqual([{ name: "Intro", index: 0 }, { name: "Setup", index: 2 }]);
  });
});
