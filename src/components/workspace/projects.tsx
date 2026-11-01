import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Plus, LayoutGrid, List, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { ProjectCard } from "./project-card";
export function ProjectsPage() {
  const { projects } = useWorkspace();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("recent");
  const filtered = projects
    .filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) &&
        (type === "all" || p.type === type) &&
        (status === "all" || p.status === status),
    )
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : 0));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR IDEAS, ALL TOGETHER</div>
          <h1>Projects</h1>
          <p>A home for every demo, every clip, and every next big thing.</p>
        </div>
        <Button asChild>
          <Link to="/create">
            <Plus />
            Create new
          </Link>
        </Button>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="Project type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          <option value="demo">Interactive demos</option>
          <option value="video">Short-form videos</option>
        </select>
        <select
          aria-label="Project status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option>Draft</option>
          <option>Ready</option>
        </select>
        <select aria-label="Sort projects" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recently edited</option>
          <option value="name">Name A–Z</option>
        </select>
        <div className="segmented">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <LayoutGrid />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <List />
          </Button>
        </div>
      </div>
      <div className="library-heading">
        <span>{filtered.length} projects</span>
        <span className="sample-label">Session workspace · includes samples</span>
      </div>
      <div className={view === "grid" ? "projects-grid" : "projects-list"}>
        {filtered.map((p) => (
          <ProjectCard key={p.id} project={p} list={view === "list"} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <FolderOpen size={40} />
          <h2>{search ? "No matching projects" : "Make something worth sharing"}</h2>
          <p>
            {search
              ? "Try another name or clear your filters."
              : "Create a demo or upload your first recording."}
          </p>
          <Button asChild>
            <Link to="/create">
              <Plus />
              Create project
            </Link>
          </Button>
        </div>
      )}
    </>
  );
}
