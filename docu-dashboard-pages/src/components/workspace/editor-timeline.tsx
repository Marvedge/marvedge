import { useEffect, useRef, useState } from "react";
import { Plus, Minus, Magnet, Scissors, Copy, Clipboard, Trash2, Lock, Unlock, Eye, EyeOff, MoreHorizontal, PanelBottomClose, PanelBottomOpen, Film, Layers, SlidersHorizontal, Music, Type, Camera, Wand2, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { readAudioClip } from "@/lib/editor-media";
import { toast } from "sonner";
import { lanes, type EditorDraft, type EditorEvent, timelineDuration, formatTime, splitEvent, timelineRows, clipJunctions, isTransitionEvent, trimEvent, waveformSlice } from "@/lib/editor-model";

export function EditorTimeline({ draft, change, selected, setSelected, time, setTime, onAddVideo, addingVideo, onAddTransition, onJunctionClick, onEventProperties, onTrimPreview, onTrimCommit }: {
  draft: EditorDraft; change: (d: EditorDraft) => void; selected: string; setSelected: (s: string) => void;
  time: number; setTime: (t: number) => void; onAddVideo: (file: File) => void; addingVideo: boolean; onAddTransition: () => void; onJunctionClick?: (at: number) => void; onEventProperties?: () => void;
  onTrimPreview: (draft: EditorDraft) => void; onTrimCommit: (before: EditorDraft, after: EditorDraft) => void;
}) {
  const upload = useRef<HTMLInputElement | null>(null);
  const audioUpload = useRef<HTMLInputElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [minimized, setMinimized] = useState(false);
  const [snap, setSnap] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const [timing, setTiming] = useState(false);
  const [clipboard, setClipboard] = useState<EditorEvent | null>(null);
  const [trimming, setTrimming] = useState<string | null>(null);
  const trimExtent = useRef(0);
  const trimCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => trimCleanup.current?.(), []);
  const duration = timelineDuration(draft.events);
  const extent = trimming ? trimExtent.current : duration + Math.max(5, duration * .2);
  const event = draft.events.find((e) => e.id === selected);
  const disabled = !event || draft.locked.includes(event.lane);
  const isTransition = isTransitionEvent;
  const junctions = clipJunctions(draft.events);
  const tracks = [
    { id: "video", lane: "video" as const, name: "Videos", events: draft.events.filter((e) => e.lane === "video") },
    { id: "transitions", lane: "effects" as const, name: "Transitions", events: draft.events.filter(isTransition) },
    ...lanes.filter((l) => l.id !== "video").map((l) => ({ id: l.id, lane: l.id, name: l.name, events: draft.events.filter((e) => e.lane === l.id && !isTransition(e)) })),
  ].filter((t) => t.id === "video" || t.id === "transitions" || t.events.length || showEmpty);
  const laneIcon = { video: Film, transitions: Layers, audio: Music, text: Type, camera: Camera, effects: Wand2, interactions: MousePointer2 } as Record<string, typeof Film>;
  function duplicate(item: EditorEvent) {
    const next = { ...item, id: crypto.randomUUID(), name: `${item.name} (copy)`, start: item.start + item.duration };
    change({ ...draft, events: [...draft.events, next] }); setSelected(next.id);
  }
  return (
    <section className={`studio-timeline ${minimized ? "timeline-minimized" : ""}`} aria-label="Video timeline">
      <input ref={upload} type="file" accept="video/*" hidden aria-label="Add video file" disabled={addingVideo} onChange={(e) => { const file = e.target.files?.[0]; if (file) onAddVideo(file); e.target.value = ""; }} />
      <input ref={audioUpload} type="file" accept="audio/*" hidden aria-label="Add audio file" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; readAudioClip(file, time).then((item) => { change({ ...draft, events: [...draft.events, item] }); setSelected(item.id); toast.success("Audio added to the timeline"); }).catch((err: Error) => toast.error(err.message)); }} />
      <header>
        <div>
          <Button variant="ghost" size="icon" title={minimized ? "Expand timeline" : "Collapse timeline"} aria-label={minimized ? "Expand timeline" : "Collapse timeline"} aria-expanded={!minimized} onClick={() => setMinimized(!minimized)}>{minimized ? <PanelBottomOpen /> : <PanelBottomClose />}</Button>
          <h2>Timeline</h2><span>{formatTime(duration)}</span>
        </div>
        <div className="sequence-add-actions">
          <Button size="sm" onClick={() => upload.current?.click()} disabled={addingVideo}><Plus /><span>{addingVideo ? "Adding…" : "Add video"}</span></Button>
          <Button size="sm" variant="outline" onClick={() => audioUpload.current?.click()}><Music /><span>Audio</span></Button>
          <Button size="sm" variant="outline" onClick={onAddTransition}><Layers /><span>Transition</span></Button>
        </div>
        <div className="timeline-tools">
          <Button variant="ghost" size="icon" title="Split at playhead" aria-label="Split at playhead" disabled={disabled || !event || time <= event.start || time >= event.start + event.duration} onClick={() => change({ ...draft, events: splitEvent(draft.events, selected, time) })}><Scissors /></Button>
          <Button variant="ghost" size="icon" title="Delete element" aria-label="Delete element" disabled={disabled} onClick={() => { change({ ...draft, events: draft.events.filter((e) => e.id !== selected) }); setSelected(""); }}><Trash2 /></Button>
          <span className="toolbar-divider" />
          <Button variant="ghost" size="icon" title="Zoom out timeline" aria-label="Zoom out timeline" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - .5))}><Minus /></Button>
          <Button variant="ghost" size="icon" title="Zoom in timeline" aria-label="Zoom in timeline" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + .5))}><Plus /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" title="Timeline options" aria-label="Timeline options"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={disabled} onSelect={() => { if (event) duplicate(event); }}><Copy />Duplicate element</DropdownMenuItem>
              <DropdownMenuItem disabled={!event} onSelect={() => { if (event) setClipboard(event); }}><Clipboard />Copy element</DropdownMenuItem>
              <DropdownMenuItem disabled={!clipboard || (clipboard ? draft.locked.includes(clipboard.lane) : false)} onSelect={() => { if (clipboard) { const next = { ...clipboard, id: crypto.randomUUID(), start: time }; change({ ...draft, events: [...draft.events, next] }); setSelected(next.id); } }}><Plus />Paste element</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={snap} onCheckedChange={setSnap}><Magnet />Snapping</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showEmpty} onCheckedChange={setShowEmpty}>Show empty tracks</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={timing} onCheckedChange={setTiming}><SlidersHorizontal />Precise timing</DropdownMenuCheckboxItem>
              <DropdownMenuItem onSelect={() => setZoom(1)}>Fit timeline</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="timeline-scroll">
        <div className="timeline-content" style={{ "--sequence-zoom": zoom } as React.CSSProperties}>
          <div className="time-ruler"><div className="ruler-label">{tracks[0]?.events.length ?? 0} clips</div><div className="ruler-times" onClick={(e) => { const bounds = e.currentTarget.getBoundingClientRect(); setTime(Math.min(duration, Math.max(0, (e.clientX - bounds.left) / bounds.width * extent))); }}>{[0, .25, .5, .75, 1].map((r) => <span key={r}>{formatTime(extent * r)}</span>)}</div></div>
          {tracks.map((track) => {
            const rows = timelineRows(track.events);
            return <div className={`studio-track track-${track.id} ${draft.hidden.includes(track.lane) ? "track-hidden" : ""}`} key={track.id} style={{ "--sequence-row-height": `${track.id === "video" ? 76 : track.id === "audio" ? 60 : 46}px`, "--sequence-rows": Math.max(1, rows.length) } as React.CSSProperties}>
              <div className="track-label">
                <span>{(() => { const I = laneIcon[track.id]; return I ? <I /> : null; })()}{track.name}</span>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${track.name} track options`} title={`${track.name} track options`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => change({ ...draft, locked: draft.locked.includes(track.lane) ? draft.locked.filter((v) => v !== track.lane) : [...draft.locked, track.lane] })}>{draft.locked.includes(track.lane) ? <Unlock /> : <Lock />}{draft.locked.includes(track.lane) ? "Unlock" : "Lock"} track</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => change({ ...draft, hidden: draft.hidden.includes(track.lane) ? draft.hidden.filter((v) => v !== track.lane) : [...draft.hidden, track.lane] })}>{draft.hidden.includes(track.lane) ? <EyeOff /> : <Eye />}{draft.hidden.includes(track.lane) ? "Show" : "Hide"} track</DropdownMenuItem>
                </DropdownMenuContent></DropdownMenu>
              </div>
              <div className="track-lane" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
                const item = draft.events.find((v) => v.id === e.dataTransfer.getData("text/plain"));
                if (!item || !track.events.some((v) => v.id === item.id) || draft.locked.includes(track.lane)) return;
                const bounds = e.currentTarget.getBoundingClientRect(); let start = Math.max(0, (e.clientX - bounds.left) / bounds.width * extent); if (snap) start = Math.round(start);
                change({ ...draft, events: draft.events.map((v) => v.id === item.id ? { ...v, start } : v) });
              }}>
                {rows.flatMap((items, row) => items.map((item) => {
                  const locked = draft.locked.includes(track.lane);
                  const startTrim = (edge: "start" | "end") => (e: React.PointerEvent<HTMLSpanElement>) => {
                    if (locked || e.button !== 0) return;
                    e.preventDefault(); e.stopPropagation();
                    trimCleanup.current?.();
                    trimExtent.current = extent;
                    setTrimming(item.id);
                    suppressClick.current = true;
                    setTime(Math.min(time, duration));
                    const laneEl = (e.currentTarget.closest(".track-lane") as HTMLElement | null);
                    const width = laneEl?.getBoundingClientRect().width || 1;
                    const origin = e.clientX;
                    const base = edge === "start" ? item.start : item.start + item.duration;
                    let next = draft;
                    const move = (ev: PointerEvent) => {
                      if (ev.pointerId !== e.pointerId) return;
                      let to = base + (ev.clientX - origin) / width * extent;
                      if (snap) to = Math.round(to * 10) / 10;
                      next = { ...draft, events: trimEvent(draft.events, item.id, edge, Math.max(0, to)) };
                      onTrimPreview(next);
                    };
                    const cleanup = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                      window.removeEventListener("pointercancel", cancel);
                      trimCleanup.current = null;
                    };
                    const up = (ev: PointerEvent) => {
                      if (ev.pointerId !== e.pointerId) return;
                      move(ev); cleanup(); setTrimming(null);
                      onTrimCommit(draft, next);
                      window.setTimeout(() => { suppressClick.current = false; }, 0);
                    };
                    const cancel = () => { cleanup(); setTrimming(null); onTrimPreview(draft); suppressClick.current = false; };
                    trimCleanup.current = cleanup;
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                    window.addEventListener("pointercancel", cancel);
                  };
                  const remove = () => { change({ ...draft, events: draft.events.filter((e) => e.id !== item.id) }); if (selected === item.id) setSelected(""); };
                  return (
                    <ContextMenu key={item.id}>
                      <ContextMenuTrigger asChild>
                        <Button variant="ghost" draggable={!locked && !trimming} onDragStart={(e) => { if (suppressClick.current) { e.preventDefault(); return; } e.dataTransfer.setData("text/plain", item.id); }} className={`timeline-event seg-${track.id} ${selected === item.id ? "event-selected" : ""} ${trimming === item.id ? "event-trimming" : ""}`} style={{ left: `${item.start / extent * 100}%`, width: `${item.duration / extent * 100}%`, "--sequence-row": row } as React.CSSProperties} onClick={() => { if (suppressClick.current) return; setSelected(item.id); setTime(item.start); }} title={`${item.name} · ${formatTime(item.start)} – ${formatTime(item.start + item.duration)}`}>
                          <span className="trim-handle trim-start" role="slider" aria-label={`Trim ${item.name} start`} aria-valuemin={0} aria-valuemax={item.start + item.duration} aria-valuenow={item.start} aria-disabled={locked} onPointerDown={startTrim("start")} />
                          <span>{(() => { const I = laneIcon[track.id]; return I ? <I size={13} /> : null; })()}{item.name}</span>
                          <small>{formatTime(item.duration)}</small>
                          {track.id === "audio" && <svg className="seg-wave" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">{waveformSlice(item, Math.min(240, Math.max(12, item.duration * 6 * zoom))).map((v, i, arr) => { const w = 100 / arr.length; const h = Math.max(1, v * 18); return <rect key={i} x={i * w + w * .15} width={w * .7} y={10 - h / 2} height={h} rx={.4} />; })}</svg>}
                          <span className="trim-handle trim-end" role="slider" aria-label={`Trim ${item.name} end`} aria-valuemin={item.start} aria-valuemax={extent} aria-valuenow={item.start + item.duration} aria-disabled={locked} onPointerDown={startTrim("end")} />
                        </Button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => { setSelected(item.id); onEventProperties?.(); }}><SlidersHorizontal />Segment properties</ContextMenuItem>
                        <ContextMenuItem disabled={locked || time <= item.start || time >= item.start + item.duration} onSelect={() => { setSelected(item.id); change({ ...draft, events: splitEvent(draft.events, item.id, time) }); }}><Scissors />Split at playhead</ContextMenuItem>
                        <ContextMenuItem disabled={locked} onSelect={() => duplicate(item)}><Copy />Duplicate</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem disabled={locked} className="text-destructive" onSelect={remove}><Trash2 />Delete segment</ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                }))}
                {track.id === "video" && junctions.map((j) => (
                  <Button
                    variant="ghost"
                    key={j.at}
                    className={`junction-marker ${j.transition ? "junction-set" : ""}`}
                    style={{ left: `${j.at / extent * 100}%` } as React.CSSProperties}
                    aria-label={j.transition ? `Edit ${j.transition.kind} transition at ${formatTime(j.at)}` : `Add transition at ${formatTime(j.at)}`}
                    title={j.transition ? `${j.transition.kind} · click to change` : "Add transition here"}
                    onClick={() => { setTime(j.at); if (j.transition) setSelected(j.transition.id); onJunctionClick?.(j.at); }}
                  >
                    <Layers size={11} />
                  </Button>
                ))}
                {track.id === "video" && <Button variant="ghost" className="sequence-append" aria-label="Append video" title="Add another video" disabled={addingVideo} style={{ left: `${Math.max(0, ...track.events.map((e) => e.start + e.duration)) / extent * 100}%` } as React.CSSProperties} onClick={() => upload.current?.click()}><Plus /><span>Add video</span></Button>}
                {track.id === "transitions" && !track.events.length && <Button variant="ghost" className="sequence-empty-transition" onClick={onAddTransition}><Plus size={14} />Add transition</Button>}
                <span className="timeline-playhead" style={{ left: `${time / extent * 100}%` } as React.CSSProperties} />
              </div>
            </div>;
          })}
        </div>
      </div>
      {timing && event && <div className="precision-bar"><span>{event.name}</span>{(["start", "duration"] as const).map((key) => <label key={key}>{key === "start" ? "Start" : "Duration"}<input type="number" min={key === "start" ? 0 : .1} step=".1" aria-label={`Element ${key}`} value={event[key]} disabled={disabled} onChange={(e) => change({ ...draft, events: draft.events.map((v) => v.id === event.id ? { ...v, [key]: Math.max(key === "start" ? 0 : .1, Number(e.target.value)) } : v) })} /></label>)}<span className="timing-note">Seconds</span></div>}
    </section>
  );
}
