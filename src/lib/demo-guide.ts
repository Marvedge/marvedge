export type TooltipSide = "top" | "bottom" | "left" | "right";
export type DemoStep = {
  id: string;
  image: string;
  title: string;
  body: string;
  chapter: string;
  hotspot: { x: number; y: number } | null;
  side: TooltipSide;
};
export type DemoGuide = { steps: DemoStep[]; ctaText: string; ctaUrl: string };

export const emptyGuide = (): DemoGuide => ({ steps: [], ctaText: "Book a demo", ctaUrl: "" });

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);

export function newStep(image = "", n = 1): DemoStep {
  return { id: uid(), image, title: `Step ${n}`, body: "", chapter: "", hotspot: image ? { x: 50, y: 50 } : null, side: "bottom" };
}

export function addStep(g: DemoGuide, image = "", after?: string): DemoGuide {
  const s = newStep(image, g.steps.length + 1);
  const i = after ? g.steps.findIndex((x) => x.id === after) : -1;
  const steps = [...g.steps];
  steps.splice(i < 0 ? steps.length : i + 1, 0, s);
  return { ...g, steps };
}

export function updateStep(g: DemoGuide, id: string, patch: Partial<DemoStep>): DemoGuide {
  return { ...g, steps: g.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function removeStep(g: DemoGuide, id: string): DemoGuide {
  return { ...g, steps: g.steps.filter((s) => s.id !== id) };
}

export function duplicateStep(g: DemoGuide, id: string): DemoGuide {
  const i = g.steps.findIndex((s) => s.id === id);
  if (i < 0) return g;
  const steps = [...g.steps];
  steps.splice(i + 1, 0, { ...g.steps[i]!, id: uid() });
  return { ...g, steps };
}

export function moveStep(g: DemoGuide, id: string, dir: -1 | 1): DemoGuide {
  const i = g.steps.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= g.steps.length) return g;
  const steps = [...g.steps];
  [steps[i], steps[j]] = [steps[j]!, steps[i]!];
  return { ...g, steps };
}

/** Clamp a click to a 0-100 percentage hotspot position. */
export const toHotspot = (x: number, y: number, w: number, h: number) => ({
  x: Math.round(Math.min(100, Math.max(0, (x / w) * 100))),
  y: Math.round(Math.min(100, Math.max(0, (y / h) * 100))),
});

/** Chapter list in order of first appearance, with the index of its first step. */
export function chapters(g: DemoGuide) {
  const out: { name: string; index: number }[] = [];
  g.steps.forEach((s, index) => {
    const name = s.chapter.trim();
    if (name && !out.some((c) => c.name === name)) out.push({ name, index });
  });
  return out;
}

/** Downscale an image file to a JPEG data URL so it can be saved with the project. */
export async function imageToDataUrl(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
