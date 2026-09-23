import { create } from "zustand";

import {
  clearVideoDraft,
  loadVideoDraft,
  saveVideoDraft,
  saveVideoDraftMeta,
  type VideoDraftMeta,
} from "../lib/videoDraftStore";

// Unique id for a persisted draft, so restored editing state (localStorage) can be
// matched to the video it belongs to. See issue #226.
function generateDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface BlobStore {
  blob: Blob | null;
  sourceDuration: number;
  title: string;
  description: string;
  draftId: string | null;
  canonicalVideoUrl: string | null;
  setBlob: (blob: Blob | null) => void;
  setCanonicalVideoUrl: (url: string | null) => void;
  setSourceDuration: (seconds: number) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  reset: () => void;
  restoreBlob: () => void;
}

export const useBlobStore = create<BlobStore>((set, get) => {
  const buildMeta = (draftId: string): VideoDraftMeta => {
    const { blob, title, description, sourceDuration, canonicalVideoUrl } = get();
    return {
      draftId,
      type: blob?.type ?? "",
      name: (blob as File | null)?.name ?? "",
      title,
      description,
      sourceDuration,
      savedAt: Date.now(),
      canonicalVideoUrl: canonicalVideoUrl ?? null,
    };
  };

  // Metadata edits (title/description/duration) only re-persist if a draft video
  // already exists in IndexedDB — there is nothing to attach them to otherwise.
  const persistMetaIfDraft = () => {
    const { blob, draftId } = get();
    if (blob && draftId) {
      void saveVideoDraftMeta(buildMeta(draftId)).catch(() => {});
    }
  };

  return {
    blob: null,
    sourceDuration: 0,
    title: "",
    description: "",
    draftId: null,
    canonicalVideoUrl: null,
    setCanonicalVideoUrl: (canonicalVideoUrl) => {
      set({ canonicalVideoUrl });
      persistMetaIfDraft();
    },
    setBlob: (blob) => {
      if (blob) {
        // A new video is a new draft; any previously restored editing state no
        // longer applies and is invalidated by the fresh draftId.
        const draftId = generateDraftId();
        set({ blob, draftId, canonicalVideoUrl: null });
        void saveVideoDraft(blob, buildMeta(draftId)).catch(() => {});
      } else {
        set({ blob: null, draftId: null, canonicalVideoUrl: null });
        void clearVideoDraft().catch(() => {});
      }
    },
    setSourceDuration: (sourceDuration) => {
      set({ sourceDuration });
      persistMetaIfDraft();
    },
    setTitle: (title) => {
      set({ title });
      persistMetaIfDraft();
    },
    setDescription: (description) => {
      set({ description });
      persistMetaIfDraft();
    },
    reset: () => {
      set({ blob: null, sourceDuration: 0, title: "", description: "", draftId: null, canonicalVideoUrl: null });
      void clearVideoDraft().catch(() => {});
    },
    // Rehydrates the in-memory blob from IndexedDB after a refresh. No-op if a
    // blob is already present or nothing was persisted.
    restoreBlob: () => {
      if (get().blob) {
        return;
      }
      void loadVideoDraft()
        .then((draft) => {
          if (!draft || get().blob) {
            return;
          }
          set({
            blob: draft.blob,
            draftId: draft.meta?.draftId ?? generateDraftId(),
            sourceDuration: draft.meta?.sourceDuration ?? 0,
            title: draft.meta?.title ?? "",
            description: draft.meta?.description ?? "",
            canonicalVideoUrl: draft.meta?.canonicalVideoUrl ?? null,
          });
        })
        .catch(() => {});
    },
  };
});
