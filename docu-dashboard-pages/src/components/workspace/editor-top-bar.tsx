import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronRight, CloudOff, Loader2, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWorkspace } from "@/lib/workspace";

/** Shared header for the Video editor and the Guided demo editor. */
export function EditorTopBar({
  projectId,
  label,
  undo,
  children,
}: {
  projectId: string;
  label: string;
  undo?: { onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean };
  children?: ReactNode;
}) {
  const { projects, updateProject, saveState } = useWorkspace();
  const project = projects.find((p) => p.id === projectId);
  const sample = !/^[0-9a-f-]{36}$/i.test(projectId);
  const status = sample
    ? { icon: <CloudOff size={11} />, text: "Sample · kept in this session" }
    : saveState === "loading"
      ? { icon: <Loader2 size={11} className="animate-spin" />, text: "Saving…" }
      : saveState === "error"
        ? { icon: <CloudOff size={11} />, text: "Couldn't save — check connection" }
        : saveState === "saved"
          ? { icon: <Check size={11} />, text: "Saved to your account" }
          : { icon: <CloudOff size={11} />, text: "Kept in this session" };
  return (
    <header className="studio-header">
      <div className="studio-header-left">
        <Button
          variant="ghost"
          size="icon"
          asChild
          aria-label="Back to projects"
          title="Back to projects"
        >
          <Link to="/projects">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="toolbar-divider" />
        <div className="studio-project-title">
          <input
            aria-label="Project title"
            value={project?.name ?? ""}
            onChange={(e) => updateProject(projectId, { name: e.target.value })}
          />
          <span>
            {status.icon}
            {status.text}
          </span>
        </div>
      </div>
      <div className="studio-header-center">
        <span>Draft</span>
        <ChevronRight size={12} />
        <span>{label}</span>
      </div>
      <div className="studio-header-actions">
        <ThemeToggle />
        {undo && (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              onClick={undo.onUndo}
              disabled={!undo.canUndo}
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              onClick={undo.onRedo}
              disabled={!undo.canRedo}
            >
              <Redo2 />
            </Button>
            <span className="toolbar-divider" />
          </>
        )}
        {children}
      </div>
    </header>
  );
}
