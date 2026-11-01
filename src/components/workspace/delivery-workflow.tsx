import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  Download,
  Play,
  Pause,
  Monitor,
  Smartphone,
  Copy,
  Link2,
  ShieldCheck,
  Send,
  Sparkles,
  FileText,
  Globe,
  Calendar,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWorkspace } from "@/lib/workspace";
import { downloadFile, timelineDuration, safeExternal, formatTime, playbackSpeedOf, videoSpeeds, exportDuration } from "@/lib/editor-model";
import { EditorCanvas } from "./editor-canvas";
import { WorkflowSteps } from "./creation-workflow";
import { toast } from "sonner";
export function ReviewPage({ projectId }: { projectId: string }) {
  const { projects, updateProject, getDraft, setDraft } = useWorkspace();
  const p = projects.find((p) => p.id === projectId);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  if (!p) return <MissingProject />;
  const draft = getDraft(projectId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A QUICK CHECK BEFORE THE CREATIVE PART</div>
          <h1>Review your source</h1>
          <p>Take a moment to make sure everything looks right.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/create">
            <ArrowLeft />
            Back to create
          </Link>
        </Button>
      </div>
      <WorkflowSteps step={2} />
      <div className="review-workflow">
        <section>
          {p.source?.startsWith("blob:") ? (
            <video
              className="source-video"
              src={p.source}
              controls
              onError={() =>
                setError(
                  "This recording could not be played. Try MP4 or WebM in a supported browser.",
                )
              }
              onLoadedMetadata={(e) => {
                const duration = e.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  updateProject(projectId, { duration });
                  setDraft(projectId, {
                    ...draft,
                    events: draft.events.map((v) => (v.lane === "video" ? { ...v, duration } : v)),
                  });
                }
              }}
            />
          ) : (
            <div className="source-brief">
              <span className="tool-section-icon">
                {p.sourceMethod === "prompt" ? <Sparkles size={35} /> : <Link2 size={35} />}
              </span>
              <span className="sample-label">Planning draft</span>
              <h2>{p.name}</h2>
              <p>{p.prompt || p.source || "Create your product story."}</p>
              <div className="info-note">
                URL capture and AI generation are not connected. The editor will show sample
                screens, not captured website content.
              </div>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="review-source-info">
            <ShieldCheck size={18} />
            <span>Original files are unchanged. Your recording stays in this session.</span>
          </div>
        </section>
        <aside className="review-details">
          <h2>Your project, at a glance</h2>
          <div className="review-list">
            <div>
              <span>Project</span>
              <b>{p.name}</b>
            </div>
            <div>
              <span>Type</span>
              <b>{p.type === "demo" ? "Interactive demo" : "Short-form video"}</b>
            </div>
            <div>
              <span>Source</span>
              <b>{p.sourceMethod || "Sample"}</b>
            </div>
            <div>
              <span>Recording</span>
              <b>{p.sourceName || "No recording"}</b>
            </div>
            <div>
              <span>Aspect ratio</span>
              <b>{p.ratio || "16:9"}</b>
            </div>
            <div>
              <span>Duration</span>
              <b>{p.duration ? formatTime(p.duration) : "Not measured"}</b>
            </div>
            <div>
              <span>Language</span>
              <b>{p.language || "English"}</b>
            </div>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I’ve reviewed the content and have permission to use it.
          </label>
          <Button disabled={!confirmed || !!error} asChild>
            <Link to="/editor/$projectId" params={{ projectId }}>
              Open editor <ArrowRight />
            </Link>
          </Button>
          <p className="record-hint">
            AI clip suggestions, active speaker tracking, and dubbing are planned. Manual editing is
            available now.
          </p>
        </aside>
      </div>
    </>
  );
}
export function MissingProject() {
  return (
    <div className="empty-state">
      <h1>Project not found</h1>
      <p>Local drafts are available for the current session only.</p>
      <Button asChild>
        <Link to="/projects">Back to projects</Link>
      </Button>
    </div>
  );
}
export function PreviewPage({ projectId }: { projectId: string }) {
  const { projects, getDraft } = useWorkspace();
  const p = projects.find((p) => p.id === projectId);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [device, setDevice] = useState("Desktop");
  const [gateDismissed, setGateDismissed] = useState(false);
  const [leadMessage, setLeadMessage] = useState("");
  if (!p) return <MissingProject />;
  const draft = getDraft(projectId);
  const duration = timelineDuration(draft.events);
  const gate = draft.gate !== "Off" && !gateDismissed && time >= duration / 2;
  function external(url: string) {
    const safe = safeExternal(url);
    if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    else toast.error("Add a valid https:// destination in the editor.");
  }
  return (
    <div className="audience-page">
      <header className="delivery-header">
        <Button variant="ghost" asChild>
          <Link to="/editor/$projectId" params={{ projectId }}>
            <ArrowLeft />
            Back to editor
          </Link>
        </Button>
        <div>
          <h1>{p.name}</h1>
          <span>Audience preview · not published</span>
        </div>
        <ThemeToggle />
        <Button asChild>
          <Link to="/export/$projectId" params={{ projectId }}>
            <Send />
            Export & share
          </Link>
        </Button>
      </header>
      <div className="preview-device">
        <Button
          variant={device === "Desktop" ? "secondary" : "ghost"}
          onClick={() => setDevice("Desktop")}
        >
          <Monitor />
          Desktop
        </Button>
        <Button
          variant={device === "Mobile" ? "secondary" : "ghost"}
          onClick={() => setDevice("Mobile")}
        >
          <Smartphone />
          Mobile
        </Button>
      </div>
      <div className={`audience-stage ${device === "Mobile" ? "audience-mobile" : ""}`}>
        <EditorCanvas
          project={p}
          draft={device === "Mobile" ? { ...draft, ratio: "9:16" } : draft}
          time={time}
          playing={playing && !gate}
          onTime={setTime}
          onEnd={() => setPlaying(false)}
        />
        {gate && (
          <div className="preview-gate">
            <Button
              variant="ghost"
              size="icon"
              className="gate-close"
              title="Close lead gate preview"
              aria-label="Close lead gate preview"
              onClick={() => setGateDismissed(true)}
            >
              <X />
            </Button>
            <span className="sample-label">Form preview · no data sent</span>
            <h2>Let’s keep the conversation going.</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLeadMessage(
                  "Form validated locally. CRM delivery is not connected; no lead was submitted.",
                );
              }}
            >
              <label className="field-label">
                Name
                <input className="form-input" required />
              </label>
              <label className="field-label">
                Work email
                <input className="form-input" type="email" required />
              </label>
              <label className="field-label">
                Company size
                <select>
                  <option>1–10</option>
                  <option>11–50</option>
                  <option>51–200</option>
                  <option>201+</option>
                </select>
              </label>
              <label className="checkbox-field">
                <input type="checkbox" required />I agree to be contacted for this preview.
              </label>
              <Button type="submit">
                Test form validation <ArrowRight />
              </Button>
            </form>
            {leadMessage && <p role="status">{leadMessage}</p>}
            {draft.gate === "Soft gate" && (
              <Button variant="link" onClick={() => setGateDismissed(true)}>
                Skip for now
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="audience-controls">
        <Button
          variant="outline"
          size="icon"
          aria-label={playing ? "Pause preview" : "Play preview"}
          onClick={() => {
            if (time >= duration) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span>{formatTime(time)}</span>
        <input
          type="range"
          min="0"
          max={duration}
          step=".1"
          value={time}
          aria-label="Audience playhead"
          onChange={(e) => setTime(Number(e.target.value))}
        />
        <span>{formatTime(duration)}</span>
      </div>
      {time >= duration - 5 && (
        <div className="branching-preview">
          <Button
            variant="outline"
            disabled={!draft.branchOneUrl}
            onClick={() => external(draft.branchOneUrl)}
          >
            {draft.branchOne}
            <ArrowRight />
          </Button>
          <Button
            variant="outline"
            disabled={!draft.branchTwoUrl}
            onClick={() => external(draft.branchTwoUrl)}
          >
            {draft.branchTwo}
            <ArrowRight />
          </Button>
        </div>
      )}
      <div className="preview-cta">
        <Button disabled={!draft.destination} onClick={() => external(draft.destination)}>
          {draft.cta}
          <ArrowRight />
        </Button>
        {draft.scheduleUrl && (
          <Button variant="outline" onClick={() => external(draft.scheduleUrl)}>
            <Calendar />
            Schedule a conversation
          </Button>
        )}
      </div>
      <p className="preview-note">
        Preview only. No analytics events, leads, or external service requests are recorded.
      </p>
    </div>
  );
}
export function ExportPage({ projectId }: { projectId: string }) {
  const { projects, getDraft, setDraft, setUploadPosts } = useWorkspace();
  const p = projects.find((p) => p.id === projectId);
  const draft = getDraft(projectId);
  const [format, setFormat] = useState("MP4");
  const [resolution, setResolution] = useState("1080p");
  const [fps, setFps] = useState("30");
  const [quality, setQuality] = useState("High");
  const [checks, setChecks] = useState([false, false, false]);
  const [mode, setMode] = useState("Export");
  const [caption, setCaption] = useState(true);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const speed = playbackSpeedOf(draft);
  const duration = timelineDuration(draft.events);
  if (!p) return <MissingProject />;
  function srt() {
    const content = draft.events
      .filter((e) => e.lane === "text" && e.text)
      .sort((a, b) => a.start - b.start)
      .map((e, i) => {
        function timestamp(t: number) {
          return new Date(t * 1000).toISOString().slice(11, 23).replace(".", ",");
        }
        return `${i + 1}\n${timestamp(e.start / speed)} --> ${timestamp((e.start + e.duration) / speed)}\n${e.text}\n`;
      })
      .join("\n");
    downloadFile(content, `${p?.name || "project"}.srt`, "text/plain");
    toast.success("Manual captions downloaded");
  }
  return (
    <div className="export-page">
      <header className="delivery-header">
        <Button variant="ghost" asChild>
          <Link to="/editor/$projectId" params={{ projectId }}>
            <ArrowLeft />
            Back to editor
          </Link>
        </Button>
        <div>
          <h1>Ready for the world?</h1>
          <span>Give your story one last look.</span>
        </div>
        <ThemeToggle />
        <Button variant="outline" asChild>
          <Link to="/preview/$projectId" params={{ projectId }}>
            <Play />
            Preview
          </Link>
        </Button>
      </header>
      <WorkflowSteps step={4} />
      <div className="export-workflow">
        <section>
          <EditorCanvas project={p} draft={draft} time={time} playing={playing} onTime={setTime} onEnd={() => setPlaying(false)} />
          <div className="audience-controls">
            <Button variant="outline" size="icon" aria-label={playing ? "Pause export preview" : "Play export preview"} onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />}</Button>
            <span>{formatTime(time / speed)}</span>
            <input type="range" min="0" max={duration} step=".1" value={time} aria-label="Export preview playhead" onChange={(e) => { setTime(Number(e.target.value)); setPlaying(false); }} />
            <span>{formatTime(exportDuration(draft))}</span>
          </div>
          <div className="export-project-info">
            <h2>{p.name}</h2>
            <span>
              {draft.ratio} · {formatTime(exportDuration(draft))} at {speed}× · Draft
            </span>
          </div>
          <h2 className="source-title">Before you share</h2>
          <div className="export-checklist">
            {[
              "Reviewed the full experience and every CTA",
              "Checked framing, captions, and audio",
              "Confirmed content rights and privacy",
            ].map((c, i) => (
              <label className="checkbox-field" key={c}>
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={(e) =>
                    setChecks((p) => p.map((v, j) => (i === j ? e.target.checked : v)))
                  }
                />
                {c}
              </label>
            ))}
          </div>
          <div className="info-note">
            Original downloads do not include trims, speed changes, masks, captions, reframing, or effects. Draft
            settings describe edits; they are not a rendered video.
          </div>
        </section>
        <aside className="export-options">
          <div className="source-tabs">
            {["Export", "Publish"].map((m) => (
              <Button
                key={m}
                variant={mode === m ? "secondary" : "ghost"}
                onClick={() => setMode(m)}
              >
                {m === "Export" ? <Download /> : <Globe />}
                {m}
              </Button>
            ))}
          </div>
          {mode === "Export" ? (
            <>
              <h2>Export settings</h2>
              <div className="form-grid">
                <label className="field-label">
                  Format
                  <select value={format} onChange={(e) => setFormat(e.target.value)}>
                    <option>MP4</option>
                    <option>GIF</option>
                    <option>WebM</option>
                  </select>
                </label>
                <label className="field-label">
                  Resolution
                  <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                    <option>1080p</option>
                    <option>720p</option>
                    <option>4K</option>
                  </select>
                </label>
                <label className="field-label">
                  Frame rate
                  <select value={fps} onChange={(e) => setFps(e.target.value)}>
                    <option>24</option>
                    <option>30</option>
                    <option>60</option>
                  </select>
                </label>
                <label className="field-label">
                  Quality
                  <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                    <option>High</option>
                    <option>Standard</option>
                  </select>
                </label>
              </div>
              <label className="field-label">
                Video speed
                <select aria-label="Video speed" value={speed} onChange={(e) => setDraft(projectId, { ...draft, playbackSpeed: Number(e.target.value) })}>
                  {videoSpeeds.map((rate) => <option key={rate} value={rate}>{rate}×{rate === 1 ? " · Normal" : ""}</option>)}
                </select>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={caption}
                  onChange={(e) => setCaption(e.target.checked)}
                />
                Include captions in export settings
              </label>
              <Button disabled>Render {format} · Not connected</Button>
              <div className="info-note">
                Media rendering is not connected. Export choices are included in your draft
                download.
              </div>
              <Button
                variant="outline"
                disabled={!checks.every(Boolean)}
                onClick={() => {
                  downloadFile(
                    JSON.stringify(
                      {
                        project: p,
                        draft,
                        export: { format, resolution, fps, quality, captions: caption, speed, duration: exportDuration(draft) },
                      },
                      null,
                      2,
                    ),
                    `${p.name}-draft.json`,
                  );
                  toast.success("Draft settings downloaded");
                }}
              >
                <FileText />
                Download draft settings
              </Button>
              <Button
                variant="outline"
                onClick={srt}
                disabled={!draft.events.some((e) => e.lane === "text" && e.text)}
              >
                <CaptionsIcon />
                Download manual captions (.srt)
              </Button>
              {p.source?.startsWith("blob:") && (
                <Button
                  variant="outline"
                  disabled={!checks.every(Boolean)}
                  onClick={async () => {
                    try {
                      const response = await fetch(p.source || "");
                      const blob = await response.blob();
                      downloadFile(blob, p.sourceName || "original-recording.webm");
                      toast.success("Original recording downloaded, without edits");
                    } catch {
                      toast.error("Original recording is unavailable. Re-upload the file.");
                    }
                  }}
                >
                  <Download />
                  Download original recording
                </Button>
              )}
            </>
          ) : (
            <>
              <h2>Publish an experience</h2>
              <Button variant="outline" asChild onClick={() => {
                setUploadPosts((posts) => [{ id: crypto.randomUUID(), title: p.name, caption: draft.description || p.name, channels: [], status: "Draft", scheduledAt: "", projectId }, ...posts]);
              }}>
                <Link to="/uploads"><Calendar /> Add to upload queue</Link>
              </Button>
              <label className="field-label">
                Visibility
                <select>
                  <option>Unlisted</option>
                  <option>Public</option>
                  <option>Private</option>
                </select>
              </label>
              <div className="info-note">
                Hosted links, website embeds, QR codes, lead delivery, and playback tracking require
                a connected publishing service.
              </div>
              <Button disabled>
                <Send />
                Publish · Not connected
              </Button>
              <label className="field-label">
                Published URL
                <input className="form-input" disabled placeholder="No published version" />
              </label>
              <Button variant="outline" disabled>
                <Copy />
                Copy embed code
              </Button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
function CaptionsIcon() {
  return <FileText size={16} />;
}
