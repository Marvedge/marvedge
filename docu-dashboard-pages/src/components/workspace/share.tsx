import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Link2, Code2, ClipboardList, LayoutGrid, Users, Copy, Plus, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/lib/workspace";

const card = "rounded-xl border border-border bg-card p-5 space-y-4 text-card-foreground";
const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
function copy(t: string) { navigator.clipboard.writeText(t); toast.success("Copied"); }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>;
}

export function SharePage() {
  const { projects } = useWorkspace();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [access, setAccess] = useState("Anyone with the link");
  const [width, setWidth] = useState("100%");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = projectId ? `${origin}/preview/${projectId}` : "";
  const embed = `<iframe src="${link}" width="${width}" style="aspect-ratio:16/9;border:0" allowfullscreen></iframe>`;

  const [fields, setFields] = useState(["Name", "Work email", "Company"]);
  const [newField, setNewField] = useState("");
  const [gate, setGate] = useState("Soft gate (skippable)");
  const [trigger, setTrigger] = useState("Before the demo");

  const [hubTitle, setHubTitle] = useState("Product demo hub");
  const [hubIds, setHubIds] = useState<string[]>(projects.slice(0, 2).map((p) => p.id));

  const [invite, setInvite] = useState("");
  const [role, setRole] = useState("Editor");
  const [team, setTeam] = useState<{ email: string; role: string }[]>([]);

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DISTRIBUTION</div>
          <h1>Share & Hub</h1>
          <p>Send links, embed demos, capture leads and group your best content.</p>
        </div>
      </div>
      <div className="preview-note"><Info size={12} /> Links open the in-app preview. Public publishing, lead delivery and team invites aren't live yet. Settings here last for this session.</div>
      <Tabs defaultValue="share">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="share"><Link2 />Link & embed</TabsTrigger>
          <TabsTrigger value="leads"><ClipboardList />Lead form</TabsTrigger>
          <TabsTrigger value="hub"><LayoutGrid />Demo hub</TabsTrigger>
          <TabsTrigger value="team"><Users />Team</TabsTrigger>
        </TabsList>

        <TabsContent value="share" className="grid gap-4 lg:grid-cols-2 mt-4">
          <section className={card}>
            <h2 className="font-semibold">Share link</h2>
            <Field label="Project">
              <select className={sel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Who can view">
              <select className={sel} value={access} onChange={(e) => setAccess(e.target.value)}>
                {["Anyone with the link", "Workspace members", "Email-verified viewers"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <div className="flex gap-2"><Input readOnly value={link} /><Button variant="outline" disabled={!link} onClick={() => copy(link)}><Copy />Copy</Button></div>
            {projectId && <Button variant="link" className="px-0" asChild><Link to="/preview/$projectId" params={{ projectId }}>Open preview</Link></Button>}
          </section>
          <section className={card}>
            <h2 className="font-semibold"><Code2 className="inline mr-1" size={16} />Embed code</h2>
            <Field label="Width">
              <select className={sel} value={width} onChange={(e) => setWidth(e.target.value)}>
                {["100%", "800", "640"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{embed}</pre>
            <Button variant="outline" disabled={!link} onClick={() => copy(embed)}><Copy />Copy embed</Button>
          </section>
        </TabsContent>

        <TabsContent value="leads" className="grid gap-4 lg:grid-cols-2 mt-4">
          <section className={card}>
            <h2 className="font-semibold">Form setup</h2>
            <Field label="Gate type">
              <select className={sel} value={gate} onChange={(e) => setGate(e.target.value)}>
                {["Soft gate (skippable)", "Hard gate (required)", "No gate"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Show form">
              <select className={sel} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                {["Before the demo", "Halfway through", "At the end"].map((o) => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <div className="space-y-2">
              {fields.map((f) => (
                <div key={f} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  {f}<Button size="icon" variant="ghost" aria-label={`Remove ${f}`} onClick={() => setFields(fields.filter((x) => x !== f))}><X /></Button>
                </div>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = newField.trim(); if (v && !fields.includes(v)) setFields([...fields, v]); setNewField(""); }}>
                <Input placeholder="Add a field, e.g. Job title" value={newField} onChange={(e) => setNewField(e.target.value)} />
                <Button type="submit" variant="outline"><Plus />Add</Button>
              </form>
            </div>
          </section>
          <section className={card}>
            <h2 className="font-semibold">Viewer preview</h2>
            <p className="text-xs text-muted-foreground">{gate} · {trigger}</p>
            <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
              <b>Before you continue</b>
              {fields.map((f) => <Input key={f} placeholder={f} disabled />)}
              <Button className="w-full" disabled>Continue to demo</Button>
              {gate.startsWith("Soft") && <p className="text-center text-xs text-muted-foreground">Skip for now</p>}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="hub" className="grid gap-4 lg:grid-cols-2 mt-4">
          <section className={card}>
            <h2 className="font-semibold">Build your hub</h2>
            <Field label="Hub title"><Input value={hubTitle} onChange={(e) => setHubTitle(e.target.value)} /></Field>
            <div className="space-y-2 text-sm">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={hubIds.includes(p.id)} onChange={(e) => setHubIds(e.target.checked ? [...hubIds, p.id] : hubIds.filter((x) => x !== p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          </section>
          <section className={card}>
            <h2 className="text-lg font-semibold">{hubTitle || "Untitled hub"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.filter((p) => hubIds.includes(p.id)).map((p) => (
                <Link key={p.id} to="/preview/$projectId" params={{ projectId: p.id }} className="rounded-lg border border-border p-3 text-sm hover:border-primary">
                  <b>{p.name}</b>
                  <p className="text-xs text-muted-foreground">{p.type === "demo" ? "Interactive demo" : "Video"}</p>
                </Link>
              ))}
            </div>
            {!hubIds.length && <p className="text-sm text-muted-foreground">Pick projects to show in your hub.</p>}
          </section>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <section className={card}>
            <h2 className="font-semibold">Team & roles</h2>
            <form className="grid gap-2 sm:grid-cols-[1fr_160px_auto]" onSubmit={(e) => {
              e.preventDefault();
              const v = invite.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error("Enter a valid email."); return; }
              if (!team.some((m) => m.email === v)) setTeam([...team, { email: v, role }]);
              setInvite("");
            }}>
              <Input placeholder="teammate@company.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
              <select className={sel} value={role} onChange={(e) => setRole(e.target.value)}>
                {["Admin", "Editor", "Reviewer", "Viewer"].map((o) => <option key={o}>{o}</option>)}
              </select>
              <Button type="submit"><Plus />Add</Button>
            </form>
            <p className="text-xs text-muted-foreground">No emails are sent yet — this list plans who gets access.</p>
            {team.map((m) => (
              <div key={m.email} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{m.email}</span>
                <span className="flex items-center gap-2 text-muted-foreground">{m.role}<Button size="icon" variant="ghost" aria-label={`Remove ${m.email}`} onClick={() => setTeam(team.filter((x) => x.email !== m.email))}><X /></Button></span>
              </div>
            ))}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
