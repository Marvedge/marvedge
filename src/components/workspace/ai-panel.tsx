import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText, Captions, Languages, Scissors, UserRound, Bot, ClipboardList, Wand2, Copy, Loader2, Download, Check, ArrowUpRight, RotateCcw, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { runAiTool, type AiItem, type AiTool } from "@/lib/ai-studio.functions";
import { applyToGuide, applyToVideoDraft, guideContext, toolsFor, videoContext } from "@/lib/ai-apply";
import { defaultDraft, downloadFile, type EditorDraft } from "@/lib/editor-model";
import { emptyGuide } from "@/lib/demo-guide";

type Opt = { key: string; label: string; choices?: string[] };
export const aiTools: Record<AiTool, { label: string; icon: typeof Bot; hint: string; placeholder: string; opts: Opt[] }> = {
  plan: { label: "Plan & storyboard", icon: ClipboardList, hint: "Turn an idea into scenes. Video: scene titles on the timeline. Demo: one step per scene.", placeholder: "e.g. A 60-second tour showing how to create a first report", opts: [{ key: "Audience", label: "Audience" }, { key: "Length", label: "Length", choices: ["30 seconds", "60 seconds", "2 minutes"] }] },
  script: { label: "Voiceover script", icon: FileText, hint: "Timed narration. Video: caption blocks. Demo: fills each step's tooltip.", placeholder: "What should the video explain?", opts: [{ key: "Tone", label: "Tone", choices: ["Friendly", "Professional", "Energetic", "Calm"] }, { key: "Length", label: "Length", choices: ["30 seconds", "60 seconds", "2 minutes"] }] },
  captions: { label: "Captions", icon: Captions, hint: "Timed captions added to the text track.", placeholder: "Paste a script or describe the video", opts: [{ key: "Style", label: "Style", choices: ["Clean subtitles", "Bold word-by-word", "Minimal lower third"] }] },
  translate: { label: "Translate", icon: Languages, hint: "Translates the project's captions or step text in place. Undo restores the original.", placeholder: "Optional: notes for the translator (tone, terms to keep)", opts: [{ key: "Target language", label: "Target language", choices: ["Hindi", "Spanish", "French", "German", "Japanese", "Portuguese"] }] },
  repurpose: { label: "Repurpose to clips", icon: Scissors, hint: "Suggests short clips with times. 'Make clip' creates a new trimmed video project.", placeholder: "Describe the recording (topics, where key moments are)", opts: [{ key: "Platform", label: "Platform", choices: ["LinkedIn", "Instagram Reels", "YouTube Shorts", "TikTok"] }] },
  personalise: { label: "Personalise", icon: UserRound, hint: "Rewrites the project's text and end button for a prospect.", placeholder: "Optional: what to emphasise", opts: [{ key: "Prospect company", label: "Prospect company" }, { key: "Role", label: "Role" }, { key: "Industry", label: "Industry" }] },
  agent: { label: "AI Agent", icon: Bot, hint: "Chat about making your demo or video. It knows the selected project's text.", placeholder: "e.g. How should I structure an onboarding demo?", opts: [] },
};
const contextTools: AiTool[] = ["translate", "personalise"];

export function AiPanel({
  projectId,
  onApply,
  layout = "page",
}: {
  projectId?: string | undefined;
  /** Editors pass their own commit so undo history records the change. */
  onApply?: (draft: EditorDraft) => void;
  layout?: "page" | "panel";
}) {
  const { projects, getDraft, setDraft, addProject } = useWorkspace();
  const run = useServerFn(runAiTool);
  const project = projects.find((p) => p.id === projectId);
  const kind = project?.type ?? "video";
  const available = project ? toolsFor(kind) : (Object.keys(aiTools) as AiTool[]);
  const [toolId, setToolId] = useState<AiTool>("plan");
  const tid = available.includes(toolId) ? toolId : available[0]!;
  const tool = aiTools[tid];
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tool: AiTool; text: string; summary: string; items: AiItem[] } | null>(null);
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const context = () => {
    if (!project) return [];
    const d = getDraft(project.id);
    return kind === "demo" ? guideContext(d.guide ?? emptyGuide()) : videoContext(d);
  };

  async function generate() {
    const needsContext = contextTools.includes(tid);
    if (needsContext && !project) return toast.error("Pick a project first — this tool works on its text.");
    if (!needsContext && prompt.trim().length < 3) return toast.error("Add a short description first.");
    setLoading(true);
    try {
      const opts: Record<string, string> = {};
      for (const o of tool.opts) {
        const v = options[`${tid}:${o.key}`] ?? o.choices?.[0] ?? "";
        if (v) opts[o.key] = v;
      }
      if (project) opts["Project"] = `${project.name} (${kind === "demo" ? "guided demo" : "video"})`;
      const ctx = needsContext || tid === "agent" ? context().slice(0, 200) : [];
      const r = await run({ data: { tool: tid, prompt: prompt.trim(), options: opts, context: ctx, history: tid === "agent" ? chat : [] } });
      if (tid === "agent") {
        setChat((c) => [...c, { role: "user", text: prompt.trim() }, { role: "assistant", text: r.text }]);
        setPrompt("");
      } else {
        setResult({ tool: tid, ...r });
        setApplied(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!project || !result) return;
    const before = getDraft(project.id);
    let next: EditorDraft;
    let message: string;
    if (kind === "demo") {
      const a = applyToGuide(before.guide ?? emptyGuide(), result.tool, result.items, result.summary);
      next = { ...before, guide: a.value };
      message = a.message;
    } else {
      const a = applyToVideoDraft(before, result.tool, result.items, result.summary);
      next = a.value;
      message = a.message;
    }
    if (onApply) {
      onApply(next);
      toast.success(`${message} — use Undo to revert`);
    } else {
      setDraft(project.id, next);
      toast.success(`${message} to ${project.name}`, { action: { label: "Undo", onClick: () => setDraft(project.id, before) } });
    }
    setApplied(true);
  }

  function makeClip(item: AiItem) {
    if (!project) return;
    const src = getDraft(project.id).events.find((e) => e.lane === "video");
    const id = crypto.randomUUID();
    const draft = defaultDraft(src?.source, project.ratio);
    const video = draft.events.find((e) => e.lane === "video")!;
    const duration = Math.max(1, item.duration || 15);
    const events = [
      { ...video, ...(src ? { source: src.source, sourceDuration: src.sourceDuration } : {}), name: item.title || "Clip", start: 0, duration, sourceOffset: item.start },
      ...draft.events.filter((e) => e.lane === "text").map((e) => ({ ...e, text: item.title || e.text, duration: Math.min(e.duration, duration) })),
    ];
    addProject({ ...project, id, name: `${project.name} — ${item.title || "Clip"}`, status: "Draft", updated: "Just now", folder: project.folder });
    setDraft(id, { ...draft, events, description: item.text });
    toast.success("Clip project created", { action: { label: "Open", onClick: () => window.location.assign(`/editor/${id}`) } });
  }

  const canApply = !!project && !!result && result.tool !== "repurpose" && result.items.length > 0 && !(kind === "demo" && result.tool === "captions");
  const compact = layout === "panel";

  return (
    <div className={compact ? "space-y-4" : "ai-studio-layout"}>
      <nav className={compact ? "flex flex-wrap gap-1" : "ai-tool-list"} aria-label="AI tools">
        {available.map((id) => {
          const t = aiTools[id];
          return (
            <Button key={id} size={compact ? "sm" : "default"} variant={id === tid ? "secondary" : "ghost"} className="justify-start" aria-pressed={id === tid} onClick={() => { setToolId(id); setResult(null); }}>
              <t.icon /> {t.label}
            </Button>
          );
        })}
      </nav>
      <section className={compact ? "space-y-3" : "rounded-xl border border-border bg-card p-5 space-y-4"}>
        <div>
          <h2 className="text-base font-semibold text-card-foreground">{tool.label}</h2>
          <p className="text-sm text-muted-foreground">{tool.hint}</p>
        </div>
        {tid === "agent" && chat.length > 0 && (
          <div className="max-h-80 space-y-2 overflow-auto rounded-md border border-border p-2" aria-label="Conversation">
            {chat.map((m, i) => (
              <div key={i} className={`rounded-md px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-8 bg-muted text-foreground"}`}>
                <pre className="whitespace-pre-wrap font-sans">{m.text}</pre>
              </div>
            ))}
          </div>
        )}
        <Textarea
          rows={tid === "agent" ? 3 : 4}
          value={prompt}
          placeholder={tool.placeholder}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (tid === "agent" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!loading) void generate(); } }}
        />
        {tool.opts.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {tool.opts.map((o) => {
              const k = `${tid}:${o.key}`;
              return (
                <label key={k} className="block space-y-1.5 text-sm">
                  <span className="text-muted-foreground">{o.label}</span>
                  {o.choices ? (
                    <select value={options[k] ?? o.choices[0]} onChange={(e) => setOptions({ ...options, [k]: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      {o.choices.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  ) : (
                    <Input value={options[k] ?? ""} onChange={(e) => setOptions({ ...options, [k]: e.target.value })} />
                  )}
                </label>
              );
            })}
          </div>
        )}
        {contextTools.includes(tid) && project && <p className="text-xs text-muted-foreground">Works on {context().length} text item{context().length === 1 ? "" : "s"} in this project.</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : tid === "agent" ? <Send /> : <Wand2 />} {loading ? "Generating…" : tid === "agent" ? "Send" : "Generate"}
          </Button>
          {tid === "agent" && chat.length > 0 && <Button variant="outline" onClick={() => setChat([])}><RotateCcw />New chat</Button>}
        </div>
      </section>
      {tid !== "agent" && (
        <section className={compact ? "space-y-3 border-t border-border pt-4" : "rounded-xl border border-border bg-card p-5 space-y-3"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-card-foreground">Result</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={!result} onClick={() => { void navigator.clipboard.writeText(result?.text ?? ""); toast.success("Copied"); }}><Copy /> Copy</Button>
              <Button size="sm" variant="ghost" disabled={!result} onClick={() => downloadFile(result?.text ?? "", `${tool.label.toLowerCase().replace(/\W+/g, "-")}.txt`, "text/plain")}><Download /> Download</Button>
            </div>
          </div>
          {result ? (
            <>
              {result.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}
              <ol className="max-h-[420px] space-y-2 overflow-auto">
                {result.items.map((i, n) => (
                  <li key={n} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {i.duration > 0 && <span className="mr-2 text-xs text-muted-foreground">{i.start.toFixed(1)}s · {i.duration.toFixed(1)}s</span>}
                        {i.title && <b>{i.title}</b>}
                        <p className="text-foreground">{i.text}</p>
                      </div>
                      {result.tool === "repurpose" && project?.type === "video" && <Button size="sm" variant="outline" onClick={() => makeClip(i)}><Scissors />Make clip</Button>}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                {result.tool !== "repurpose" && (
                  <Button onClick={apply} disabled={!canApply || applied}>{applied ? <><Check />Applied</> : "Apply to project"}</Button>
                )}
                {!compact && project && <Button variant="outline" asChild><Link to="/editor/$projectId" params={{ projectId: project.id }}>Open in editor <ArrowUpRight /></Link></Button>}
              </div>
              {!project && <p className="text-xs text-muted-foreground">Pick a project above to apply this result.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your generated content will appear here.</p>
          )}
        </section>
      )}
    </div>
  );
}
