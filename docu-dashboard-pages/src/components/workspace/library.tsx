import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Image as ImageIcon, Film, Upload, LayoutTemplate, MousePointer2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { formatBytes } from "@/lib/workspace-usage";

const templates = [
  { id: "onboarding", name: "Product onboarding tour", type: "demo", desc: "Guided steps with hotspots for new users." },
  { id: "feature", name: "Feature launch", type: "demo", desc: "Highlight one new feature end to end." },
  { id: "sales", name: "Sales walkthrough", type: "demo", desc: "Personalised tour with a lead form." },
  { id: "teaser", name: "Social teaser", type: "video", desc: "Vertical 30-second clip with captions." },
  { id: "webinar", name: "Webinar highlights", type: "video", desc: "Turn a long talk into short moments." },
  { id: "tutorial", name: "How-to tutorial", type: "video", desc: "Screen recording with voiceover." },
] as const;

export function LibraryPage() {
  const { uploadMedia, projects } = useWorkspace();
  const [tab, setTab] = useState<"assets" | "templates">("assets");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const recordings = projects
    .filter((p) => p.source?.startsWith("blob:"))
    .map((p) => ({ id: p.id, name: p.sourceName || p.name, url: p.source!, kind: "video" as const, size: p.sourceSize ?? 0 }));
  const assets = [...uploadMedia, ...recordings].filter(
    (a) => (kind === "all" || a.kind === kind) && a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const tpl = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REUSE WHAT WORKS</div>
          <h1>Library</h1>
          <p>Your media and starter templates, ready to drop into any project.</p>
        </div>
        <Button asChild>
          <Link to="/create" search={{ tab: "uploads" }}><Upload /> Upload media</Link>
        </Button>
      </div>
      <div className="folder-bar" role="tablist" aria-label="Library sections">
        <Button role="tab" aria-selected={tab === "assets"} size="sm" variant={tab === "assets" ? "secondary" : "ghost"} onClick={() => setTab("assets")}>
          <ImageIcon /> Assets <span className="folder-count">{uploadMedia.length + recordings.length}</span>
        </Button>
        <Button role="tab" aria-selected={tab === "templates"} size="sm" variant={tab === "templates" ? "secondary" : "ghost"} onClick={() => setTab("templates")}>
          <LayoutTemplate /> Templates <span className="folder-count">{templates.length}</span>
        </Button>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input placeholder={`Search ${tab}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {tab === "assets" && (
          <select aria-label="Asset type" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All media</option>
            <option value="video">Videos</option>
            <option value="image">Images</option>
          </select>
        )}
      </div>
      {tab === "assets" ? (
        assets.length ? (
          <div className="library-grid">
            {assets.map((a) => (
              <article key={a.id} className="library-card">
                <div className="library-thumb">
                  {a.kind === "image" ? <img src={a.url} alt={a.name} /> : <video src={a.url} muted preload="metadata" />}
                </div>
                <div className="library-info">
                  {a.kind === "image" ? <ImageIcon size={13} /> : <Film size={13} />}
                  <b title={a.name}>{a.name}</b>
                  <span>{a.size ? formatBytes(a.size) : ""}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <ImageIcon size={40} />
            <h2>{search ? "No matching media" : "Upload your first asset"}</h2>
            <p>Uploaded images, videos and your recordings appear here.</p>
            <Button asChild><Link to="/create" search={{ tab: "uploads" }}><Upload /> Upload media</Link></Button>
          </div>
        )
      ) : (
        <div className="library-grid">
          {tpl.map((t) => (
            <article key={t.id} className="library-card template-card">
              <div className="library-info">
                {t.type === "demo" ? <MousePointer2 size={14} /> : <Film size={14} />}
                <b>{t.name}</b>
              </div>
              <p>{t.desc}</p>
              <Button size="sm" variant="outline" asChild>
                <Link to="/create" search={{ type: t.type, method: t.type === "demo" ? "url" : "upload" }}>
                  Use template <ArrowRight />
                </Link>
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="preview-note">Media stays in this browser session. Templates are starter layouts.</div>
    </>
  );
}
