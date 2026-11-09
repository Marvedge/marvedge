import { Link, useNavigate } from "@tanstack/react-router";
import {
  MoreHorizontal,
  MousePointer2,
  Film,
  Copy,
  Pencil,
  Trash2,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProjectThumbnail } from "./project-thumbnail";
import { useWorkspace, type Project } from "@/lib/workspace";
export function ProjectCard({ project, list = false }: { project: Project; list?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState("");
  const [name, setName] = useState(project.name);
  const { addProject, updateProject, removeProject, folders } = useWorkspace();
  const navigate = useNavigate();
  return (
    <article className={`project-card ${list ? "project-list-row" : ""}`}>
      <Link
        to="/editor/$projectId"
        params={{ projectId: project.id }}
        className="project-image-link"
      >
        <ProjectThumbnail type={project.thumbnail} />
        <span className={`project-status ${project.status === "Ready" ? "status-ready" : ""}`}>
          <i />
          {project.status}
        </span>
      </Link>
      <div className="project-card-info">
        <div className="project-title-row">
          <Link to="/editor/$projectId" params={{ projectId: project.id }}>
            <h3>{project.name}</h3>
          </Link>
          <div className="project-menu-wrapper">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${project.name}`}
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal />
            </Button>
            {menu && (
              <div className="project-menu">
                {[
                  ["Rename", Pencil],
                  ["Duplicate", Copy],
                  ["Open", ArrowUpRight],
                  ["Export", Download],
                  ["Move to trash", Trash2],
                ].map(([label, Icon]) => {
                  const ActionIcon = Icon as typeof Pencil;
                  return (
                    <Button
                      variant="ghost"
                      key={String(label)}
                      onClick={() => {
                        setMenu(false);
                        if (label === "Duplicate") {
                          addProject({
                            ...project,
                            id: crypto.randomUUID(),
                            name: `${project.name} (copy)`,
                            status: "Draft",
                            updated: "Just now",
                          });
                        } else if (label === "Export") {
                          navigate({ to: "/export/$projectId", params: { projectId: project.id } });
                        } else setAction(String(label));
                      }}
                    >
                      <ActionIcon />
                      {String(label)}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="project-meta">
          {project.type === "demo" ? <MousePointer2 size={13} /> : <Film size={13} />}
          <span>{project.type === "demo" ? "Interactive demo" : "Short-form video"}</span>
          <span className="meta-dot">·</span>
          <span>{project.updated}</span>
        </div>
        <select
          className="project-folder-select"
          aria-label={`Folder for ${project.name}`}
          value={project.folder ?? ""}
          onChange={(e) => updateProject(project.id, { folder: e.target.value || undefined })}
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <Dialog
        open={action !== ""}
        onOpenChange={(v) => {
          if (!v) setAction("");
        }}
      >
        <DialogContent>
          <DialogTitle>{action} project</DialogTitle>
          <DialogDescription>
            {action === "Move to trash"
              ? "You can restore this project and its edits from Trash during this session."
              : action === "Open"
                ? "Continue editing your project."
                : "Give your project a new name."}
          </DialogDescription>
          {action === "Rename" && (
            <input
              className="form-input"
              aria-label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAction("")}>
              Cancel
            </Button>
            {action === "Open" ? (
              <Button asChild>
                <Link to="/editor/$projectId" params={{ projectId: project.id }}>
                  Open editor
                </Link>
              </Button>
            ) : (
              <Button
                variant={action === "Move to trash" ? "destructive" : "default"}
                disabled={action === "Rename" && !name.trim()}
                onClick={() => {
                  if (action === "Move to trash") removeProject(project.id);
                  else updateProject(project.id, { name: name.trim() });
                  setAction("");
                }}
              >
                {action === "Move to trash" ? "Move to trash" : "Save name"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
