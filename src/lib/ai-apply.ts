import type { AiItem, AiTool } from "./ai-studio.functions";
import { eventTemplate, type EditorDraft } from "./editor-model";
import { addStep, updateStep, type DemoGuide } from "./demo-guide";

/** Text the AI may read and rewrite (translate / personalise). */
export function videoContext(draft: EditorDraft) {
  return draft.events.filter((e) => e.lane === "text" && e.text.trim()).map((e) => ({ id: e.id, text: e.text }));
}
export function guideContext(g: DemoGuide) {
  return g.steps.flatMap((s) => [
    ...(s.title.trim() ? [{ id: `${s.id}:title`, text: s.title }] : []),
    ...(s.body.trim() ? [{ id: `${s.id}:body`, text: s.body }] : []),
  ]);
}

export type Applied<T> = { value: T; message: string };

export function applyToVideoDraft(draft: EditorDraft, tool: AiTool, items: AiItem[], summary = ""): Applied<EditorDraft> {
  if (tool === "translate" || tool === "personalise") {
    const map = new Map(items.map((i) => [i.ref, i.text]));
    let n = 0;
    const events = draft.events.map((e) => (map.has(e.id) && e.lane === "text" ? (n++, { ...e, text: map.get(e.id)! }) : e));
    const cta = tool === "personalise" && summary.trim() ? summary.trim().slice(0, 40) : draft.cta;
    return { value: { ...draft, events, cta }, message: `${tool === "translate" ? "Translated" : "Personalised"} ${n} caption${n === 1 ? "" : "s"}` };
  }
  if (tool === "plan" || tool === "script" || tool === "captions") {
    let at = 0;
    const added = items.filter((i) => i.text.trim()).map((i) => {
      const start = Number.isFinite(i.start) && i.duration > 0 ? i.start : at;
      const duration = i.duration > 0 ? i.duration : 4;
      at = start + duration;
      const kind = tool === "plan" ? "Heading" : "Caption";
      return { ...eventTemplate("text", kind, start), name: i.title || kind, text: i.text, duration, y: tool === "plan" ? 50 : 85 };
    });
    const label = tool === "plan" ? "scene title" : "caption";
    return { value: { ...draft, events: [...draft.events, ...added] }, message: `Added ${added.length} ${label}${added.length === 1 ? "" : "s"}` };
  }
  return { value: draft, message: "Nothing to apply" };
}

export function applyToGuide(g: DemoGuide, tool: AiTool, items: AiItem[], summary = ""): Applied<DemoGuide> {
  if (tool === "translate" || tool === "personalise") {
    let out = g;
    let n = 0;
    for (const i of items) {
      const [id, field] = i.ref.split(":");
      if (!id || (field !== "title" && field !== "body") || !g.steps.some((s) => s.id === id)) continue;
      out = updateStep(out, id, { [field]: i.text });
      n++;
    }
    if (tool === "personalise" && summary.trim()) out = { ...out, ctaText: summary.trim().slice(0, 40) };
    return { value: out, message: `${tool === "translate" ? "Translated" : "Personalised"} ${n} text${n === 1 ? "" : "s"}` };
  }
  if (tool === "plan") {
    let out = g;
    for (const i of items) {
      out = addStep(out, "");
      out = updateStep(out, out.steps.at(-1)!.id, { title: i.title || "Step", body: i.text });
    }
    return { value: out, message: `Added ${items.length} step${items.length === 1 ? "" : "s"}` };
  }
  if (tool === "script") {
    let out = g;
    items.forEach((i, idx) => {
      const step = out.steps[idx];
      if (step) out = updateStep(out, step.id, { body: i.text });
      else {
        out = addStep(out, "");
        out = updateStep(out, out.steps.at(-1)!.id, { title: i.title || `Step ${idx + 1}`, body: i.text });
      }
    });
    return { value: out, message: `Wrote tooltip text for ${items.length} step${items.length === 1 ? "" : "s"}` };
  }
  return { value: g, message: "Nothing to apply" };
}

export const toolsFor = (kind: "video" | "demo"): AiTool[] =>
  kind === "video"
    ? ["plan", "script", "captions", "translate", "repurpose", "personalise", "agent"]
    : ["plan", "script", "translate", "personalise", "agent"];
