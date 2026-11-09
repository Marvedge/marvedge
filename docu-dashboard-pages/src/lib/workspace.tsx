import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccountContext } from "./account";
import { isSavable, toSaved, draftToSaved, loadSaved, saveProjects, deleteProjects, saveDraft, syncFolders } from "./project-store";
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
  saveState: "local" | "loading" | "saved" | "error";
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
  const ownerId = useContext(AccountContext)?.user?.id;
  const [saveState, setSaveState] = useState<"local" | "loading" | "saved" | "error">(ownerId ? "loading" : "local");
  const synced = useRef<{ projects: Map<string, string>; folders: string[]; drafts: Map<string, string> } | null>(null);
  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    loadSaved(ownerId)
      .then(({ projects: rows, folders: savedFolders }) => {
        if (cancelled) return;
        const loaded = rows.map((r) => ({ ...(r.data as Project), id: r.id, updated: relativeTime(r.updated_at) }));
        const loadedDrafts: Record<string, EditorDraft> = {};
        for (const r of rows) if (r.draft) loadedDrafts[r.id] = r.draft as unknown as EditorDraft;
        synced.current = {
          projects: new Map(loaded.map((p) => [p.id, JSON.stringify(toSaved(p))])),
          folders: savedFolders,
          drafts: new Map(Object.entries(loadedDrafts).map(([k, v]) => [k, JSON.stringify(draftToSaved(v))])),
        };
        if (loaded.length) setProjects((prev) => [...prev.filter((p) => isSavable(p.id) && !loaded.some((l) => l.id === p.id)), ...loaded, ...prev.filter((p) => !isSavable(p.id))]);
        if (savedFolders.length) setFolders(savedFolders);
        else synced.current.folders = [];
        setDrafts((prev) => ({ ...loadedDrafts, ...prev }));
        setSaveState("saved");
      })
      .catch(() => !cancelled && setSaveState("error"));
    return () => { cancelled = true; };
  }, [ownerId]);
  useEffect(() => {
    const s = synced.current;
    if (!ownerId || !s) return;
    const savable = projects.filter((p) => isSavable(p.id));
    const changed = savable
      .map((p) => ({ id: p.id, data: toSaved(p) }))
      .filter((r) => s.projects.get(r.id) !== JSON.stringify(r.data));
    const ids = new Set(savable.map((p) => p.id));
    const removed = [...s.projects.keys()].filter((id) => !ids.has(id));
    if (!changed.length && !removed.length) return;
    for (const r of changed) s.projects.set(r.id, JSON.stringify(r.data));
    for (const id of removed) s.projects.delete(id);
    Promise.all([saveProjects(ownerId, changed), deleteProjects(removed)])
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("error"));
  }, [projects, ownerId, saveState]);
  useEffect(() => {
    const s = synced.current;
    if (!ownerId || !s) return;
    const add = folders.filter((f) => !s.folders.includes(f));
    const remove = s.folders.filter((f) => !folders.includes(f));
    if (!add.length && !remove.length) return;
    s.folders = [...folders];
    syncFolders(ownerId, add, remove).catch(() => setSaveState("error"));
  }, [folders, ownerId, saveState]);
  useEffect(() => {
    const s = synced.current;
    if (!ownerId || !s) return;
    const timer = setTimeout(() => {
      for (const [id, d] of Object.entries(drafts)) {
        if (!isSavable(id) || !s.projects.has(id)) continue;
        const saved = draftToSaved(d);
        const key = JSON.stringify(saved);
        if (s.drafts.get(id) === key) continue;
        s.drafts.set(id, key);
        saveDraft(id, saved).catch(() => setSaveState("error"));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [drafts, ownerId, saveState]);
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
        saveState,
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

function relativeTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}
