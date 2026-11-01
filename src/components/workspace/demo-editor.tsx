import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Plus,
  ImagePlus,
  Play,
  Pencil,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  Send,
  GripVertical,
  Replace,
  Target,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace";
import {
  emptyGuide,
  addStep,
  updateStep,
  removeStep,
  duplicateStep,
  moveStep,
  moveStepTo,
  toHotspot,
  chapters,
  imageToDataUrl,
  type DemoGuide,
  type TooltipSide,
} from "@/lib/demo-guide";
import { detectMedia } from "@/lib/media-detect";
import { EditorTopBar } from "./editor-top-bar";
import { AiPanel } from "./ai-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkles } from "lucide-react";
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
  const guide = getDraft(projectId).guide ?? emptyGuide();
  const [sel, setSel] = useState(guide.steps[0]?.id ?? "");
  const [mode, setMode] = useState<"edit" | "play">("edit");
  const [playFrom, setPlayFrom] = useState(0);
  const [history, setHistory] = useState<DemoGuide[]>([]);
  const [future, setFuture] = useState<DemoGuide[]>([]);
  const [dragId, setDragId] = useState("");
  const [dropping, setDropping] = useState(false);
  const [panel, setPanel] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const commit = useCallback(
    (g: DemoGuide, record = true) => {
      const current = getDraft(projectId);
      if (record) {
        setHistory((h) => [...h.slice(-59), current.guide ?? emptyGuide()]);
        setFuture([]);
      }
      setDraft(projectId, { ...current, guide: g });
    },
    [getDraft, setDraft, projectId],
  );
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setFuture((f) => [...f, guide]);
    setHistory((h) => h.slice(0, -1));
    commit(prev, false);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    setHistory((h) => [...h, guide]);
    setFuture((f) => f.slice(0, -1));
    commit(next, false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const step = guide.steps.find((s) => s.id === sel) ?? guide.steps[0];
  const index = step ? guide.steps.indexOf(step) : -1;

  if (!project)
    return (
      <div className="p-10">
        Project not found.{" "}
        <Link to="/projects" className="underline">
          Back to projects
        </Link>
      </div>
    );

  const addImages = async (list: FileList | File[] | null) => {
    const d = detectMedia(Array.from(list ?? []));
    if (d.videos.length || d.skipped.length)
      toast.error(
        `Only screenshots can be steps — skipped ${d.videos.length + d.skipped.length} file(s).`,
      );
    if (!d.images.length) return;
    let g = guide;
    let last = step?.id;
    for (const f of d.images) {
      g = addStep(g, await imageToDataUrl(f), last);
      last = g.steps[g.steps.findIndex((s) => s.id === last) + 1]?.id ?? g.steps.at(-1)!.id;
    }
    commit(g);
    if (last) setSel(last);
    toast.success(`Added ${d.images.length} step${d.images.length > 1 ? "s" : ""}`);
  };

  const pointAt = (e: RPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return toHotspot(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  };
  const onCanvasDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!step) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    commit(updateStep(guide, step.id, { hotspot: pointAt(e) }));
  };
  const onCanvasMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !step) return;
    commit(updateStep(getDraft(projectId).guide ?? guide, step.id, { hotspot: pointAt(e) }), false);
  };
  const onCanvasUp = () => {
    dragging.current = false;
  };

  return (
    <div
      className="studio flex min-h-screen flex-col"
      onDragOver={(e) => {
        if (mode === "edit" && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        void addImages(e.dataTransfer.files);
      }}
    >
      <EditorTopBar
        projectId={projectId}
        label="Guided demo editor"
        undo={{
          onUndo: undo,
          onRedo: redo,
          canUndo: history.length > 0,
          canRedo: future.length > 0,
        }}
      >
        <div
          className="flex rounded-md border border-border p-0.5"
          role="tablist"
          aria-label="Editor mode"
        >
          <Button
            size="sm"
            role="tab"
            aria-selected={mode === "edit"}
            variant={mode === "edit" ? "secondary" : "ghost"}
            onClick={() => setMode("edit")}
          >
            <Pencil />
            <span className="editor-action-label">Edit</span>
          </Button>
          <Button
            size="sm"
            role="tab"
            aria-selected={mode === "play"}
            variant={mode === "play" ? "secondary" : "ghost"}
            onClick={() => {
              setPlayFrom(Math.max(0, index));
              setMode("play");
            }}
            disabled={!guide.steps.length}
            title="Play from this step"
          >
            <Play />
            <span className="editor-action-label">Play demo</span>
          </Button>
        </div>
        <Button variant="outline" onClick={() => setAiOpen(true)} title="AI tools"><Sparkles /><span className="editor-action-label">AI</span></Button>
        <Button asChild>
          <Link to="/share" title="Share">
            <Send />
            <span className="editor-action-label">Share</span>
          </Link>
        </Button>
      </EditorTopBar>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void addImages(e.target.files);
          e.target.value = "";
        }}
      />

      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>AI tools</SheetTitle></SheetHeader>
          <div className="mt-4"><AiPanel projectId={projectId} onApply={(d) => commit(d.guide ?? emptyGuide())} layout="panel" /></div>
        </SheetContent>
      </Sheet>
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 text-lg font-semibold text-primary ring-4 ring-inset ring-primary">
          Drop screenshots to add steps
        </div>
      )}

      {mode === "play" ? (
        <div className="flex-1 bg-muted/40 p-6">
          <DemoPlayer guide={guide} start={playFrom} />
        </div>
      ) : (
        <div
          className={`grid flex-1 grid-cols-1 ${panel && step ? "lg:grid-cols-[240px_1fr_300px]" : "lg:grid-cols-[240px_1fr]"}`}
        >
          <aside
            className="flex flex-col border-b border-border bg-card lg:border-b-0 lg:border-r"
            aria-label="Steps"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <b className="text-sm">
                Steps{" "}
                <span className="text-muted-foreground font-normal">· {guide.steps.length}</span>
              </b>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Add screenshots"
                  aria-label="Add screenshots"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Add blank step"
                  aria-label="Add blank step"
                  onClick={() => {
                    const g = addStep(guide, "", step?.id);
                    commit(g);
                    setSel(g.steps[index + 1]?.id ?? g.steps.at(-1)!.id);
                  }}
                >
                  <Plus />
                </Button>
              </div>
            </div>
            <ol className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {guide.steps.map((s, i) => {
                const chapterStart =
                  s.chapter.trim() && guide.steps[i - 1]?.chapter.trim() !== s.chapter.trim();
                return (
                  <li
                    key={s.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(s.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      commit(moveStepTo(guide, dragId, i));
                      setDragId("");
                    }}
                    onDragEnd={() => setDragId("")}
                    className={dragId === s.id ? "opacity-40" : ""}
                  >
                    {chapterStart && (
                      <span className="mb-1 mt-2 block px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {s.chapter}
                      </span>
                    )}
                    <button
                      onClick={() => setSel(s.id)}
                      className={`group flex w-full gap-2 rounded-md border p-1.5 text-left text-xs transition-colors ${s.id === step?.id ? "border-primary bg-accent" : "border-transparent hover:bg-muted"}`}
                    >
                      <GripVertical
                        size={14}
                        className="mt-3 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100"
                      />
                      <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-muted">
                        {s.image && (
                          <img src={s.image} alt="" className="h-full w-full object-cover" />
                        )}
                        {s.hotspot && (
                          <span
                            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                            style={{ left: `${s.hotspot.x}%`, top: `${s.hotspot.y}%` }}
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="text-muted-foreground">{i + 1}</span>{" "}
                        <span className="font-medium">{s.title}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="border-t border-border p-3">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus />
                Add screenshots
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Drag steps to reorder · drop images anywhere
              </p>
            </div>
          </aside>

          <main className="flex flex-col bg-muted/40">
            {step ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Previous step"
                    title="Previous step"
                    disabled={index <= 0}
                    onClick={() => setSel(guide.steps[index - 1]!.id)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="font-medium">
                    Step {index + 1} of {guide.steps.length}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Next step"
                    title="Next step"
                    disabled={index >= guide.steps.length - 1}
                    onClick={() => setSel(guide.steps[index + 1]!.id)}
                  >
                    <ChevronRight />
                  </Button>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MousePointerClick size={14} />
                    Click or drag on the screen to place the hotspot
                  </span>
                  {!panel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => setPanel(true)}
                    >
                      Step settings
                    </Button>
                  )}
                </div>
                <div className="flex flex-1 items-center justify-center p-6">
                  <div className="w-full max-w-4xl">
                    <div
                      ref={canvasRef}
                      className="relative aspect-video w-full cursor-crosshair touch-none select-none rounded-lg border border-border bg-card shadow-lg"
                      onPointerDown={onCanvasDown}
                      onPointerMove={onCanvasMove}
                      onPointerUp={onCanvasUp}
                    >
                      {step.image ? (
                        <img
                          src={step.image}
                          alt={step.title}
                          className="h-full w-full rounded-lg object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                          <ImagePlus />
                          Blank step — use “Replace image” to add a screenshot
                        </div>
                      )}
                      {step.hotspot && (
                        <Hotspot
                          x={step.hotspot.x}
                          y={step.hotspot.y}
                          side={step.side}
                          title={step.title}
                          body={step.body}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex max-w-md flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card p-10 text-center hover:border-primary"
                >
                  <ImagePlus size={32} className="text-primary" />
                  <h2 className="text-lg font-semibold">Drop screenshots to start</h2>
                  <p className="text-sm text-muted-foreground">
                    Each image becomes a step. Then click to place a hotspot and write the tooltip.
                  </p>
                  <span className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    Browse images
                  </span>
                </button>
              </div>
            )}
          </main>

          {panel && step && (
            <aside
              className="space-y-5 border-t border-border bg-card p-4 lg:border-l lg:border-t-0"
              aria-label="Step settings"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Step {index + 1}</h2>
                <div className="flex">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Move up"
                    aria-label="Move step up"
                    disabled={index <= 0}
                    onClick={() => commit(moveStep(guide, step.id, -1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Move down"
                    aria-label="Move step down"
                    disabled={index >= guide.steps.length - 1}
                    onClick={() => commit(moveStep(guide, step.id, 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Duplicate"
                    aria-label="Duplicate step"
                    onClick={() => commit(duplicateStep(guide, step.id))}
                  >
                    <Copy />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete"
                    aria-label="Delete step"
                    onClick={() => {
                      const g = removeStep(guide, step.id);
                      commit(g);
                      setSel(g.steps[Math.max(0, index - 1)]?.id ?? "");
                    }}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Close panel"
                    aria-label="Close step settings"
                    onClick={() => setPanel(false)}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tooltip
                </h3>
                <label className="block space-y-1 text-sm">
                  Title
                  <Input
                    value={step.title}
                    onChange={(e) => commit(updateStep(guide, step.id, { title: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  Text
                  <Textarea
                    rows={3}
                    value={step.body}
                    onChange={(e) => commit(updateStep(guide, step.id, { body: e.target.value }))}
                    placeholder="Click here to…"
                  />
                </label>
                <div className="space-y-1 text-sm">
                  Position
                  <div className="grid grid-cols-4 gap-1">
                    {(["top", "bottom", "left", "right"] as const).map((sd) => (
                      <Button
                        key={sd}
                        size="sm"
                        className="capitalize"
                        variant={step.side === sd ? "secondary" : "outline"}
                        aria-pressed={step.side === sd}
                        onClick={() => commit(updateStep(guide, step.id, { side: sd }))}
                      >
                        {sd}
                      </Button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step
                </h3>
                <label className="block space-y-1 text-sm">
                  Chapter
                  <Input
                    value={step.chapter}
                    onChange={(e) =>
                      commit(updateStep(guide, step.id, { chapter: e.target.value }))
                    }
                    placeholder="e.g. Getting started"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      commit(
                        updateStep(guide, step.id, {
                          hotspot: step.hotspot ? null : { x: 50, y: 50 },
                        }),
                      )
                    }
                  >
                    <Target />
                    {step.hotspot ? "Remove hotspot" : "Add hotspot"}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <label className="cursor-pointer">
                      <Replace />
                      Replace image
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            commit(updateStep(guide, step.id, { image: await imageToDataUrl(f) }));
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </div>
              </section>
              <section className="space-y-2 border-t border-border pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  End of demo button
                </h3>
                <Input
                  aria-label="Button text"
                  value={guide.ctaText}
                  onChange={(e) => commit({ ...guide, ctaText: e.target.value })}
                />
                <Input
                  aria-label="Button link"
                  placeholder="https://calendly.com/you"
                  value={guide.ctaUrl}
                  onChange={(e) => commit({ ...guide, ctaUrl: e.target.value })}
                />
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function Hotspot({
  x,
  y,
  side,
  title,
  body,
  onClick,
}: {
  x: number;
  y: number;
  side: TooltipSide;
  title: string;
  body: string;
  onClick?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <button
        type="button"
        aria-label={onClick ? "Next step" : "Hotspot"}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick();
          }
        }}
        className={`relative -ml-3 -mt-3 block h-6 w-6 rounded-full bg-primary ring-4 ring-primary/30 ${onClick ? "pointer-events-auto" : ""}`}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
      </button>
      <div
        className={`absolute z-10 w-56 rounded-md bg-popover p-3 text-left text-popover-foreground shadow-lg ${tipPos[side]}`}
      >
        <b className="block text-sm">{title}</b>
        {body && <p className="mt-1 text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

export function DemoPlayer({ guide, start = 0 }: { guide: DemoGuide; start?: number }) {
  const [i, setI] = useState(Math.min(start, Math.max(0, guide.steps.length - 1)));
  const [done, setDone] = useState(false);
  const step = guide.steps[i];
  const chaps = chapters(guide);
  const next = () => (i + 1 < guide.steps.length ? setI(i + 1) : setDone(true));
  if (!guide.steps.length)
    return <p className="text-center text-muted-foreground">This demo has no steps yet.</p>;
  return (
    <div className="mx-auto w-full max-w-4xl">
      {chaps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Chapters">
          {chaps.map((c) => (
            <Button
              key={c.name}
              size="sm"
              variant={guide.steps[i]?.chapter.trim() === c.name ? "secondary" : "outline"}
              onClick={() => {
                setDone(false);
                setI(c.index);
              }}
            >
              {c.name}
            </Button>
          ))}
        </div>
      )}
      <div className="relative aspect-video w-full rounded-lg border border-border bg-card shadow">
        {done ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <h2 className="text-xl font-semibold">That's the tour</h2>
            {guide.ctaUrl ? (
              <Button asChild>
                <a href={guide.ctaUrl} target="_blank" rel="noreferrer">
                  {guide.ctaText || "Continue"}
                </a>
              </Button>
            ) : (
              <Button>{guide.ctaText || "Continue"}</Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setDone(false);
                setI(0);
              }}
            >
              Restart
            </Button>
          </div>
        ) : (
          step && (
            <>
              {step.image ? (
                <img
                  src={step.image}
                  alt={step.title}
                  className="h-full w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {step.title}
                </div>
              )}
              {step.hotspot ? (
                <Hotspot
                  {...step.hotspot}
                  side={step.side}
                  title={step.title}
                  body={step.body}
                  onClick={next}
                />
              ) : null}
            </>
          )
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <Button
          variant="ghost"
          size="sm"
          disabled={i === 0 && !done}
          onClick={() => {
            if (done) setDone(false);
            else setI(i - 1);
          }}
        >
          <ChevronLeft />
          Back
        </Button>
        <div className="mx-4 h-1.5 flex-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${((done ? guide.steps.length : i + 1) / guide.steps.length) * 100}%`,
            }}
          />
        </div>
        <Button variant="ghost" size="sm" disabled={done} onClick={next}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
