import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { AiPanel } from "./ai-panel";

export function AiStudioPage() {
  const { projects } = useWorkspace();
  const [projectId, setProjectId] = useState("");
  const project = projects.find((p) => p.id === projectId);
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI STUDIO</div>
          <h1>Create with AI</h1>
          <p>Plan, write, caption, translate, repurpose and personalise — then apply it straight to a project.</p>
        </div>
      </div>
      <label className="block max-w-md space-y-1.5 text-sm">
        <span className="text-muted-foreground">Project to work on</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
          <option value="">None — just generate text</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.type === "demo" ? "Guided demo" : "Video"}</option>)}
        </select>
        {project && <span className="block text-xs text-muted-foreground">Showing the tools that work with {project.type === "demo" ? "guided demos" : "videos"}.</span>}
      </label>
      <AiPanel key={projectId} projectId={projectId || undefined} />
    </div>
  );
}
