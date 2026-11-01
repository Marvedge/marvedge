import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Plus, LayoutGrid, List, FolderOpen, Trash2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { ProjectCard } from "./project-card";
export function ProjectsPage() {
  const { projects, folders, setFolders, trash } = useWorkspace();
  const [folder, setFolder] = useState("all");
  const [newFolder, setNewFolder] = useState("");
  const trashCount = trash.filter((t) => t.kind === "project").length;
  function addFolder() {
    const name = newFolder.trim();
    if (!name || folders.includes(name)) return;
    setFolders((prev) => [...prev, name]);
    setFolder(name);
    setNewFolder("");
  }
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
        (status === "all" || p.status === status) &&
        (folder === "all" || (folder === "none" ? !p.folder : p.folder === folder)),
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
      <div className="folder-bar" role="tablist" aria-label="Folders">
        {[["all", "All projects"], ["none", "Unfiled"], ...folders.map((f) => [f, f])].map(([id, label]) => (
          <Button
            key={id}
            role="tab"
            aria-selected={folder === id}
            variant={folder === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFolder(id!)}
          >
            <FolderOpen />
            {label}
            <span className="folder-count">
              {projects.filter((p) => id === "all" || (id === "none" ? !p.folder : p.folder === id)).length}
            </span>
          </Button>
        ))}
        <form
          className="new-folder"
          onSubmit={(e) => {
            e.preventDefault();
            addFolder();
          }}
        >
          <input aria-label="New folder name" placeholder="New folder" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          <Button type="submit" size="icon" variant="ghost" aria-label="Add folder"><FolderPlus /></Button>
        </form>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/trash"><Trash2 /> Trash ({trashCount})</Link>
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
