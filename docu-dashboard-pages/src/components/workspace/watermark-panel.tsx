import { Upload } from "lucide-react";
import {
  type EditorDraft,
  type Watermark,
  watermarkOf,
  watermarkPlacement,
  watermarkPositions,
  watermarkShapes,
} from "@/lib/editor-model";

export function WatermarkPanel({
  draft,
  change,
}: {
  draft: EditorDraft;
  change: (d: EditorDraft) => void;
}) {
  const w = watermarkOf(draft);
  const set = (patch: Partial<Watermark>) => change({ ...draft, watermark: { ...w, ...patch } });
  return (
    <>
      <label className="checkbox-field">
        <input type="checkbox" checked={w.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Show watermark
      </label>
      <div className="wm-segment" role="group" aria-label="Watermark type">
        {(["Text", "Logo"] as const).map((t) => (
          <button key={t} type="button" className={w.type === t ? "active" : ""} onClick={() => set({ type: t, enabled: true })}>
            {t}
          </button>
        ))}
      </div>
      {w.type === "Text" ? (
        <label className="field-label">
          Watermark text
          <input value={w.text} maxLength={40} onChange={(e) => set({ text: e.target.value })} />
        </label>
      ) : (
        <label className="file-control">
          <Upload size={15} />
          {w.image ? "Replace logo" : "Upload logo"}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) set({ image: URL.createObjectURL(f), enabled: true });
            }}
          />
        </label>
      )}
      <div className="field-label">
        Shape
        <div className="wm-shapes">
          {watermarkShapes.map((s) => (
            <button
              key={s}
              type="button"
              title={s}
              aria-pressed={w.shape === s}
              className={w.shape === s ? "active" : ""}
              onClick={() => set({ shape: s, enabled: true })}
            >
              <i className={`wm-shape-icon wm-shape-${s.toLowerCase()}`} />
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field-label">
        Position
        <div className="wm-positions">
          {watermarkPositions.map((p) => (
            <button
              key={p}
              type="button"
              title={p}
              aria-label={p}
              aria-pressed={w.position === p}
              className={w.position === p ? "active" : ""}
              onClick={() => set({ position: p, enabled: true })}
            >
              <i />
            </button>
          ))}
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={w.position === "Tiled"}
            onChange={(e) => set({ position: e.target.checked ? "Tiled" : "Bottom right", enabled: true })}
          />
          Repeat across the whole video (tiled)
        </label>
      </div>
      <label className="field-label">
        Color
        <select value={w.color} onChange={(e) => set({ color: e.target.value as Watermark["color"] })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="brand">Brand purple</option>
        </select>
      </label>
      {(
        [
          ["Opacity", "opacity", 10, 100, "%"],
          ["Size", "size", 6, 40, "%"],
          ["Rotation", "rotation", -45, 45, "°"],
          ["Edge spacing", "margin", 0, 15, "%"],
        ] as const
      ).map(([label, key, min, max, unit]) => (
        <label key={key} className="field-label">
          {label} · {w[key]}
          {unit}
          <input type="range" min={min} max={max} value={w[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} />
        </label>
      ))}
      <div className="info-note">The watermark shows in the preview and is saved with your draft.</div>
    </>
  );
}

export function WatermarkLayer({ draft }: { draft: EditorDraft }) {
  const w = watermarkOf(draft);
  if (!w.enabled || (w.type === "Logo" && !w.image) || (w.type === "Text" && !w.text.trim())) return null;
  const mark = (
    <span className={`wm-mark wm-${w.shape.toLowerCase()} wm-color-${w.color}`}>
      {w.type === "Logo" ? <img src={w.image} alt="Watermark logo" /> : w.text}
    </span>
  );
  const p = watermarkPlacement(w.position, w.margin);
  const style = {
    "--wm-opacity": w.opacity / 100,
    "--wm-size": `${w.size}cqw`,
    "--wm-rotate": `${w.rotation}deg`,
  } as React.CSSProperties;
  if (w.position === "Tiled")
    return (
      <div className="wm-layer wm-tiled" style={style} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i}>{mark}</span>
        ))}
      </div>
    );
  return (
    <div className="wm-layer" style={style}>
      <div
        className="wm-anchor"
        style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(${p.tx}%, ${p.ty}%)` }}
      >
        {mark}
      </div>
    </div>
  );
}
