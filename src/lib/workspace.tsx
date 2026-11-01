import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultDraft, type EditorDraft } from "./editor-model";
import {
  samplePosts,
  type UploadPost,
  type UploadMedia,
  type CredentialProfile,
} from "./upload-model";
export type Project = {
  id: string;
  name: string;
  type: "demo" | "video";
  status: "Draft" | "Ready";
  updated: string;
  thumbnail: "product" | "video" | "board";
  source?: string;
  sourceName?: string;
  sourceSize?: number | undefined;
  sourceMethod?: string;
  duration?: number;
  ratio?: string;
  prompt?: string;
  audience?: string;
  language?: string;
  folder?: string | undefined;
};
const samples: Project[] = [
  {
    id: "product-tour",
    name: "Product onboarding tour",
    type: "demo",
    status: "Ready",
    updated: "2 hours ago",
    thumbnail: "product",
  },
  {
    id: "launch-highlights",
    name: "Launch webinar highlights",
    type: "video",
    status: "Draft",
    updated: "4 hours ago",
    thumbnail: "video",
  },
  {
    id: "feature-walkthrough",
    name: "New feature walkthrough",
    type: "demo",
    status: "Draft",
    updated: "Yesterday",
    thumbnail: "board",
  },
];
export type BrandComponent = { id: string; kind: "Call to action" | "Lower third" | "Intro card" | "Outro card" | "Watermark"; text: string };
export type TrashItem = { deletedAt: string } & (
  | { kind: "project"; item: Project; draft?: EditorDraft | undefined }
  | { kind: "post"; item: UploadPost }
  | { kind: "media"; item: UploadMedia }
);
type Workspace = {
  trash: TrashItem[];
  trashPost: (id: string) => void;
  trashMedia: (id: string) => void;
  restoreTrash: (kind: TrashItem["kind"], id: string) => void;
  deleteTrash: (kind?: TrashItem["kind"], id?: string) => void;
  usageBudgets: { projects: number; storageMB: number };
  setUsageBudgets: React.Dispatch<React.SetStateAction<{ projects: number; storageMB: number }>>;
  uploadPosts: UploadPost[];
  setUploadPosts: React.Dispatch<React.SetStateAction<UploadPost[]>>;
  uploadMedia: UploadMedia[];
  setUploadMedia: React.Dispatch<React.SetStateAction<UploadMedia[]>>;
  credentialProfiles: CredentialProfile[];
  setCredentialProfiles: React.Dispatch<React.SetStateAction<CredentialProfile[]>>;
  projects: Project[];
  drafts: Record<string, EditorDraft>;
  setDraft: (id: string, draft: EditorDraft) => void;
  getDraft: (id: string) => EditorDraft;
  addProject: (project: Project) => void;
  updateProject: (id: string, changes: Partial<Project>) => void;
  removeProject: (id: string) => void;
  profile: { name: string; email: string; workspace: string };
  setProfile: (profile: { name: string; email: string; workspace: string }) => void;
  brandComponents: BrandComponent[];
  setBrandComponents: React.Dispatch<React.SetStateAction<BrandComponent[]>>;
  folders: string[];
  setFolders: React.Dispatch<React.SetStateAction<string[]>>;
  brand: { color: string; font: string };
  setBrand: (brand: { color: string; font: string }) => void;
};
// Keep one context instance across hot reloads so the provider and consumers always match.
const contextStore = globalThis as typeof globalThis & {
  __marvedgeWorkspaceContext?: React.Context<Workspace | null>;
};
const WorkspaceContext = (contextStore.__marvedgeWorkspaceContext ??=
  createContext<Workspace | null>(null));
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState(samples);
  const [uploadPosts, setUploadPosts] = useState<UploadPost[]>(samplePosts);
  const [uploadMedia, setUploadMedia] = useState<UploadMedia[]>([]);
  const [credentialProfiles, setCredentialProfiles] = useState<CredentialProfile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditorDraft>>({});
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [usageBudgets, setUsageBudgets] = useState({ projects: 10, storageMB: 1024 });
  function restoreTrash(kind: TrashItem["kind"], id: string) {
    const entry = trash.find((t) => t.kind === kind && t.item.id === id);
    if (!entry) return;
    if (entry.kind === "project") {
      setProjects((prev) => [{ ...entry.item, updated: "Just now" }, ...prev]);
      const draft = entry.draft;
      if (draft) setDrafts((prev) => ({ ...prev, [id]: draft }));
    } else if (entry.kind === "post") {
      setUploadPosts((prev) => [{ ...entry.item, status: "Draft", scheduledAt: "" }, ...prev]);
    } else setUploadMedia((prev) => [entry.item, ...prev]);
    setTrash((prev) => prev.filter((t) => !(t.kind === kind && t.item.id === id)));
  }
  function deleteTrash(kind?: TrashItem["kind"], id?: string) {
    const removed = trash.filter((t) => !kind || (t.kind === kind && t.item.id === id));
    const retained = trash.filter((t) => !removed.includes(t));
    const referenced = new Set([
      ...projects.map((p) => p.source), ...uploadMedia.map((m) => m.url),
      ...retained.map((t) => t.kind === "project" ? t.item.source : t.kind === "media" ? t.item.url : undefined),
    ]);
    for (const entry of removed) {
      const url = entry.kind === "project" ? entry.item.source : entry.kind === "media" ? entry.item.url : undefined;
      if (url?.startsWith("blob:") && !referenced.has(url)) URL.revokeObjectURL(url);
      if (entry.kind === "project") {
        setUploadPosts((prev) => prev.map((p) => p.projectId === entry.item.id ? { ...p, projectId: undefined } : p));
      }
    }
    setTrash(retained);
  }
  const [profile, setProfile] = useState({
    name: "Alex Morgan",
    email: "",
    workspace: "My workspace",
  });
  const [brand, setBrand] = useState({ color: "purple", font: "DM Sans" });
  const [brandComponents, setBrandComponents] = useState<BrandComponent[]>([
    { id: "cta", kind: "Call to action", text: "Book a demo" },
    { id: "intro", kind: "Intro card", text: "Welcome to the tour" },
  ]);
  const [folders, setFolders] = useState<string[]>(["Onboarding", "Launches"]);
  return (
    <WorkspaceContext.Provider
      value={{
        trash, restoreTrash, deleteTrash, usageBudgets, setUsageBudgets,
        trashPost: (id) => {
          const item = uploadPosts.find((p) => p.id === id);
          if (!item) return;
          setTrash((prev) => [{ kind: "post", item, deletedAt: new Date().toISOString() }, ...prev]);
          setUploadPosts((prev) => prev.filter((p) => p.id !== id));
        },
        trashMedia: (id) => {
          const item = uploadMedia.find((m) => m.id === id);
          if (!item || uploadPosts.some((p) => p.mediaId === id)) return;
          setTrash((prev) => [{ kind: "media", item, deletedAt: new Date().toISOString() }, ...prev]);
          setUploadMedia((prev) => prev.filter((m) => m.id !== id));
        },
        uploadPosts,
        setUploadPosts,
        uploadMedia,
        setUploadMedia,
        credentialProfiles,
        setCredentialProfiles,
        projects,
        drafts,
        setDraft: (id, draft) => setDrafts((prev) => ({ ...prev, [id]: draft })),
        getDraft: (id) => {
          const existing = drafts[id];
          if (existing) return existing;
          const p = projects.find((p) => p.id === id);
          const draft = defaultDraft(
            p?.source?.startsWith("blob:") ? p.source : undefined,
            p?.ratio,
          );
          if (p?.sourceMethod) {
            draft.events = draft.events.filter((e) => e.lane === "video");
            draft.description = p.prompt || "";
            draft.language = p.language || "English";
          }
          if (p?.duration)
            draft.events[0] = {
              ...draft.events[0],
              id: "recording",
              lane: "video",
              kind: "Recording",
              name: p.sourceName || "Source recording",
              start: 0,
              duration: p.duration,
              text: "",
              color: "purple",
              x: 50,
              y: 50,
              size: 100,
              intensity: 0,
              easing: "Linear",
              shape: "Rectangle",
              source: p.source || "",
              sourceOffset: 0,
            };
          return draft;
        },
        addProject: (p) => setProjects((prev) => [p, ...prev]),
        updateProject: (id, changes) =>
          setProjects((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...changes, updated: "Just now" } : p)),
          ),
        removeProject: (id) => {
          const item = projects.find((p) => p.id === id);
          if (!item) return;
          setTrash((prev) => [{ kind: "project", item, draft: drafts[id], deletedAt: new Date().toISOString() }, ...prev]);
          setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
          setProjects((prev) => prev.filter((p) => p.id !== id));
        },
        profile,
        setProfile,
        brandComponents,
        setBrandComponents,
        folders,
        setFolders,
        brand,
        setBrand,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace provider missing");
  return context;
}
export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · Marvedge` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} · Marvedge` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
