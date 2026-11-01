import { useState } from "react";
import { toast } from "sonner";
import { FileText, Scissors, Languages, Bot, Lock, Send, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/lib/workspace";

function Soon() {
  return <Badge variant="secondary" className="gap-1"><Lock size={11} />Coming soon</Badge>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="text-muted-foreground">{label}</span>{children}</label>;
}
function Select({ options }: { options: string[] }) {
  return (
    <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}
function RunButton({ label }: { label: string }) {
  return <Button className="w-full" onClick={() => toast.info("Preview only — AI not connected yet")}><Wand2 />{label}</Button>;
}
function Preview({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Example preview · not generated</p>
      {lines.map((l) => <div key={l} className="rounded-md bg-background px-3 py-2 text-sm text-foreground">{l}</div>)}
    </div>
  );
}

export function AiStudioPage() {
  const { projects } = useWorkspace();
  const names = projects.length ? projects.map((p) => p.name) : ["No projects yet"];
  const [chat, setChat] = useState("");
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI STUDIO</div>
          <h1>AI tools</h1>
          <p>A preview of the AI tools planned for Marvedge.</p>
        </div>
        <Soon />
      </div>
      <Tabs defaultValue="script">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="script"><FileText />Script & captions</TabsTrigger>
          <TabsTrigger value="edit"><Scissors />Auto-edit & highlights</TabsTrigger>
          <TabsTrigger value="voice"><Languages />Translation & voice</TabsTrigger>
          <TabsTrigger value="chat"><Bot />Assistant</TabsTrigger>
        </TabsList>

        <TabsContent value="script" className="grid gap-4 lg:grid-cols-2 mt-4">
          <Panel title="Write a script">
            <Field label="Project"><Select options={names} /></Field>
            <Field label="What is this video about?"><Textarea placeholder="e.g. Show new users how to create their first report in under a minute" rows={4} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tone"><Select options={["Friendly", "Professional", "Energetic", "Calm"]} /></Field>
              <Field label="Length"><Select options={["30 seconds", "60 seconds", "2 minutes"]} /></Field>
            </div>
            <RunButton label="Generate script" />
          </Panel>
          <Panel title="Auto captions">
            <Field label="Caption style"><Select options={["Clean subtitles", "Bold word-by-word", "Minimal lower third"]} /></Field>
            <Field label="Spoken language"><Select options={["Detect automatically", "English", "Hindi", "Spanish"]} /></Field>
            <RunButton label="Create captions" />
            <Preview lines={["00:00 Welcome to your new dashboard.", "00:04 Click Create to start a report.", "00:09 Pick a template and you're done."]} />
          </Panel>
        </TabsContent>

        <TabsContent value="edit" className="grid gap-4 lg:grid-cols-2 mt-4">
          <Panel title="Smart edit">
            <Field label="Project"><Select options={names} /></Field>
            {["Remove silences and pauses", "Add zoom on clicks", "Suggest transitions between clips", "Track the active speaker"].map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" defaultChecked />{o}</label>
            ))}
            <RunButton label="Apply smart edit" />
          </Panel>
          <Panel title="Find highlights">
            <Field label="Clip format"><Select options={["Vertical 9:16 shorts", "Square 1:1", "Wide 16:9"]} /></Field>
            <Field label="Number of clips"><Select options={["3", "5", "10"]} /></Field>
            <RunButton label="Find best moments" />
            <Preview lines={["Clip 1 · 0:12–0:41 · Product reveal", "Clip 2 · 1:05–1:30 · Customer question", "Clip 3 · 2:10–2:38 · Key takeaway"]} />
          </Panel>
        </TabsContent>

        <TabsContent value="voice" className="grid gap-4 lg:grid-cols-2 mt-4">
          <Panel title="Translate">
            <Field label="Project"><Select options={names} /></Field>
            <Field label="Translate into"><Select options={["Hindi", "Spanish", "French", "German", "Japanese"]} /></Field>
            <Field label="What to translate"><Select options={["Captions and on-screen text", "Captions only", "Everything incl. voice"]} /></Field>
            <RunButton label="Translate project" />
          </Panel>
          <Panel title="AI voiceover">
            <Field label="Voice"><Select options={["Warm · female", "Clear · male", "Upbeat · neutral"]} /></Field>
            <Field label="Speed"><Select options={["Normal", "Slower", "Faster"]} /></Field>
            <Field label="Text to read"><Textarea placeholder="Paste your script, or generate one in Script & captions" rows={4} /></Field>
            <RunButton label="Create voiceover" />
            <p className="text-xs text-muted-foreground">Voice cloning will require the speaker's consent.</p>
          </Panel>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Panel title="Ask the assistant">
            <div className="space-y-3 min-h-48">
              <div className="ml-auto max-w-md rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Make the intro shorter and add a fade between clips.</div>
              <div className="max-w-md text-sm text-foreground"><span className="font-medium">Marvedge assistant · example</span><br />I'd trim the intro to 4 seconds and add a crossfade after clip 1. Apply these changes?</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Tighten pacing", "Write a title", "Suggest music", "Make a vertical version"].map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => setChat(s)}>{s}</Button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); toast.info("Preview only — AI not connected yet"); setChat(""); }}>
              <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Ask the assistant to edit your video…" />
              <Button type="submit" size="icon" aria-label="Send"><Send /></Button>
            </form>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
