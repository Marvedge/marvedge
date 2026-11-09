import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace, type BrandComponent } from "@/lib/workspace";

const kinds: BrandComponent["kind"][] = ["Call to action", "Lower third", "Intro card", "Outro card", "Watermark"];

export function BrandComponents() {
  const { brandComponents, setBrandComponents } = useWorkspace();
  const [kind, setKind] = useState<BrandComponent["kind"]>("Call to action");
  const [text, setText] = useState("");
  return (
    <section className="form-section brand-components">
      <h2>Saved components</h2>
      <p className="text-sm text-muted-foreground">Reusable pieces in your brand style — ready for any project.</p>
      <form
        className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setBrandComponents((prev) => [...prev, { id: crypto.randomUUID(), kind, text: t.slice(0, 80) }]);
          setText("");
        }}
      >
        <select aria-label="Component type" className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" value={kind} onChange={(e) => setKind(e.target.value as BrandComponent["kind"])}>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        <Input placeholder="Text, e.g. Start free trial" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit"><Plus />Save</Button>
      </form>
      <div className="brand-component-grid">
        {brandComponents.map((c) => (
          <div key={c.id} className="brand-component-card">
            <span className="tiny-label">{c.kind.toUpperCase()}</span>
            <div className={`brand-component-sample sample-${c.kind.split(" ")[0]!.toLowerCase()}`}>{c.text}</div>
            <Button size="icon" variant="ghost" aria-label={`Remove ${c.text}`} onClick={() => setBrandComponents((prev) => prev.filter((x) => x.id !== c.id))}><X /></Button>
          </div>
        ))}
        {!brandComponents.length && <p className="text-sm text-muted-foreground">No saved components yet.</p>}
      </div>
    </section>
  );
}
