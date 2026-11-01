import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Play,
  Pause,
  Send,
  Check,
  Monitor,
  Maximize,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Film,
  MousePointer2,
  Type,
  Wand2,
  Camera,
  MessageSquare,
  Captions,
  Music,
  Sparkles,
  Languages,
  SlidersHorizontal,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  Upload,
  MoreHorizontal,
  RotateCcw,
  Stamp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/lib/workspace";
import { type EditorDraft, timelineDuration, formatTime, appendVideoClip, watermarkOf } from "@/lib/editor-model";
import { readVideoClip } from "@/lib/editor-media";
import { detectMedia } from "@/lib/media-detect";
import { EditorTopBar } from "./editor-top-bar";
import { EditorCanvas } from "./editor-canvas";
import { EditorTimeline } from "./editor-timeline";
import { StudioInspector } from "./studio-inspector";
import { toast } from "sonner";
const tools = [
  { name: "Media", icon: Film },
  { name: "Text", icon: Type },
  { name: "Animation", label: "Transitions", icon: Layers },
  { name: "Audio", icon: Music },
  { name: "Canvas", icon: SlidersHorizontal },
  { name: "Effects", icon: Wand2 },
  { name: "Camera", icon: Camera },
  { name: "Interactions", icon: MousePointer2 },
  { name: "Annotations", icon: MessageSquare },
  { name: "Captions", icon: Captions },
  { name: "Overlays", icon: Monitor },
  { name: "Localization", icon: Languages },
  { name: "AI Assistant", icon: Sparkles },
];
export function EditorPage({ projectId }: { projectId: string }) {
  const { projects, updateProject, getDraft, setDraft, brand } = useWorkspace();
  const project = projects.find((p) => p.id === projectId);
  const [initial] = useState(() => getDraft(projectId));
  const draft = getDraft(projectId);
  const [tab, setTab] = useState("Media");
  const [selected, setSelected] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<EditorDraft[]>([]);
  const [future, setFuture] = useState<EditorDraft[]>([]);
  const [inspector, setInspector] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const duration = timelineDuration(draft.events);
  const wm = watermarkOf(draft);
  function change(next: EditorDraft) {
    setHistory((h) => [...h.slice(-59), draft]);
    setFuture([]);
    setDraft(projectId, next);
  }
  if (!project)
    return (
      <div className="empty-state">
        <h1>Project not found</h1>
        <p>Session-only projects disappear after reloading.</p>
        <Button asChild>
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  function undo() {
    const prev = history.at(-1);
    if (!prev) return;
    setFuture((f) => [...f, draft]);
    setDraft(projectId, prev);
    setHistory((h) => h.slice(0, -1));
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setHistory((h) => [...h, draft]);
    setDraft(projectId, next);
    setFuture((f) => f.slice(0, -1));
  }
  function select(id: string) {
    setSelected(id);
    const e = draft.events.find((e) => e.id === id);
    if (e)
      setTab(
        e.lane === "text"
          ? "Text"
          : e.lane === "effects"
            ? ["Fade", "Crossfade", "Slide", "Scale", "Pop", "Bounce", "Wipe"].includes(e.kind) ? "Animation" : "Effects"
            : e.lane === "camera"
              ? "Camera"
              : e.lane === "interactions"
                ? "Interactions"
                : e.lane === "audio"
                  ? "Audio"
                  : "Media",
      );
    setInspector(true);
  }
  async function addVideo(file: File) {
    setAddingVideo(true);
    try {
      const clip = await readVideoClip(file);
      const current = getDraft(projectId);
      setHistory((h) => [...h.slice(-59), current]);
      setFuture([]);
      const next = appendVideoClip(current.events, clip);
      setDraft(projectId, { ...current, events: next });
      setSelected(clip.id);
      setTime(next.at(-1)?.start ?? 0);
      setPlaying(false);
      setInspector(false);
      toast.success("Video added to the end of your sequence");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add video");
    } finally { setAddingVideo(false); }
  }
  function reset() {
    if (window.confirm("Reset all timeline and canvas edits to the initial draft?")) {
      change(initial);
      setSelected("");
      setTime(0);
      toast.success("Timeline reset");
    }
  }
  return (
    <div
      className="studio"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        const d = detectMedia(Array.from(e.dataTransfer.files));
        if (d.images.length || d.skipped.length) toast.message("Only videos can be dropped onto the timeline — screenshots belong in a guided demo.");
        void (async () => { for (const f of d.videos) await addVideo(f); })();
      }}
    >
      <EditorTopBar projectId={projectId} label="Video editor" undo={{ onUndo: undo, onRedo: redo, canUndo: history.length > 0, canRedo: future.length > 0 }}>
          <Button variant="outline" asChild>
            <Link to="/preview/$projectId" params={{ projectId }} aria-label="Preview" title="Preview">
              <Play />
              <span className="editor-action-label">Preview</span>
            </Link>
          </Button>
          <Button asChild>
            <Link to="/export/$projectId" params={{ projectId }} aria-label="Export & share" title="Export & share">
              <Send />
              <span className="editor-action-label">Export & share</span>
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Project options" title="Project options"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link to="/create" search={{ tab: "uploads" }}><Upload />Upload management</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={reset}><RotateCcw />Reset draft</DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/help">Help Center</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </EditorTopBar>
      <div className="studio-middle">
        <nav className="studio-toolrail">
          {tools.slice(0, 6).map((t) => (
            <Button
              key={t.name}
              variant="ghost"
              className={`studio-tool ${tab === t.name ? "tool-active" : ""}`}
              title={t.label ?? t.name}
              aria-label={t.label ?? t.name}
              aria-pressed={tab === t.name}
              onClick={() => {
                setTab(t.name);
                setInspector(true);
              }}
            >
              <t.icon />
              <span>{t.label ?? t.name}</span>
              {t.name === "AI Assistant" && <span className="tool-planned-dot" />}
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className={`studio-tool ${tools.slice(6).some((t) => t.name === tab) ? "tool-active" : ""}`} aria-label="More editor tools" title="More editor tools"><MoreHorizontal /><span>More</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              {tools.slice(6).map((t) => <DropdownMenuItem key={t.name} onSelect={() => { setTab(t.name); setInspector(true); }}><t.icon />{t.name}{t.name === "AI Assistant" && <span className="text-muted-foreground text-xs">Planned</span>}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <section className="studio-center">
          <header className="stage-header">
            <div>
              <span className="live-dot" />
              Canvas{" "}
              <span className="stage-header-meta">
                {draft.ratio} · {project.type === "demo" ? "Demo" : "Video"}
              </span>
            </div>
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={wm.enabled ? "header-tool-on" : ""}
                    title={wm.enabled ? "Watermark is on" : "Watermark is off"}
                    aria-label="Watermark"
                    aria-pressed={wm.enabled}
                  >
                    <Stamp />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => change({ ...draft, watermark: { ...wm, enabled: !wm.enabled } })}
                  >
                    {wm.enabled ? <EyeOff /> : <Eye />}
                    {wm.enabled ? "Hide watermark" : "Show watermark"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setTab("Watermark");
                      setInspector(true);
                    }}
                  >
                    <SlidersHorizontal />
                    Watermark settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                title="Fullscreen canvas"
                aria-label="Fullscreen canvas"
                onClick={() =>
                  document
                    .querySelector(".studio-stage")
                    ?.requestFullscreen()
                    .catch(() => toast.error("Fullscreen is unavailable in this preview."))
                }
              >
                <Maximize />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Toggle inspector"
                aria-label="Toggle inspector"
                onClick={() => setInspector(!inspector)}
              >
                {inspector ? <PanelRightClose /> : <PanelRightOpen />}
              </Button>
            </div>
          </header>
          <div className="studio-stage">
            <EditorCanvas
              project={project}
              draft={draft}
              time={time}
              playing={playing}
              onTime={setTime}
              onEnd={() => setPlaying(false)}
              onSelect={select}
            />
          </div>
          <div className="studio-playback">
            <div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={playing ? "Pause" : "Play"}
                title={playing ? "Pause" : "Play"}
                onClick={() => {
                  if (time >= duration) setTime(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play fill="currentColor" />}
              </Button>
              <span>
                {formatTime(time)}
                <small> / {formatTime(duration)}</small>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={duration}
              step=".1"
              value={time}
              aria-label="Scrub playhead"
              onChange={(e) => {
                setTime(Number(e.target.value));
                setPlaying(false);
              }}
            />
            <div>
              <Button
                variant="ghost"
                size="icon"
                title={draft.muted ? "Unmute" : "Mute"}
                aria-label={draft.muted ? "Unmute" : "Mute"}
                onClick={() => change({ ...draft, muted: !draft.muted })}
              >
                {draft.muted ? <VolumeX /> : <Volume2 />}
              </Button>
              <span className="stage-fit">Fit</span>
            </div>
          </div>
        </section>
        {inspector && (
          <StudioInspector
            key={tab}
            tab={tab}
            draft={draft}
            change={change}
            selected={selected}
            setSelected={select}
            time={time}
            brand={brand}
            onClose={() => setInspector(false)}
            onAddVideo={addVideo}
            addingVideo={addingVideo}
          />
        )}
      </div>
      <EditorTimeline
        draft={draft}
        change={change}
        onTrimPreview={(next) => setDraft(projectId, next)}
        onTrimCommit={(before, after) => {
          if (JSON.stringify(before.events) === JSON.stringify(after.events)) return;
          setHistory((h) => [...h.slice(-59), before]);
          setFuture([]);
          setDraft(projectId, after);
          setTime((t) => Math.min(t, timelineDuration(after.events)));
        }}
        selected={selected}
        onAddVideo={addVideo}
        addingVideo={addingVideo}
        onAddTransition={() => { setTab("Animation"); setInspector(true); }}
        onJunctionClick={() => { setTab("Animation"); setInspector(true); }}
        onEventProperties={() => setInspector(true)}
        setSelected={select}
        time={time}
        setTime={(t) => {
          setTime(t);
          setPlaying(false);
        }}
      />
      <footer className="studio-footer">
        <span>
          <span className="live-dot" />
          Session draft · original files unchanged
        </span>
        <Link to="/help">Help Center ↗</Link>
      </footer>
    </div>
  );
}
