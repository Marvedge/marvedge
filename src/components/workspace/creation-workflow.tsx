import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowLeft,
  Monitor,
  Video,
  UploadCloud,
  Link2,
  Sparkles,
  MousePointer2,
  Film,
  Check,
  Pause,
  Square,
  Play,
  Download,
  RotateCcw,
  Mic,
  ShieldCheck,
  CircleHelp,
  FileVideo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace, type Project } from "@/lib/workspace";
import { downloadFile, formatTime } from "@/lib/editor-model";
import { toast } from "sonner";
export function WorkflowSteps({ step }: { step: number }) {
  return (
    <div className="journey-steps">
      {["Source", "Review", "Edit", "Export"].map((s, i) => (
        <span key={s} className={i + 1 === step ? "current" : i + 1 < step ? "complete" : ""}>
          <b>{i + 1 < step ? <Check size={12} /> : i + 1}</b>
          {s}
          {i < 3 && <ArrowRight size={13} />}
        </span>
      ))}
    </div>
  );
}
export function SourcePage({ initialType, initialMethod }: { initialType?: string; initialMethod?: string }) {
  const [type, setType] = useState(initialType === "video" ? "video" : "demo");
  const [method, setMethod] = useState(initialMethod ?? "url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [audience, setAudience] = useState("New customers");
  const [purpose, setPurpose] = useState("Product onboarding");
  const [ratio, setRatio] = useState(initialType === "video" ? "9:16" : "16:9");
  const [language, setLanguage] = useState("English");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const { addProject } = useWorkspace();
  const navigate = useNavigate();
  function submit() {
    if (!name.trim()) {
      setError("Give your project a name.");
      return;
    }
    if (method === "url") {
      try {
        const u = new URL(url);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        setError("Enter a complete https:// product URL.");
        return;
      }
    }
    if (method === "prompt" && !prompt.trim()) {
      setError("Describe the demo you want to create.");
      return;
    }
    if (method === "upload" && !file) {
      setError("Choose a recording first.");
      return;
    }
    if (!consent) {
      setError("Confirm you have permission to use this content.");
      return;
    }
    const id = crypto.randomUUID();
    const project: Project = {
      id,
      name: name.trim(),
      type: type === "video" ? "video" : "demo",
      status: "Draft",
      updated: "Just now",
      thumbnail: type === "video" ? "video" : "product",
      sourceMethod: method,
      ratio,
      language,
      audience,
      prompt: method === "prompt" ? prompt : `${purpose} for ${audience}`,
      source: file ? URL.createObjectURL(file) : url,
      sourceName: file?.name || url,
      sourceSize: file?.size,
    };
    addProject(project);
    navigate({ to: "/review/$projectId", params: { projectId: id } });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FROM IDEA TO EXPERIENCE</div>
          <h1>Create something remarkable.</h1>
          <p>Choose your starting point. We’ll keep the next steps simple.</p>
        </div>
        <Link to="/projects" className="text-muted-foreground text-xs">
          Back to projects
        </Link>
      </div>
      <WorkflowSteps step={1} />
      <div className="source-workflow">
        <section>
          <div className="type-options">
            {[
              { id: "demo", icon: MousePointer2, name: "Interactive demo" },
              { id: "video", icon: Film, name: "Short-form video" },
            ].map((t) => (
              <Button
                variant="outline"
                className={`type-option ${type === t.id ? "selected" : ""}`}
                key={t.id}
                onClick={() => {
                  setType(t.id);
                  setRatio(t.id === "video" ? "9:16" : "16:9");
                  if (t.id === "video") setMethod("upload");
                }}
              >
                <t.icon />
                <b>{t.name}</b>
                <span className="radio-dot">{type === t.id && <Check size={12} />}</span>
              </Button>
            ))}
          </div>
          <h2 className="source-title">How would you like to start?</h2>
          <div className="source-methods">
            {[
              { id: "url", icon: Link2, title: "Website URL", label: "Start from your product" },
              {
                id: "prompt",
                icon: Sparkles,
                title: "Describe an idea",
                label: "Start with a demo goal",
              },
              {
                id: "record",
                icon: Monitor,
                title: "Record screen",
                label: "Capture your own flow",
              },
              {
                id: "upload",
                icon: UploadCloud,
                title: "Upload a video",
                label: "Bring an existing recording",
              },
            ].map((m) =>
              m.id === "record" ? (
                <Button key={m.id} variant="outline" asChild className="source-method">
                  <Link to="/record">
                    <m.icon />
                    <b>{m.title}</b>
                    <small>{m.label}</small>
                    <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button
                  key={m.id}
                  variant="outline"
                  className={`source-method ${method === m.id ? "selected" : ""}`}
                  onClick={() => {
                    setMethod(m.id);
                    setError("");
                  }}
                >
                  <m.icon />
                  <b>{m.title}</b>
                  <small>{m.label}</small>
                </Button>
              ),
            )}
          </div>
          <div className="form-section">
            <label className="field-label">
              Project name
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Product onboarding tour"
              />
            </label>
            {method === "url" && (
              <label className="field-label">
                Product URL
                <div className="input-icon">
                  <Link2 size={16} />
                  <input
                    value={url}
                    type="url"
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-product.com"
                  />
                </div>
                <small>
                  URL capture is not connected. A planning draft will use sample screens.
                </small>
              </label>
            )}
            {method === "prompt" && (
              <label className="field-label">
                Your demo goal
                <textarea
                  className="form-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Introduce our analytics dashboard to first-time customers..."
                />
                <small>
                  AI generation is planned. Your brief will be attached to a draft for manual
                  editing.
                </small>
              </label>
            )}
            {method === "upload" && (
              <label className="upload-zone">
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && !["video/mp4", "video/webm", "video/quicktime"].includes(f.type)) {
                      setError("Choose an MP4, WebM, or MOV file.");
                      return;
                    }
                    setFile(f || null);
                    setError("");
                  }}
                />
                {file ? <FileVideo size={30} /> : <UploadCloud size={30} />}
                <b>{file?.name || "Choose your recording"}</b>
                <span>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                    : "MP4, WebM, or MOV · Browser playback support varies"}
                </span>
                <span className="upload-button">Browse files</span>
              </label>
            )}
            <div className="form-grid">
              <label className="field-label">
                Audience
                <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                  <option>New customers</option>
                  <option>Prospective buyers</option>
                  <option>Your team</option>
                  <option>Developers</option>
                </select>
              </label>
              <label className="field-label">
                Purpose
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  <option>Product onboarding</option>
                  <option>Feature launch</option>
                  <option>Sales walkthrough</option>
                  <option>Training</option>
                </select>
              </label>
              <label className="field-label">
                Aspect ratio
                <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                  {["16:9", "9:16", "1:1", "4:5"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Language
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </label>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I have permission to use this content.
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span>Local draft · no AI processing starts</span>
              <Button onClick={submit}>
                Review project <ArrowRight />
              </Button>
            </div>
          </div>
        </section>
        <aside className="journey-aside">
          <span className="creation-icon">
            <Sparkles />
          </span>
          <h2>
            A great story starts
            <br />
            with a clear goal.
          </h2>
          <p>Choose your audience, capture the essentials, and make every interaction count.</p>
          <div>
            <Check size={14} /> Review before editing
          </div>
          <div>
            <Check size={14} /> Make every detail your own
          </div>
          <div>
            <Check size={14} /> Keep your original recording
          </div>
          <Link to="/help">
            <CircleHelp size={14} /> Need a little help?
          </Link>
          <div className="info-note">
            Recordings and drafts stay in this browser session. Download originals before leaving.
          </div>
        </aside>
      </div>
    </>
  );
}
export function RecordingPage() {
  const [state, setState] = useState("idle");
  const [mic, setMic] = useState(false);
  const [system, setSystem] = useState(true);
  const [consent, setConsent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("My screen recording");
  const streamRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const { addProject } = useWorkspace();
  const navigate = useNavigate();
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  useEffect(
    () => () => {
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      micRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      setState("finishing");
    }
  }
  async function start() {
    if (!consent) {
      setError("Confirm everyone shown or heard has given permission.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setError(
        "Screen recording needs a supported desktop browser on HTTPS. Try uploading a recording instead.",
      );
      return;
    }
    setError("");
    setState("choosing");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: system });
      streamRef.current = stream;
      let combined = stream;
      if (mic) {
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
        micRef.current = microphone;
        combined = new MediaStream([...stream.getVideoTracks(), ...microphone.getAudioTracks()]);
        if (stream.getAudioTracks().length)
          toast.info(
            "Microphone selected; this recording uses microphone audio rather than system audio.",
          );
      }
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      const recorder = mime
        ? new MediaRecorder(combined, { mimeType: mime })
        : new MediaRecorder(combined);
      recorderRef.current = recorder;
      const parts: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      recorder.onstop = () => {
        const output = new Blob(parts, { type: recorder.mimeType });
        if (output.size) {
          setBlob(output);
          setUrl(URL.createObjectURL(output));
          setState("ready");
        } else {
          setError("The recording was empty. Please try again.");
          setState("idle");
        }
        stream.getTracks().forEach((t) => t.stop());
        micRef.current?.getTracks().forEach((t) => t.stop());
        if (previewRef.current) previewRef.current.srcObject = null;
      };
      recorder.onerror = () => {
        setError("Recording stopped unexpectedly. Try again or upload a recording.");
        stop();
      };
      stream.getVideoTracks().forEach((t) => (t.onended = stop));
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }
      setSeconds(0);
      recorder.start(250);
      setState("recording");
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      micRef.current?.getTracks().forEach((t) => t.stop());
      setState("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Screen sharing was cancelled or permission was denied. Choose a screen to retry."
          : "Could not start recording. Check browser permissions and try again.",
      );
    }
  }
  function proceed() {
    if (!blob || !url || !name.trim()) return;
    const id = crypto.randomUUID();
    addProject({
      id,
      name: name.trim(),
      type: "demo",
      status: "Draft",
      updated: "Just now",
      thumbnail: "product",
      source: url,
      sourceName: "screen-recording.webm",
      sourceSize: blob.size,
      sourceMethod: "record",
      duration: Math.max(1, seconds),
      ratio: "16:9",
    });
    navigate({ to: "/review/$projectId", params: { projectId: id } });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SHOW YOUR PRODUCT IN ACTION</div>
          <h1>Record your screen</h1>
          <p>Your flow, captured exactly how you see it.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/create">
            <ArrowLeft />
            Back to create
          </Link>
        </Button>
      </div>
      <WorkflowSteps step={1} />
      <div className="recording-layout">
        <section>
          <div className={`recording-stage ${state === "recording" ? "is-recording" : ""}`}>
            <div className="recording-status">
              <span className={state === "recording" ? "record-dot" : ""} />
              {state === "recording"
                ? "Recording"
                : state === "paused"
                  ? "Paused"
                  : state === "ready"
                    ? "Recording ready"
                    : "Screen preview"}
              <time>{formatTime(seconds)}</time>
            </div>
            {url && state === "ready" ? (
              <video src={url} controls />
            ) : (
              <>
                <video
                  ref={previewRef}
                  muted
                  autoPlay
                  playsInline
                  className={["recording", "paused"].includes(state) ? "" : "recording-hidden"}
                />
                {!["recording", "paused"].includes(state) && (
                  <div className="recording-placeholder">
                    <Monitor size={58} />
                    <h2>A window into your product.</h2>
                    <p>
                      Choose a browser tab, window, or entire screen.
                      <br />
                      Only your chosen screen will be recorded.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="recording-controls">
            {["idle", "choosing"].includes(state) ? (
              <Button disabled={state === "choosing"} onClick={start}>
                <span className="record-button-dot" />
                {state === "choosing" ? "Choose a screen…" : "Choose screen & record"}
              </Button>
            ) : ["recording", "paused"].includes(state) ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const r = recorderRef.current;
                    if (!r) return;
                    if (r.state === "recording") {
                      r.pause();
                      setState("paused");
                    } else if (r.state === "paused") {
                      r.resume();
                      setState("recording");
                    }
                  }}
                >
                  {state === "paused" ? <Play /> : <Pause />}
                  {state === "paused" ? "Resume" : "Pause"}
                </Button>
                <Button variant="destructive" onClick={stop}>
                  <Square />
                  Stop recording
                </Button>
              </>
            ) : state === "ready" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setState("idle");
                    setBlob(null);
                    setUrl("");
                    setSeconds(0);
                  }}
                >
                  <RotateCcw />
                  Record again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (blob) downloadFile(blob, "screen-recording.webm");
                  }}
                >
                  <Download />
                  Download original
                </Button>
              </>
            ) : (
              <span>Finalizing your recording…</span>
            )}
          </div>
          {error && (
            <div className="recording-error" role="alert">
              <p>{error}</p>
              <Button variant="link" asChild>
                <Link to="/create">
                  Upload a video instead <ArrowRight />
                </Link>
              </Button>
            </div>
          )}
          <div className="info-note">
            <ShieldCheck size={18} />
            Hide passwords, personal information, and private tabs before you record. Visual privacy
            effects in the editor are previews, not secure redaction of the original file.
          </div>
        </section>
        <aside className="recording-options">
          <h2>{state === "ready" ? "Your recording is ready" : "Recording settings"}</h2>
          <label className="field-label">
            Project name
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={["recording", "paused"].includes(state)}
            />
          </label>
          <label className="record-option">
            <Mic />
            <span>
              <b>Microphone</b>
              <small>Include your narration</small>
            </span>
            <input
              type="checkbox"
              checked={mic}
              disabled={state !== "idle"}
              onChange={(e) => setMic(e.target.checked)}
            />
          </label>
          <label className="record-option">
            <Video />
            <span>
              <b>System / tab audio</b>
              <small>Depends on browser support</small>
            </span>
            <input
              type="checkbox"
              checked={system}
              disabled={state !== "idle" || mic}
              onChange={(e) => setSystem(e.target.checked)}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={consent}
              disabled={state !== "idle"}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have permission to record everyone shown or heard.
          </label>
          <p className="record-hint">
            Chrome and Edge on desktop work best. Screen capture may be unavailable inside an
            embedded preview; opening the app in a separate tab can help.
          </p>
          {state === "ready" && (
            <>
              <div className="review-list">
                <div>
                  <span>Duration</span>
                  <b>{formatTime(seconds)}</b>
                </div>
                <div>
                  <span>Size</span>
                  <b>{blob ? `${(blob.size / 1024 / 1024).toFixed(1)} MB` : "—"}</b>
                </div>
              </div>
              <Button disabled={!name.trim()} onClick={proceed}>
                Use recording <ArrowRight />
              </Button>
            </>
          )}
          <Link to="/help" className="resource-link">
            <CircleHelp size={18} />
            Recording help
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </>
  );
}
