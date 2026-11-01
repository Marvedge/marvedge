import { useState } from "react";
import { Search, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  transitionGroups,
  clipJunctions,
  addTransitionAt,
  isTransitionEvent,
  formatTime,
  type EditorDraft,
} from "@/lib/editor-model";
import { toast } from "sonner";

function slug(preset: string) {
  return preset.toLowerCase().replaceAll(" ", "-");
}

/** Animated thumbnail showing how the transition moves between two scenes. */
function TransitionThumb({ preset }: { preset: string }) {
  return (
    <span className={`tp-thumb tp-${slug(preset)}`} aria-hidden="true">
      <span className="tp-scene tp-scene-a" />
      <span className="tp-scene tp-scene-b" />
      <span className="tp-wipe" />
    </span>
  );
}

export function TransitionPicker({
  draft,
  change,
  selected,
  setSelected,
  time,
}: {
  draft: EditorDraft;
  change: (d: EditorDraft) => void;
  selected: string;
  setSelected: (s: string) => void;
  time: number;
}) {
  const [search, setSearch] = useState("");
  const junctions = clipJunctions(draft.events);
  const selectedEvent = draft.events.find((e) => e.id === selected);
  const selectedTransition = selectedEvent && isTransitionEvent(selectedEvent) ? selectedEvent : undefined;

  /** Best junction for a new transition: one covering the playhead, else the nearest. */
  function targetJunction() {
    if (!junctions.length) return undefined;
    return (
      junctions.find((j) => Math.abs(j.at - time) < 1.5) ??
      junctions.reduce((a, b) => (Math.abs(a.at - time) < Math.abs(b.at - time) ? a : b))
    );
  }

  function apply(preset: string) {
    const junction = targetJunction();
    const at = junction ? junction.at : time;
    const events = addTransitionAt(draft.events, preset, at);
    const added = events.find((e) => isTransitionEvent(e) && e.kind === preset && Math.abs(e.start + e.duration / 2 - at) < 0.01);
    change({ ...draft, events });
    if (added) setSelected(added.id);
    toast.success(
      junction
        ? `${preset} added between “${junction.before.name}” and “${junction.after.name}”`
        : `${preset} added at ${formatTime(at)}`,
    );
  }

  function updateSelected(patch: Partial<NonNullable<typeof selectedTransition>>) {
    if (!selectedTransition) return;
    change({
      ...draft,
      events: draft.events.map((e) => (e.id === selectedTransition.id ? { ...e, ...patch } : e)),
    });
  }

  const query = search.trim().toLowerCase();
  const groups = transitionGroups
    .map((g) => ({ ...g, presets: g.presets.filter((p) => p.toLowerCase().includes(query)) }))
    .filter((g) => g.presets.length);

  return (
    <div className="transition-picker">
      <label className="search-field">
        <Search size={14} />
        <input
          aria-label="Search transitions"
          placeholder="Search transitions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {junctions.length > 0 && (
        <div className="junction-list">
          <span className="field-hint">Clip joins in this video</span>
          {junctions.map((j) => (
            <div className="junction-row" key={j.at}>
              <span className="junction-time"><Clock size={12} />{formatTime(j.at)}</span>
              <span className="junction-clips">{j.before.name} → {j.after.name}</span>
              {j.transition ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(j.transition!.id)}
                  aria-label={`Edit ${j.transition.kind} transition at ${formatTime(j.at)}`}
                >
                  {j.transition.kind}
                </Button>
              ) : (
                <span className="junction-none">None</span>
              )}
            </div>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.name} className="transition-group">
          <h3>{g.name}</h3>
          <div className="transition-grid">
            {g.presets.map((p) => {
              const active = selectedTransition?.kind === p;
              return (
                <Button
                  variant="outline"
                  key={p}
                  className={`transition-card ${active ? "transition-active" : ""}`}
                  onClick={() => apply(p)}
                  aria-label={`Apply ${p} transition`}
                >
                  <TransitionThumb preset={p} />
                  <span className="transition-name">{p}</span>
                  {active && <Check size={14} className="transition-check" />}
                </Button>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="field-hint">No transitions match “{search}”.</p>}

      {selectedTransition && (
        <div className="event-properties">
          <div className="inspector-subheading">
            <h3>Selected transition</h3>
            <span>{selectedTransition.kind}</span>
          </div>
          <label className="field-label">
            Duration · {selectedTransition.duration.toFixed(1)}s
            <input
              type="range"
              min="0.3"
              max="3"
              step="0.1"
              value={selectedTransition.duration}
              onChange={(e) => updateSelected({ duration: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            Easing
            <select
              value={selectedTransition.easing}
              onChange={(e) => updateSelected({ easing: e.target.value })}
            >
              <option>Ease in out</option>
              <option>Linear</option>
              <option>Ease in</option>
              <option>Ease out</option>
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              change({ ...draft, events: draft.events.filter((e) => e.id !== selectedTransition.id) });
              setSelected("");
              toast.success("Transition removed");
            }}
          >
            Remove transition
          </Button>
        </div>
      )}

      <div className="info-note">
        Transitions are placed where two clips meet and saved in your draft. Full motion rendering
        is not connected yet.
      </div>
    </div>
  );
}
