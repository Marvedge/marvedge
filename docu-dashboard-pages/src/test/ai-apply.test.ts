import { describe, expect, it } from "vitest";
import { applyToGuide, applyToVideoDraft, guideContext, toolsFor } from "@/lib/ai-apply";
import { defaultDraft } from "@/lib/editor-model";
import { addStep, emptyGuide, updateStep } from "@/lib/demo-guide";

const item = (text: string, start = 0, duration = 0, ref = "", title = "") => ({ ref, title, text, start, duration });

describe("applying AI results", () => {
  it("adds captions as text events at the given times", () => {
    const d = defaultDraft();
    const before = d.events.length;
    const { value } = applyToVideoDraft(d, "captions", [item("Hello", 0, 3), item("World", 3, 2.5)]);
    const added = value.events.slice(before);
    expect(added.map((e) => [e.lane, e.text, e.start, e.duration])).toEqual([["text", "Hello", 0, 3], ["text", "World", 3, 2.5]]);
  });
  it("turns a storyboard into one demo step per scene", () => {
    const { value } = applyToGuide(emptyGuide(), "plan", [item("a", 0, 0, "", "Intro"), item("b"), item("c")]);
    expect(value.steps).toHaveLength(3);
    expect(value.steps[0]!.title).toBe("Intro");
  });
  it("translates captions by id and keeps their timings", () => {
    const d = defaultDraft();
    const cap = d.events.find((e) => e.lane === "text")!;
    const { value } = applyToVideoDraft(d, "translate", [item("Hola", 99, 99, cap.id)]);
    const out = value.events.find((e) => e.id === cap.id)!;
    expect(out.text).toBe("Hola");
    expect([out.start, out.duration]).toEqual([cap.start, cap.duration]);
  });
  it("translates demo step text by step and field", () => {
    let g = addStep(emptyGuide(), "img");
    g = updateStep(g, g.steps[0]!.id, { body: "Click here" });
    const ctx = guideContext(g);
    const { value } = applyToGuide(g, "translate", ctx.map((c) => item(`ES ${c.text}`, 0, 0, c.id)));
    expect(value.steps[0]!.body).toBe("ES Click here");
  });
  it("hides captions and clips tools in the guided demo editor", () => {
    expect(toolsFor("demo")).not.toContain("captions");
    expect(toolsFor("demo")).not.toContain("repurpose");
  });
});
