import { readAudioClip } from "@/lib/editor-media";
import { WatermarkPanel } from "./watermark-panel";
import { TransitionPicker } from "./transition-picker";
import { useState } from "react";
import {
  Search,
  Plus,
  Upload,
  RotateCcw,
  Sparkles,
  Check,
  ArrowUpRight,
  Type,
  Volume2,
  Languages,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  annotationPresets,
  effectPresets,
  interactionPresets,
  transitionPresets,
  eventTemplate,
  type EditorDraft,
  type EditorEvent,
  type Lane,
} from "@/lib/editor-model";
import { toast } from "sonner";
export function StudioInspector({
  tab,
  draft,
  change,
  selected,
  setSelected,
  time,
  brand,
  onClose,
  onAddVideo,
  addingVideo,
}: {
  tab: string;
  draft: EditorDraft;
  change: (d: EditorDraft) => void;
  selected: string;
  setSelected: (s: string) => void;
  time: number;
  brand: { color: string; font: string };
  onClose?: () => void;
  onAddVideo: (file: File) => void;
  addingVideo: boolean;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const event = draft.events.find((e) => e.id === selected);
  const locked = event ? draft.locked.includes(event.lane) : false;
  function add(lane: Lane, kind: string) {
    const e = eventTemplate(lane, kind, time);
    if (lane === "text") e.y = 80;
    change({ ...draft, events: [...draft.events, e] });
    setSelected(e.id);
    toast.success(`${kind} added`);
  }
  function update(p: Partial<EditorEvent>) {
    if (event && !locked)
      change({
        ...draft,
        events: draft.events.map((e) => (e.id === event.id ? { ...e, ...p } : e)),
      });
  }
  function field(name: string, key: "name" | "text") {
    return (
      <label className="field-label">
        {name}
        {key === "text" ? (
          <textarea
            className="form-input"
            value={event?.[key] || ""}
            disabled={!event || locked}
            onChange={(e) => update({ [key]: e.target.value })}
          />
        ) : (
          <input
            className="form-input"
            value={event?.[key] || ""}
            disabled={!event || locked}
            onChange={(e) => update({ [key]: e.target.value })}
          />
        )}
      </label>
    );
  }
  const categoryPresets =
    tab === "Effects"
      ? effectPresets
      : tab === "Camera"
        ? ["Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down"]
        : tab === "Interactions"
          ? interactionPresets
          : tab === "Annotations"
            ? annotationPresets
            : tab === "Animation"
              ? transitionPresets
              : tab === "Text"
                ? ["Heading", "Subtitle", "Body", "Label", "Badge", "Quote"]
                : [];
  const lane: Lane =
    tab === "Camera"
      ? "camera"
      : tab === "Interactions"
        ? "interactions"
        : tab === "Text" || tab === "Annotations"
          ? "text"
          : "effects";
  return (
    <aside className="studio-inspector" data-tab={tab} aria-label={`${tab} properties`}>
      <header>
        <h2>{tab === "Animation" ? "Transitions" : tab}</h2>
        <span>
          {tab === "Canvas"
            ? "Project settings"
            : tab === "AI Assistant"
              ? "Automation"
              : "Tools & properties"}
        </span>
        {onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close properties" title="Close properties"><X /></Button>}
      </header>
      <div className="inspector-scroll">
        {tab === "Canvas" && (
          <>
            <label className="field-label">
              Description
              <textarea
                className="form-input"
                value={draft.description}
                onChange={(e) => change({ ...draft, description: e.target.value })}
                placeholder="A little context for your audience..."
              />
            </label>
            <label className="field-label">
              Aspect ratio
              <div className="ratio-options">
                {["16:9", "9:16", "1:1", "4:5"].map((r) => (
                  <Button
                    variant={draft.ratio === r ? "secondary" : "outline"}
                    key={r}
                    onClick={() => change({ ...draft, ratio: r })}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </label>
            <label className="field-label">
              Background
              <div className="color-swatches">
                {["lavender", "purple", "green", "coral", "charcoal"].map((c) => (
                  <Button
                    variant="ghost"
                    key={c}
                    className={`swatch swatch-${c} ${draft.background === c ? "swatch-selected" : ""}`}
                    aria-label={`Canvas ${c}`}
                    onClick={() => change({ ...draft, background: c, backgroundImage: "" })}
                  >
                    {draft.background === c && <Check size={14} />}
                  </Button>
                ))}
              </div>
            </label>
            <label className="file-control">
              <Upload size={14} />
              Upload background
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) change({ ...draft, backgroundImage: URL.createObjectURL(f) });
                }}
              />
            </label>
            <label className="field-label">
              Browser frame
              <select
                value={draft.frame}
                onChange={(e) => change({ ...draft, frame: e.target.value })}
              >
                <option>Default</option>
                <option>Minimal</option>
                <option>Hidden</option>
              </select>
            </label>
            <label className="field-label">
              Canvas padding · {draft.padding}px
              <input
                type="range"
                min="0"
                max="64"
                value={draft.padding}
                onChange={(e) => change({ ...draft, padding: Number(e.target.value) })}
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.shadow}
                onChange={(e) => change({ ...draft, shadow: e.target.checked })}
              />
              Drop shadow
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.border}
                onChange={(e) => change({ ...draft, border: e.target.checked })}
              />
              Border
            </label>
          </>
        )}
        {tab === "Animation" && (
          <TransitionPicker draft={draft} change={change} selected={selected} setSelected={setSelected} time={time} />
        )}
        {tab !== "Animation" && categoryPresets.length > 0 && (
          <>
            <label className="search-field">
              <Search size={14} />
              <input
                aria-label="Search editor tools"
                placeholder={`Search ${tab.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {tab === "Effects" && (
              <div className="effect-groups">
                {["All", "Subtle", "Emphasis", "Cinematic"].map((g) => (
                  <Button
                    key={g}
                    variant={g === group ? "secondary" : "ghost"}
                    onClick={() => setGroup(g)}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            )}
            <div className="preset-grid">
              {categoryPresets
                .filter((p) => p.toLowerCase().includes(search.toLowerCase()))
                .filter(
                  (p) =>
                    tab !== "Effects" ||
                    group === "All" ||
                    (group === "Subtle"
                      ? ["Glow", "Border highlight"].includes(p)
                      : group === "Emphasis"
                        ? ["Spotlight", "Pulse", "Magnify"].includes(p)
                        : ["Dim surroundings", "Blur surroundings"].includes(p)),
                )
                .map((p) => (
                  <Button
                    variant="outline"
                    className="preset-item"
                    key={p}
                    onClick={() => add(lane, p)}
                  >
                    <span
                      className={`preset-preview preset-${p.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {tab === "Text"
                        ? "Aa"
                        : tab === "Interactions"
                          ? "↖"
                          : tab === "Camera"
                            ? "⌕"
                            : "◈"}
                    </span>
                    <span>{p}</span>
                    <Plus size={12} />
                  </Button>
                ))}
            </div>
            {event && event.lane === lane && (
              <div className="event-properties">
                <div className="inspector-subheading">
                  <h3>Selected element</h3>
                  <span>{event.kind}</span>
                </div>
                {field("Name", "name")}
                {(lane === "text" || event.kind === "Typing") && field("Text", "text")}
                <div className="form-grid">
                  <label className="field-label">
                    X position %
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="100"
                      value={event.x}
                      disabled={locked}
                      onChange={(e) =>
                        update({ x: Math.max(0, Math.min(100, Number(e.target.value))) })
                      }
                    />
                  </label>
                  <label className="field-label">
                    Y position %
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="100"
                      value={event.y}
                      disabled={locked}
                      onChange={(e) =>
                        update({ y: Math.max(0, Math.min(100, Number(e.target.value))) })
                      }
                    />
                  </label>
                </div>
                <label className="field-label">
                  Size · {event.size}%
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={event.size}
                    disabled={locked}
                    onChange={(e) => update({ size: Number(e.target.value) })}
                  />
                </label>
                {lane !== "text" && (
                  <label className="field-label">
                    Intensity · {event.intensity}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={event.intensity}
                      disabled={locked}
                      onChange={(e) => update({ intensity: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label className="field-label">
                  Color
                  <div className="color-swatches">
                    {["purple", "lavender", "green", "coral", "charcoal"].map((c) => (
                      <Button
                        variant="ghost"
                        key={c}
                        disabled={locked}
                        className={`swatch swatch-${c} ${event.color === c ? "swatch-selected" : ""}`}
                        aria-label={`Element ${c}`}
                        onClick={() => update({ color: c })}
                      />
                    ))}
                  </div>
                </label>
                <label className="field-label">
                  Easing
                  <select
                    value={event.easing}
                    disabled={locked}
                    onChange={(e) => update({ easing: e.target.value })}
                  >
                    <option>Ease in out</option>
                    <option>Linear</option>
                    <option>Ease in</option>
                    <option>Ease out</option>
                  </select>
                </label>
                {lane === "effects" && (
                  <label className="field-label">
                    Shape
                    <select
                      value={event.shape}
                      disabled={locked}
                      onChange={(e) => update({ shape: e.target.value })}
                    >
                      <option>Rectangle</option>
                      <option>Circle</option>
                    </select>
                  </label>
                )}
              </div>
            )}
            {tab === "Effects" && (
              <div className="info-note">
                Focus and privacy masks are canvas previews only. Original downloads are not
                redacted. Do not share originals containing sensitive information.
              </div>
            )}
          </>
        )}
        {tab === "Text" && (
          <div className="event-properties">
            <label className="field-label">
              Font family
              <select
                value={draft.font}
                onChange={(e) => change({ ...draft, font: e.target.value })}
              >
                <option>DM Sans</option>
                <option>Arial</option>
                <option>Georgia</option>
              </select>
            </label>
            <label className="field-label">
              Font size · {draft.fontSize}px
              <input
                type="range"
                min="12"
                max="48"
                value={draft.fontSize}
                onChange={(e) => change({ ...draft, fontSize: Number(e.target.value) })}
              />
            </label>
            <label className="field-label">
              Alignment
              <select
                value={draft.align}
                onChange={(e) => change({ ...draft, align: e.target.value })}
              >
                <option>Left</option>
                <option>Center</option>
                <option>Right</option>
              </select>
            </label>
            <Button
              variant="outline"
              onClick={() => {
                change({
                  ...draft,
                  font: brand.font,
                  events: draft.events.map((e) =>
                    e.lane === "text" ? { ...e, color: brand.color } : e,
                  ),
                });
                toast.success("Brand style applied to text");
              }}
            >
              Apply Brand Kit <Check />
            </Button>
          </div>
        )}
        {tab === "Captions" && (
          <>
            <Button variant="outline" onClick={() => add("text", "Caption")}>
              <Plus />
              Add manual caption
            </Button>
            <label className="field-label">
              Caption style
              <select
                value={draft.captionStyle}
                onChange={(e) => change({ ...draft, captionStyle: e.target.value })}
              >
                <option>Classic</option>
                <option>Bold</option>
                <option>Minimal</option>
                <option>Kinetic</option>
              </select>
            </label>
            <div className="transcript-list">
              {draft.events
                .filter((e) => e.lane === "text")
                .map((e) => (
                  <label key={e.id}>
                    <span>
                      {e.start.toFixed(1)} – {(e.start + e.duration).toFixed(1)}s
                    </span>
                    <textarea
                      aria-label={`Caption ${e.name}`}
                      className="form-input"
                      value={e.text}
                      onChange={(ev) =>
                        change({
                          ...draft,
                          events: draft.events.map((v) =>
                            v.id === e.id ? { ...v, text: ev.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
            </div>
            <div className="info-note">
              Automatic transcription and word-synced kinetic captions require AI processing. Manual
              captions and SRT download are available.
            </div>
          </>
        )}
        {tab === "Watermark" && <WatermarkPanel draft={draft} change={change} />}
        {tab === "Audio" && (
          <>
            <label className="file-control">
              <Upload size={15} />
              Upload audio
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) readAudioClip(f, time).then((item) => {
                    change({ ...draft, events: [...draft.events, item] });
                    setSelected(item.id);
                  }).catch((err: Error) => toast.error(err.message));
                }}
              />
            </label>
            {draft.events
              .filter((e) => e.lane === "audio" && e.source)
              .map((e) => (
                <div key={e.id} className="audio-file">
                  <b>{e.name}</b>
                  <audio src={e.source} controls />
                </div>
              ))}
            <label className="field-label">
              Recording volume · {draft.volume}%
              <input
                type="range"
                min="0"
                max="100"
                value={draft.volume}
                onChange={(e) => change({ ...draft, volume: Number(e.target.value) })}
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.muted}
                onChange={(e) => change({ ...draft, muted: e.target.checked })}
              />
              Mute recording
            </label>
            <div className="info-note">
              Uploaded audio can be reviewed independently. Mixing, waveform analysis, noise
              reduction, and AI voice-over are not connected.
            </div>
          </>
        )}
        {tab === "Overlays" && (
          <>
            <label className="field-label">
              CTA label
              <input
                className="form-input"
                value={draft.cta}
                onChange={(e) => change({ ...draft, cta: e.target.value })}
              />
            </label>
            <label className="field-label">
              CTA destination
              <input
                className="form-input"
                type="url"
                value={draft.destination}
                onChange={(e) => change({ ...draft, destination: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="field-label">
              Lead capture gate
              <select
                value={draft.gate}
                onChange={(e) => change({ ...draft, gate: e.target.value })}
              >
                <option>Off</option>
                <option>Soft gate</option>
                <option>Hard gate</option>
              </select>
            </label>
            <div className="inspector-subheading">
              <h3>Branching end cards</h3>
              <span>Final 5 seconds</span>
            </div>
            <label className="field-label">
              First choice
              <input
                className="form-input"
                value={draft.branchOne}
                onChange={(e) => change({ ...draft, branchOne: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="https://…"
                value={draft.branchOneUrl}
                onChange={(e) => change({ ...draft, branchOneUrl: e.target.value })}
              />
            </label>
            <label className="field-label">
              Second choice
              <input
                className="form-input"
                value={draft.branchTwo}
                onChange={(e) => change({ ...draft, branchTwo: e.target.value })}
              />
              <input
                className="form-input"
                placeholder="https://…"
                value={draft.branchTwoUrl}
                onChange={(e) => change({ ...draft, branchTwoUrl: e.target.value })}
              />
            </label>
            <label className="field-label">
              Scheduling link
              <input
                className="form-input"
                placeholder="https://calendly.com/…"
                value={draft.scheduleUrl}
                onChange={(e) => change({ ...draft, scheduleUrl: e.target.value })}
              />
            </label>
            <div className="info-note">
              Links can be tested in Preview. Lead forms are previews only; CRM delivery, scheduling
              embeds, and telemetry are not connected.
            </div>
          </>
        )}
        {tab === "Localization" && (
          <>
            <span className="tool-section-icon">
              <Languages size={32} />
            </span>
            <h3>Bring your story to more people.</h3>
            <label className="field-label">
              Target language
              <select
                value={draft.language}
                onChange={(e) => change({ ...draft, language: e.target.value })}
              >
                <option>English</option>
                <option>Hindi</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
                <option>Japanese</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" />I have authorization to use the speaker’s voice.
            </label>
            <Button variant="outline" disabled>
              Translate & dub · Planned
            </Button>
            <div className="info-note">
              Dubbing, voice cloning, pacing alignment, and translated caption timestamps need a
              connected provider and verified speaker consent.
            </div>
          </>
        )}
        {tab === "AI Assistant" && (
          <>
            <div className="assistant-welcome">
              <Sparkles size={30} />
              <h3>A creative helping hand.</h3>
              <p>
                Keep the creative decisions. Let automation handle the repetitive work, when
                connected.
              </p>
            </div>
            {[
              "Generate script",
              "Suggest scenes & titles",
              "Find best moments",
              "Auto captions",
              "Suggest zoom & focus",
              "Track active speaker",
              "Remove silence",
              "Reframe vertical shorts",
            ].map((s) => (
              <div className="planned-tool" key={s}>
                <span>{s}</span>
                <span className="sample-label">Planned</span>
              </div>
            ))}
            <div className="info-note">
              No AI jobs are running. All edits in this workspace are manual and session-only.
            </div>
          </>
        )}
        {tab === "Media" && (
          <>
            <label className="file-control">
              <Upload size={15} />
              {addingVideo ? "Adding video…" : "Add video"}
              <input
                type="file"
                accept="video/*"
                disabled={addingVideo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAddVideo(f);
                  e.target.value = "";
                }}
              />
            </label>
            {draft.events
              .filter((e) => e.lane === "video")
              .map((e) => (
                <Button
                  key={e.id}
                  variant={selected === e.id ? "secondary" : "outline"}
                  className="media-library-item"
                  onClick={() => setSelected(e.id)}
                >
                  <span>▣</span>
                  <span>
                    {e.name}
                    <small>
                      {e.duration.toFixed(1)}s · {e.source ? "Local recording" : "Sample screen"}
                    </small>
                  </span>
                </Button>
              ))}
            {event?.lane === "video" && (
              <>
                {field("Clip name", "name")}
                <label className="file-control">
                  <Upload size={14} />
                  Replace selected clip
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        update({ source: URL.createObjectURL(f), name: f.name, sourceOffset: 0 });
                    }}
                  />
                </label>
              </>
            )}
            <div className="info-note">
              Original files stay unchanged. Timeline edits are saved as draft instructions, not
              rendered video.
            </div>
          </>
        )}
      </div>
      <footer>
        <span className="live-dot" /> Saved in this session
      </footer>
    </aside>
  );
}
