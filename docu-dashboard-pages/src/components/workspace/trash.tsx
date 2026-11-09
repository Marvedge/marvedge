import { useState } from "react";
import { Search, Trash2, RotateCcw, Folder, FileImage, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace, type TrashItem } from "@/lib/workspace";
import { toast } from "sonner";

export function TrashPage() {
  const { trash, restoreTrash, deleteTrash } = useWorkspace();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [confirm, setConfirm] = useState<TrashItem | "all" | null>(null);
  const nameOf = (t: TrashItem) => t.kind === "post" ? t.item.title : t.item.name;
  const filtered = trash.filter((t) => (kind === "all" || kind === t.kind) && nameOf(t).toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="page-heading"><div><div className="eyebrow">ROOM TO CHANGE YOUR MIND</div><h1>Trash</h1><p>Recover projects, posts, and media from this session.</p></div><Button variant="outline" disabled={!trash.length} onClick={() => setConfirm("all")}><Trash2 size={16} /> Empty trash</Button></div>
    <div className="info-note">Session only. Refreshing clears this workspace. Media in trash still occupies local storage; restored posts return as unscheduled drafts.</div>
    <div className="filter-bar"><label className="search-field"><Search size={16} /><input aria-label="Search trash" placeholder="Search trash…" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select aria-label="Trash type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All items</option><option value="project">Projects</option><option value="post">Posts</option><option value="media">Media</option></select><span className="sample-label">{trash.length} items in trash</span></div>
    <div className="trash-list">{filtered.map((t) => {
      const Icon = t.kind === "project" ? Folder : t.kind === "post" ? CalendarDays : FileImage;
      const name = nameOf(t);
      return <article className="trash-item" key={`${t.kind}-${t.item.id}`}><span className="trash-item-icon"><Icon size={21} /></span><div className="trash-item-info"><h3>{name}</h3><p>{t.kind === "project" ? "Project" : t.kind === "post" ? "Post" : "Media"} · Deleted {new Date(t.deletedAt).toLocaleString()}</p></div><div className="trash-item-actions"><Button variant="outline" aria-label={`Restore ${name}`} onClick={() => { restoreTrash(t.kind, t.item.id); toast.success(`${name} restored`); }}><RotateCcw size={15} /> Restore</Button><Button variant="ghost" size="icon" title="Delete forever" aria-label={`Delete forever ${name}`} onClick={() => setConfirm(t)}><Trash2 size={16} /></Button></div></article>;
    })}</div>
    {!filtered.length && <div className="empty-state"><Trash2 size={38} /><h2>{trash.length ? "No matching items" : "Your trash is empty"}</h2><p>{trash.length ? "Try another search or item type." : "Deleted projects, posts, and media will appear here."}</p></div>}
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}><DialogContent><DialogTitle>{confirm === "all" ? "Empty trash?" : "Delete forever?"}</DialogTitle><DialogDescription>{confirm === "all" ? `All ${trash.length} trashed items` : confirm ? nameOf(confirm) : "This item"} will be permanently removed from this session. This cannot be undone.</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={() => { if (confirm === "all") deleteTrash(); else if (confirm) deleteTrash(confirm.kind, confirm.item.id); setConfirm(null); toast.success("Trash permanently deleted"); }}>Delete forever</Button></div></DialogContent></Dialog>
  </>;
}