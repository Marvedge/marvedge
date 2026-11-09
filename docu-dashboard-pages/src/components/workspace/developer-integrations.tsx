import { useState } from "react";
import { toast } from "sonner";
import { Webhook, KeyRound, Bot, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const events = ["lead.captured", "demo.viewed", "demo.completed", "cta.clicked", "project.published"];

export function DeveloperIntegrations() {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(["lead.captured"]);
  const [saved, setSaved] = useState("");
  const payload = JSON.stringify(
    { event: picked[0] ?? "lead.captured", demo: { id: "product-tour", name: "Product onboarding tour" }, lead: { name: "Jane Doe", email: "jane@acme.com", company: "Acme" }, occurredAt: "2026-11-01T10:00:00Z" },
    null,
    2,
  );
  return (
    <div className="dev-integrations">
      <section className="form-section">
        <h2><Webhook size={16} className="inline mr-1" />Webhook</h2>
        <p className="text-sm text-muted-foreground">Send events like captured leads to your own tools.</p>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          try { if (new URL(url).protocol !== "https:") throw new Error(); } catch { toast.error("Enter a full https:// URL."); return; }
          if (!picked.length) { toast.error("Pick at least one event."); return; }
          setSaved(url);
          toast.success("Webhook plan saved for this session");
        }}>
          <Input placeholder="https://hooks.yourapp.com/marvedge" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit">Save</Button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm">
          {events.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5">
              <input type="checkbox" checked={picked.includes(ev)} onChange={(e) => setPicked(e.target.checked ? [...picked, ev] : picked.filter((x) => x !== ev))} />
              <code>{ev}</code>
            </label>
          ))}
        </div>
        {saved && <p className="text-xs text-muted-foreground">Planned destination: {saved}. Events aren't sent yet.</p>}
        <div>
          <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Example payload</span>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(payload); toast.success("Copied"); }}><Copy />Copy</Button></div>
          <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{payload}</pre>
        </div>
      </section>
      <section className="form-section">
        <h2><KeyRound size={16} className="inline mr-1" />API access</h2>
        <p className="text-sm text-muted-foreground">Create and manage demos from your own code. API keys will be issued here once the public API launches.</p>
        <Button variant="outline" disabled>Generate API key · coming soon</Button>
        <h2 className="mt-4"><Bot size={16} className="inline mr-1" />MCP server</h2>
        <p className="text-sm text-muted-foreground">Let AI assistants like Claude or ChatGPT read your projects and draft demos through Marvedge's MCP server.</p>
        <Button variant="outline" disabled>Connect an assistant · coming soon</Button>
      </section>
    </div>
  );
}
