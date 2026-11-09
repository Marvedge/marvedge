import { Link } from "@tanstack/react-router";
import { Folder, HardDrive, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { formatBytes, storageBytes, usagePercent } from "@/lib/workspace-usage";

export function UsageBars({ detailed = false }: { detailed?: boolean }) {
  const { projects, uploadMedia, trash, usageBudgets, setUsageBudgets } = useWorkspace();
  const files = [
    ...projects.filter((p) => p.source && p.sourceSize).map((p) => ({ url: p.source || "", size: p.sourceSize || 0 })),
    ...uploadMedia,
    ...trash.flatMap((t) => t.kind === "media" ? [t.item] : t.kind === "project" && t.item.source && t.item.sourceSize ? [{ url: t.item.source, size: t.item.sourceSize }] : []),
  ];
  const bytes = storageBytes(files);
  const trashBytes = storageBytes(trash.flatMap((t) => t.kind === "media" ? [t.item] : t.kind === "project" && t.item.source && t.item.sourceSize ? [{ url: t.item.source, size: t.item.sourceSize }] : []));
  return (
    <section className={`workspace-usage ${detailed ? "usage-detailed" : ""}`} aria-label="Workspace usage">
      <div className="usage-heading">
        <div><b>Free workspace usage</b><span>Session only · illustrative budgets, not plan limits</span></div>
        {!detailed && <Button variant="ghost" size="icon" asChild title="Usage & storage options"><Link to="/subscription" aria-label="Usage & storage options"><SlidersHorizontal size={16} /></Link></Button>}
      </div>
      <div className="workspace-usage-meters">
        <div className="workspace-usage-metric">
          <div><span><Folder size={14} /> Projects</span><b>{projects.length} / {usageBudgets.projects}</b></div>
          <progress aria-label="Project budget usage" max={usageBudgets.projects} value={Math.min(projects.length, usageBudgets.projects)} />
          {projects.length >= usageBudgets.projects && <small>Planning budget reached · creation still available</small>}
        </div>
        <div className="workspace-usage-metric">
          <div><span><HardDrive size={14} /> Local media</span><b>{formatBytes(bytes)} / {formatBytes(usageBudgets.storageMB * 1024 * 1024)}</b></div>
          <progress aria-label="Storage budget usage" max={100} value={usagePercent(bytes, usageBudgets.storageMB * 1024 * 1024)} />
          {bytes >= usageBudgets.storageMB * 1024 * 1024 && <small>Planning budget reached · uploads still available</small>}
        </div>
      </div>
      {detailed && <>
        <p className="usage-detail-note">Counts include sample projects. Local media totals use known file sizes, count shared sources once, and include trash. Cloud storage, AI credits, and processing minutes are not connected.</p>
        <div className="usage-options">
          <label className="field-label">Project planning budget<input type="number" min={1} max={100000} value={usageBudgets.projects} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value) && value > 0 && value <= 100000) setUsageBudgets((prev) => ({ ...prev, projects: value })); }} /></label>
          <label className="field-label">Storage planning budget<select value={usageBudgets.storageMB} onChange={(e) => setUsageBudgets((prev) => ({ ...prev, storageMB: Number(e.target.value) }))}><option value={512}>512 MB</option><option value={1024}>1 GB</option><option value={5120}>5 GB</option><option value={10240}>10 GB</option></select></label>
        </div>
        <div className="usage-storage-actions"><span>{formatBytes(trashBytes)} in trash</span><Button variant="outline" asChild><Link to="/trash">Manage trash</Link></Button><Button variant="outline" asChild><Link to="/create" search={{ tab: "uploads" }}>Manage media</Link></Button></div>
      </>}
    </section>
  );
}