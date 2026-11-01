import { useRef, useState, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, ArrowDown, Copy, Trash2, Plus, ImagePlus, Play, Pencil, ChevronLeft, ChevronRight, MousePointerClick, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWorkspace } from "@/lib/workspace";
import {
  emptyGuide, addStep, updateStep, removeStep, duplicateStep, moveStep, toHotspot, chapters, imageToDataUrl,
  type DemoGuide, type TooltipSide,
} from "@/lib/demo-guide";
import { toast } from "sonner";

const tipPos: Record<TooltipSide, string> = {
  top: "bottom-full mb-3 left-1/2 -translate-x-1/2",
  bottom: "top-full mt-3 left-1/2 -translate-x-1/2",
  left: "right-full mr-3 top-1/2 -translate-y-1/2",
  right: "left-full ml-3 top-1/2 -translate-y-1/2",
};

export function DemoEditorPage({ projectId }: { projectId: string }) {
  const { projects, getDraft, setDraft } = useWorkspace();
  const project = projects.find((p) => p.id === projectId);
  const draft = getDraft(projectId);
  const guide = draft.guide ?? emptyGuide();
  const [sel, setSel] = useState(guide.steps[0]?.id ?? "");
  const [mode, setMode] = useState<"edit" | "play">("edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const save = (g: DemoGuide) => setDraft(projectId, { ...getDraft(projectId), guide: g });
  const step = guide.steps.find((s) => s.id === sel) ?? guide.steps[0];

  if (!project) return <div className="p-10">Project not found. <Link to="/projects" className="underline">Back to projects</Link></div>;

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    let g = guide;
    let last = step?.id;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) { toast.error(`${f.name} isn't an image`); continue; }
      g = addStep(g, await imageToDataUrl(f), last);
      last = g.steps[g.steps.findIndex((s) => s.id === last) + 1]?.id ?? g.steps.at(-1)!.id;
    }
    save(g);
    if (last) setSel(last);
  };

  const place = (e: MouseEvent<HTMLDivElement>) => {
    if (!step) return;
    const r = e.currentTarget.getBoundingClientRect();
    save(updateStep(guide, step.id, { hotspot: toHotspot(e.clientX - r.left, e.clientY - r.top, r.width, r.height) }));
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to projects"><Link to="/projects"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <b className="block truncate">{project.name}</b>
          <span className="text-xs text-muted-foreground">Guided demo editor · {guide.steps.length} steps</span>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          <Button size="sm" variant={mode === "edit" ? "secondary" : "ghost"} onClick={() => setMode("edit")}><Pencil />Edit</Button>
          <Button size="sm" variant={mode === "play" ? "secondary" : "ghost"} onClick={() => setMode("play")} disabled={!guide.steps.length}><Play />Try it</Button>
        </div>
        <ThemeToggle />
        <Button asChild><Link to="/share"><Send />Share</Link></Button>
      </header>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />

      {mode === "play" ? (
        <div className="flex-1 p-6"><DemoPlayer guide={guide} /></div>
      ) : (
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_300px]">
          <aside className="border-b border-border p-3 lg:border-b-0 lg:border-r" aria-label="Steps">
            <div className="mb-3 flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => fileRef.current?.click()}><ImagePlus />Screenshots</Button>
              <Button size="sm" variant="outline" aria-label="Add blank step" onClick={() => { const g = addStep(guide, "", step?.id); save(g); setSel(g.steps[g.steps.findIndex((s) => s.id === step?.id) + 1]?.id ?? g.steps.at(-1)!.id); }}><Plus /></Button>
            </div>
            <ol className="space-y-2">
              {guide.steps.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => setSel(s.id)} className={`w-full rounded-md border p-1.5 text-left text-xs ${s.id === step?.id ? "border-primary bg-accent" : "border-border"}`}>
                    <div className="mb-1 aspect-video overflow-hidden rounded bg-muted">{s.image && <img src={s.image} alt="" className="h-full w-full object-cover" />}</div>
                    <span className="font-medium">{i + 1}. {s.title}</span>
                    {s.chapter && <span className="block text-muted-foreground">{s.chapter}</span>}
                  </button>
                </li>
              ))}
            </ol>
            {!guide.steps.length && <p className="text-xs text-muted-foreground">Add screenshots of your product. Each one becomes a step.</p>}
          </aside>

          <main className="flex items-center justify-center bg-muted/40 p-6">
            {step ? (
              <div className="w-full max-w-4xl">
                <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><MousePointerClick size={14} />Click the screen to place the hotspot</p>
                <div className="relative aspect-video w-full cursor-crosshair overflow-visible rounded-lg border border-border bg-card shadow" onClick={place}>
                  {step.image ? <img src={step.image} alt={step.title} className="h-full w-full rounded-lg object-contain" draggable={false} /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Blank step — add a screenshot on the right</div>}
                  {step.hotspot && <Hotspot x={step.hotspot.x} y={step.hotspot.y} side={step.side} title={step.title} body={step.body} />}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="mb-2 text-lg font-semibold">Build your guided demo</h2>
                <p className="mb-4 text-sm text-muted-foreground">Upload screenshots, then add a hotspot and a tooltip to each step.</p>
                <Button onClick={() => fileRef.current?.click()}><ImagePlus />Add screenshots</Button>
              </div>
            )}
          </main>

          <aside className="space-y-4 border-t border-border p-4 lg:border-l lg:border-t-0" aria-label="Step settings">
            {step && (
              <>
                <h2 className="font-semibold">Step {guide.steps.indexOf(step) + 1}</h2>
                <label className="block text-sm">Tooltip title<Input value={step.title} onChange={(e) => save(updateStep(guide, step.id, { title: e.target.value }))} /></label>
                <label className="block text-sm">Tooltip text<Textarea rows={3} value={step.body} onChange={(e) => save(updateStep(guide, step.id, { body: e.target.value }))} placeholder="Click here to…" /></label>
                <label className="block text-sm">Chapter<Input value={step.chapter} onChange={(e) => save(updateStep(guide, step.id, { chapter: e.target.value }))} placeholder="e.g. Getting started" /></label>
                <div className="text-sm">Tooltip side
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {(["top", "bottom", "left", "right"] as const).map((sd) => <Button key={sd} size="sm" variant={step.side === sd ? "secondary" : "outline"} onClick={() => save(updateStep(guide, step.id, { side: sd }))}>{sd}</Button>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => save(updateStep(guide, step.id, { hotspot: step.hotspot ? null : { x: 50, y: 50 } }))}>{step.hotspot ? "Remove hotspot" : "Add hotspot"}</Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 text-sm">Replace image
                    <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) save(updateStep(guide, step.id, { image: await imageToDataUrl(f) })); }} />
                  </label>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Move step up" onClick={() => save(moveStep(guide, step.id, -1))}><ArrowUp /></Button>
                  <Button size="icon" variant="ghost" aria-label="Move step down" onClick={() => save(moveStep(guide, step.id, 1))}><ArrowDown /></Button>
                  <Button size="icon" variant="ghost" aria-label="Duplicate step" onClick={() => save(duplicateStep(guide, step.id))}><Copy /></Button>
                  <Button size="icon" variant="ghost" aria-label="Delete step" onClick={() => { const i = guide.steps.indexOf(step); const g = removeStep(guide, step.id); save(g); setSel(g.steps[Math.max(0, i - 1)]?.id ?? ""); }}><Trash2 /></Button>
                </div>
              </>
            )}
            <div className="space-y-2 border-t border-border pt-4">
              <h2 className="font-semibold">End of demo button</h2>
              <Input aria-label="Button text" value={guide.ctaText} onChange={(e) => save({ ...guide, ctaText: e.target.value })} />
              <Input aria-label="Button link" placeholder="https://calendly.com/you" value={guide.ctaUrl} onChange={(e) => save({ ...guide, ctaUrl: e.target.value })} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Hotspot({ x, y, side, title, body, onClick }: { x: number; y: number; side: TooltipSide; title: string; body: string; onClick?: () => void }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <button type="button" aria-label={onClick ? "Next step" : "Hotspot"} onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }} className="relative -ml-3 -mt-3 block h-6 w-6 rounded-full bg-primary ring-4 ring-primary/30">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
      </button>
      <div className={`absolute z-10 w-56 rounded-md bg-popover p-3 text-left text-popover-foreground shadow-lg ${tipPos[side]}`}>
        <b className="block text-sm">{title}</b>
        {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

export function DemoPlayer({ guide }: { guide: DemoGuide }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const step = guide.steps[i];
  const chaps = chapters(guide);
  const next = () => (i + 1 < guide.steps.length ? setI(i + 1) : setDone(true));
  if (!guide.steps.length) return <p className="text-center text-muted-foreground">This demo has no steps yet.</p>;
  return (
    <div className="mx-auto w-full max-w-4xl">
      {chaps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Chapters">
          {chaps.map((c) => <Button key={c.name} size="sm" variant={guide.steps[i]?.chapter.trim() === c.name ? "secondary" : "outline"} onClick={() => { setDone(false); setI(c.index); }}>{c.name}</Button>)}
        </div>
      )}
      <div className="relative aspect-video w-full rounded-lg border border-border bg-card shadow">
        {done ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <h2 className="text-xl font-semibold">That's the tour</h2>
            {guide.ctaUrl ? <Button asChild><a href={guide.ctaUrl} target="_blank" rel="noreferrer">{guide.ctaText || "Continue"}</a></Button> : <Button>{guide.ctaText || "Continue"}</Button>}
            <Button variant="ghost" onClick={() => { setDone(false); setI(0); }}>Restart</Button>
          </div>
        ) : step && (
          <>
            {step.image ? <img src={step.image} alt={step.title} className="h-full w-full rounded-lg object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground">{step.title}</div>}
            {step.hotspot ? <Hotspot {...step.hotspot} side={step.side} title={step.title} body={step.body} onClick={next} /> : null}
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <Button variant="ghost" size="sm" disabled={i === 0 && !done} onClick={() => { if (done) setDone(false); else setI(i - 1); }}><ChevronLeft />Back</Button>
        <div className="h-1.5 flex-1 mx-4 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((done ? guide.steps.length : i + 1) / guide.steps.length) * 100}%` }} /></div>
        <Button variant="ghost" size="sm" disabled={done} onClick={next}>Next<ChevronRight /></Button>
      </div>
    </div>
  );
}
