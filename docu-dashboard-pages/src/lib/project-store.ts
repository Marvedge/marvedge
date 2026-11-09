import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Sample projects use readable ids and stay local; only real projects are saved. */
export const isSavable = (id: string) => UUID.test(id);

/** Browser-only file links (blob:) die on reload, so they're never saved. */
export function toSaved<T extends { source?: string | undefined }>(p: T): Json {
  const { source, ...rest } = p;
  return JSON.parse(JSON.stringify(source?.startsWith("blob:") ? rest : p)) as Json;
}
function stripBlobs(value: unknown): unknown {
  if (typeof value === "string") return value.startsWith("blob:") ? "" : value;
  if (Array.isArray(value)) return value.map(stripBlobs);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripBlobs(v)]));
  return value;
}
export const draftToSaved = (d: unknown) => stripBlobs(d) as Json;

export async function loadSaved(ownerId: string) {
  const [p, f] = await Promise.all([
    supabase.from("projects").select("id, data, draft, updated_at").eq("owner_id", ownerId).order("updated_at", { ascending: false }),
    supabase.from("project_folders").select("name").eq("owner_id", ownerId).order("created_at"),
  ]);
  if (p.error) throw p.error;
  if (f.error) throw f.error;
  return { projects: p.data, folders: f.data.map((r) => r.name) };
}
export async function saveProjects(ownerId: string, rows: { id: string; data: Json }[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("projects").upsert(rows.map((r) => ({ ...r, owner_id: ownerId, updated_at: new Date().toISOString() })));
  if (error) throw error;
}
export async function deleteProjects(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("projects").delete().in("id", ids);
  if (error) throw error;
}
export async function saveDraft(id: string, draft: Json) {
  const { error } = await supabase.from("projects").update({ draft, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function syncFolders(ownerId: string, add: string[], remove: string[]) {
  if (add.length) {
    const { error } = await supabase.from("project_folders").upsert(add.map((name) => ({ owner_id: ownerId, name })));
    if (error) throw error;
  }
  if (remove.length) {
    const { error } = await supabase.from("project_folders").delete().eq("owner_id", ownerId).in("name", remove);
    if (error) throw error;
  }
}
