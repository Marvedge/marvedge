import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Captions, Languages, Scissors, UserRound, Bot, ClipboardList, Wand2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/lib/workspace";
import { runAiTool } from "@/lib/ai-studio.functions";

type Tool = "plan" | "script" | "captions" | "translate" | "repurpose" | "personalise" | "agent";
type Opt = { key: string; label: string; choices?: string[] };
const tools: { id: Tool; label: string; icon: typeof Bot; hint: string; placeholder: string; opts: Opt[] }[] = [
  { id: "plan", label: "Plan & storyboard", icon: ClipboardList, hint: "Turn an idea into scenes, narration and timing.", placeholder: "e.g. A 60-second tour showing how to create a first report", opts: [{ key: "Audience", label: "Audience" }, { key: "Length", label: "Length", choices: ["30 seconds", "60 seconds", "2 minutes"] }] },
  { id: "script", label: "Voiceover script", icon: FileText, hint: "A timed narration script for your video.", placeholder: "What should the video explain?", opts: [{ key: "Tone", label: "Tone", choices: ["Friendly", "Professional", "Energetic", "Calm"] }, { key: "Length", label: "Length", choices: ["30 seconds", "60 seconds", "2 minutes"] }] },
  { id: "captions", label: "Captions", icon: Captions, hint: "Timed captions from a description or script.", placeholder: "Paste a script or describe the video", opts: [{ key: "Style", label: "Style", choices: ["Clean subtitles", "Bold word-by-word", "Minimal lower third"] }] },
  { id: "translate", label: "Translate", icon: Languages, hint: "Translate scripts and captions, keeping timings.", placeholder: "Paste the script or captions to translate", opts: [{ key: "Target language", label: "Target language", choices: ["Hindi", "Spanish", "French", "German", "Japanese", "Portuguese"] }] },
  { id: "repurpose", label: "Repurpose to clips", icon: Scissors, hint: "Find short social clips in a long recording.", placeholder: "Describe the webinar or recording (topics, length)", opts: [{ key: "Platform", label: "Platform", choices: ["LinkedIn", "Instagram Reels", "YouTube Shorts", "TikTok"] }] },
  { id: "personalise", label: "Personalise", icon: UserRound, hint: "Tailor a demo for a prospect or industry.", placeholder: "What does the demo show?", opts: [{ key: "Prospect company", label: "Prospect company" }, { key: "Role", label: "Role" }, { key: "Industry", label: "Industry" }] },
  { id: "agent", label: "AI Agent", icon: Bot, hint: "Ask anything about making your demo.", placeholder: "e.g. How should I structure an onboarding demo?", opts: [] },
];

export function AiStudioPage() {
  const { projects } = useWorkspace();
  const run = useServerFn(runAiTool);
  const [toolId, setToolId] = useState<Tool>("plan");
  const tool = tools.find((t) => t.id === toolId)!;
  const [prompt, setPrompt] = useState("");
  const [project, setProject] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (prompt.trim().length < 3) {
      toast.error("Add a short description first.");
      return;
    }
    setLoading(true);
    try {
      const opts: Record<string, string> = {};
      for (const o of tool.opts) {
        const v = options[`${tool.id}:${o.key}`] ?? o.choices?.[0] ?? "";
        if (v) opts[o.key] = v;
      }
      if (project) opts["Project"] = project;
      const r = await run({ data: { tool: tool.id, prompt, options: opts } });
      setResult(r.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI STUDIO</div>
          <h1>Create with AI</h1>
          <p>Plan, write, caption, translate, repurpose and personalise — all in one place.</p>
        </div>
      </div>
      <div className="ai-studio-layout">
        <nav className="ai-tool-list" aria-label="AI tools">
          {tools.map((t) => (
            <Button key={t.id} variant={t.id === toolId ? "secondary" : "ghost"} className="justify-start" onClick={() => { setToolId(t.id); setResult(""); }}>
              <t.icon /> {t.label}
            </Button>
          ))}
        </nav>
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-card-foreground">{tool.label}</h2>
            <p className="text-sm text-muted-foreground">{tool.hint}</p>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Project (optional)</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Textarea rows={5} value={prompt} placeholder={tool.placeholder} onChange={(e) => setPrompt(e.target.value)} />
          {tool.opts.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {tool.opts.map((o) => {
                const k = `${tool.id}:${o.key}`;
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
          <Button className="w-full" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Wand2 />} {loading ? "Generating…" : "Generate"}
          </Button>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-card-foreground">Result</h2>
            <Button size="sm" variant="ghost" disabled={!result} onClick={() => { navigator.clipboard.writeText(result); toast.success("Copied"); }}>
              <Copy /> Copy
            </Button>
          </div>
          {result ? (
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans max-h-[520px] overflow-auto">{result}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Your generated content will appear here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
