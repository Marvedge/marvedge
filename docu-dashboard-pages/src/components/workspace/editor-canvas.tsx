import { useEffect, useRef } from "react";
import { type EditorDraft, transitionPresets, playbackSpeedOf, timelineDuration } from "@/lib/editor-model";
import { type Project } from "@/lib/workspace";
import { ProjectThumbnail } from "./project-thumbnail";
import { WatermarkLayer } from "./watermark-panel";
export function EditorCanvas({
  project,
  draft,
  time,
  playing,
  onTime,
  onEnd,
  onSelect,
}: {
  project: Project;
  draft: EditorDraft;
  time: number;
  playing: boolean;
  onTime?: (t: number) => void;
  onEnd?: () => void;
  onSelect?: (id: string) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const timeRef = useRef(time);
  const onTimeRef = useRef(onTime);
  const onEndRef = useRef(onEnd);
  timeRef.current = time;
  onTimeRef.current = onTime;
  onEndRef.current = onEnd;
  const speed = playbackSpeedOf(draft);
  const duration = timelineDuration(draft.events);
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(duration, timeRef.current + (now - previous) / 1000 * speed);
      previous = now;
      timeRef.current = next;
      onTimeRef.current?.(next);
      if (next >= duration) { onEndRef.current?.(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, speed]);
  const active = draft.events.filter(
    (e) => time >= e.start && time < e.start + e.duration && !draft.hidden.includes(e.lane),
  );
  const clip = active.find((e) => e.lane === "video");
  const source = clip ? (clip.source || (project.source?.startsWith("blob:") ? project.source : undefined)) : undefined;
  const camera = active.find((e) => e.lane === "camera");
  const effect = active.find((e) => e.lane === "effects" && !transitionPresets.includes(e.kind));
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = draft.volume / 100;
    element.muted = draft.muted;
    element.playbackRate = speed;
    if (playing) {
      element.play().catch(() => onEnd?.());
    } else element.pause();
  }, [playing, draft.volume, draft.muted, source, speed]);
  useEffect(() => {
    const element = video.current;
    if (!element || !clip) return;
    const target = Math.max(0, time - clip.start + (clip.sourceOffset || 0));
    if (Math.abs(element.currentTime - target) > 0.5) element.currentTime = target;
  }, [time, clip]);
  const style = {
    "--canvas-padding": `${draft.padding}px`,
    "--focus-x": `${effect?.x || 50}%`,
    "--focus-y": `${effect?.y || 50}%`,
    "--focus-size": `${effect?.size || 40}%`,
    "--camera-scale":
      camera?.kind === "Zoom out" ? ".85" : String(1 + (camera?.intensity || 0) / 100),
    "--camera-x": `${camera ? (50 - camera.x) / 2 : 0}%`,
    "--camera-y": `${camera ? (50 - camera.y) / 2 : 0}%`,
    "--canvas-font-size": `${draft.fontSize}px`,
    "--canvas-text-size": `${draft.fontSize / 8}cqw`,
  };
  return (
    <div
      className={`studio-canvas ratio-${draft.ratio.replace(":", "-")} canvas-bg-${draft.background} canvas-frame-${draft.frame.toLowerCase()} ${draft.shadow ? "with-shadow" : ""} ${draft.border ? "with-border" : ""} canvas-font-${draft.font === "Georgia" ? "serif" : draft.font === "Arial" ? "arial" : "sans"}`}
      style={style as React.CSSProperties}
    >
      {draft.backgroundImage && (
        <img
          src={draft.backgroundImage}
          alt="Canvas background"
          className="canvas-background-image"
        />
      )}
      <div className={`studio-browser ${camera ? "camera-active" : ""}`}>
        <div className="studio-browser-bar">
          <span>
            <i />
            <i />
            <i />
          </span>
          <span>
            {source
              ? "Your recording"
              : project.sourceMethod === "url"
                ? project.sourceName
                : "acme.app / overview"}
          </span>
          <span>↗</span>
        </div>
        <div className="studio-screen">
          {source ? (
            <video
              ref={video}
              src={source}
              playsInline
              onLoadedMetadata={(e) => { e.currentTarget.currentTime = Math.max(0, time - (clip?.start ?? 0) + (clip?.sourceOffset ?? 0)); }}
              onError={() => onEnd?.()}
            />
          ) : (
            <ProjectThumbnail type={project.thumbnail} large />
          )}
          {!source && <span className="canvas-sample-badge">Sample screen</span>}
          {effect && (
            <div
              className={`canvas-focus effect-${effect.kind.toLowerCase().replaceAll(" ", "-")} focus-${effect.shape.toLowerCase()}`}
              style={{ "--effect-intensity": effect.intensity / 100 } as React.CSSProperties}
              onClick={() => onSelect?.(effect.id)}
            >
              <span />
            </div>
          )}
          {active
            .filter((e) => e.lane === "interactions")
            .map((e) => (
              <span
                key={e.id}
                className={`interaction-cue cue-${e.kind.toLowerCase().replaceAll(" ", "-")}`}
                style={{ left: `${e.x}%`, top: `${e.y}%` } as React.CSSProperties}
              >
                {e.kind === "Typing"
                  ? "Typing…"
                  : e.kind === "Scroll"
                    ? "↓"
                    : e.kind === "Pause / wait"
                      ? "Ⅱ"
                      : "↖"}
              </span>
            ))}
          <WatermarkLayer draft={draft} />
        </div>
      </div>
      {active
        .filter((e) => e.lane === "text")
        .map((e) => (
          <div
            key={e.id}
            className={`studio-text text-kind-${e.kind.toLowerCase().replaceAll(" ", "-")} text-color-${e.color} text-align-${draft.align.toLowerCase()} caption-${draft.captionStyle.toLowerCase()}`}
            style={
              {
                left: `${e.x}%`,
                top: `${e.y}%`,
                maxWidth: `${Math.min(90, e.size + 35)}%`,
              } as React.CSSProperties
            }
            onClick={() => onSelect?.(e.id)}
          >
            {e.kind === "Arrow"
              ? "→"
              : e.kind === "Numbered step"
                ? "1"
                : e.kind === "Circle"
                  ? "◯"
                  : e.kind === "Rectangle"
                    ? "□"
                    : e.text || e.name}
          </div>
        ))}
    </div>
  );
}
