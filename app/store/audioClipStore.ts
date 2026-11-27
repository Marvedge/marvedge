// Client state for the audio upload & trim panel (GitHub #285).
//
// Follows the Zustand pattern in demosStore/editorStore: all API calls live in
// the store so components stay dumb. Uploads run through a pre-signed PUT (from
// POST /api/demos/:id/audio/presign) followed by POST /confirm — the same
// two-step flow the server enforces.

import { create } from "zustand";
import axios from "axios";
import type { AudioClipDto } from "@/app/types/audio";

export interface ActiveUpload {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "confirming" | "error";
  error?: string;
  clipId?: string;
}

/**
 * Where a clip sits on the video timeline (seconds). `len` may exceed the
 * source length — the preview layer loops the trimmed source to fill it.
 */
export interface ClipPlacement {
  start: number;
  len: number;
}

/** Minimum width (seconds) an audio block can be resized down to. */
export const MIN_AUDIO_CLIP_LEN_SEC = 0.1;

/** Length of the playable (trimmed) source material in seconds. */
export function getSourceLengthSec(clip: AudioClipDto): number {
  const end = Math.min(clip.trimEndSec ?? Infinity, clip.durationSec ?? Infinity);
  const playableEnd = Number.isFinite(end) ? end : 0;
  return Math.max(MIN_AUDIO_CLIP_LEN_SEC, playableEnd - clip.trimStartSec);
}

/**
 * Timeline window for a clip. Falls back to the legacy behaviour — spanning
 * the trim window — when the user has not dragged the clip yet.
 */
export function getClipTimelineWindow(
  clip: AudioClipDto,
  placements: Record<string, ClipPlacement>
): ClipPlacement {
  const override = placements[clip.id];
  if (override) {
    return override;
  }
  return { start: clip.trimStartSec, len: getSourceLengthSec(clip) };
}

interface AudioClipStore {
  clips: AudioClipDto[];
  loading: boolean;
  error: string | null;
  uploads: ActiveUpload[];
  /** Client-side timeline placement per clip id. Session state, not persisted. */
  placements: Record<string, ClipPlacement>;
  /** Clip currently selected on the timeline (drives the toolbar Delete). */
  selectedTimelineClipId: string | null;

  fetchClips: (demoId: string) => Promise<void>;
  uploadFile: (demoId: string, file: File) => Promise<void>;
  cancelUpload: (uploadId: string) => void;
  renameClip: (clipId: string, fileName: string) => Promise<void>;
  reorderClip: (clipId: string, order: number) => Promise<void>;
  deleteClip: (clipId: string) => Promise<void>;
  requestTrim: (clipId: string, trimStartSec: number, trimEndSec: number) => Promise<void>;
  setClipPlacement: (clipId: string, placement: ClipPlacement) => void;
  selectTimelineClip: (clipId: string | null) => void;
  clearUploads: () => void;
  reset: () => void;
}

const initialState = {
  clips: [] as AudioClipDto[],
  loading: false,
  error: null as string | null,
  uploads: [] as ActiveUpload[],
  placements: {} as Record<string, ClipPlacement>,
  selectedTimelineClipId: null as string | null,
};

const controllers = new Map<string, AbortController>();
let clipListRevision = 0;
let clipListScope: { demoId: string; requested: number; applied: number } | undefined;

/**
 * Read the media duration client-side via an <audio> element. Sent along with
 * /confirm so testing mode (no server-side ffprobe) can finalize clips inline.
 */
function readAudioDuration(file: File, signal: AbortSignal): Promise<number | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new axios.CanceledError("Audio upload cancelled"));
      return;
    }

    const url = URL.createObjectURL(file);
    const audio = new Audio();

    const releaseAudio = () => {
      signal.removeEventListener("abort", cancel);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
    const cancel = () => {
      releaseAudio();
      reject(new axios.CanceledError("Audio upload cancelled"));
    };
    const finish = (duration: number | null) => {
      releaseAudio();
      resolve(duration);
    };

    signal.addEventListener("abort", cancel);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

/** presign → pre-signed PUT (with progress) → confirm. Throws on failure. */
async function performUpload(
  demoId: string,
  file: File,
  signal: AbortSignal,
  onPresign: (clipId: string) => void,
  onProgress: (percent: number) => void
): Promise<void> {
  const presign = await axios.post(`/api/demos/${demoId}/audio/presign`, {
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    size: file.size,
  });
  const { clipId, uploadUrl } = presign.data as { clipId: string; uploadUrl: string };
  onPresign(clipId);

  await axios.put(uploadUrl, file, {
    headers: { "Content-Type": file.type || "audio/mpeg" },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
    signal,
    maxBodyLength: Infinity,
  });

  const durationSec = await readAudioDuration(file, signal);
  const confirmUrl = `/api/audio/${clipId}/confirm`;
  try {
    await axios.post(confirmUrl, { durationSec }, { signal });
  } catch (error) {
    if (signal.aborted || !axios.isAxiosError(error) || error.response?.status !== 503) {
      throw error;
    }
    await axios.post(confirmUrl, { durationSec }, { signal });
  }
}

/** Best-effort drop of the clip row an aborted/failed upload left behind. */
async function cleanupClipRow(clipId?: string): Promise<void> {
  if (!clipId) {
    return;
  }
  try {
    await axios.delete(`/api/audio/${clipId}`);
  } catch {
    // The server's own cleanup path may already have run.
  }
}

export const useAudioClipStore = create<AudioClipStore>((set, get) => ({
  ...initialState,

  fetchClips: async (demoId) => {
    const scope =
      clipListScope?.demoId === demoId ? clipListScope : { demoId, requested: 0, applied: 0 };
    clipListScope = scope;
    const request = ++scope.requested;

    set({ loading: true });
    try {
      const response = await axios.get(`/api/demos/${demoId}/audio`);
      if (clipListScope !== scope || request < scope.applied) {
        return;
      }
      scope.applied = request;
      clipListRevision += 1;
      set({ clips: response.data.clips || [], error: null });
    } catch (err: unknown) {
      if (clipListScope === scope && request === scope.requested) {
        scope.applied = request;
        console.error("Error fetching audio clips:", err);
        set({ error: "Failed to load audio clips" });
      }
    } finally {
      if (clipListScope === scope && request === scope.requested) {
        set({ loading: false });
      }
    }
  },

  uploadFile: async (demoId, file) => {
    const uploadId = crypto.randomUUID();
    const controller = new AbortController();
    controllers.set(uploadId, controller);

    set((state) => ({
      uploads: [
        ...state.uploads,
        { id: uploadId, fileName: file.name, progress: 0, status: "uploading" },
      ],
    }));

    const patchUpload = (patch: Partial<ActiveUpload>) =>
      set((state) => ({
        uploads: state.uploads.map((u) => (u.id === uploadId ? { ...u, ...patch } : u)),
      }));

    try {
      await performUpload(
        demoId,
        file,
        controller.signal,
        (clipId) => patchUpload({ clipId }),
        (percent) => patchUpload({ progress: percent })
      );
      patchUpload({ status: "confirming", progress: 100 });
      controllers.delete(uploadId);
      set((state) => ({
        uploads: state.uploads.filter((u) => u.id !== uploadId),
      }));
      await get().fetchClips(demoId);
    } catch (err: unknown) {
      controllers.delete(uploadId);
      const clipId = get().uploads.find((u) => u.id === uploadId)?.clipId;
      if (axios.isCancel(err)) {
        // User cancelled — remove the row and clean up the clip we created.
        set((state) => ({ uploads: state.uploads.filter((u) => u.id !== uploadId) }));
      } else {
        patchUpload({
          status: "error",
          error: axios.isAxiosError(err)
            ? (err.response?.data?.error ?? "Upload failed")
            : "Upload failed",
        });
      }
      // A failed/aborted upload leaves a stale UPLOADING row — drop it.
      await cleanupClipRow(clipId);
      if (clipId) {
        await get().fetchClips(demoId);
      }
    }
  },

  cancelUpload: (uploadId) => {
    controllers.get(uploadId)?.abort();
  },

  renameClip: async (clipId, fileName) => {
    const previous = get().clips.find((c) => c.id === clipId);
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clipId ? { ...c, fileName } : c)),
    }));
    try {
      await axios.patch(`/api/audio/${clipId}`, { fileName });
    } catch (err: unknown) {
      if (previous) {
        set((state) => ({
          clips: state.clips.map((c) => (c.id === clipId ? previous : c)),
        }));
      }
      console.error("Error renaming audio clip:", err);
      set({ error: "Failed to rename clip" });
      throw err;
    }
  },

  reorderClip: async (clipId, order) => {
    try {
      const response = await axios.patch(`/api/audio/${clipId}/reorder`, { order });
      const updated = response.data.clip as AudioClipDto;
      set((state) => ({
        clips: state.clips
          .map((c) => (c.id === clipId ? updated : c))
          .sort((a, b) => a.order - b.order),
      }));
    } catch (err: unknown) {
      console.error("Error reordering audio clip:", err);
      set({ error: "Failed to reorder clip" });
      throw err;
    }
  },

  deleteClip: async (clipId) => {
    const removed = get().clips.find((clip) => clip.id === clipId);
    const revision = clipListRevision;
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== clipId),
      selectedTimelineClipId:
        state.selectedTimelineClipId === clipId ? null : state.selectedTimelineClipId,
    }));
    try {
      await axios.delete(`/api/audio/${clipId}`);
    } catch (err: unknown) {
      if (removed && revision === clipListRevision) {
        set((state) => {
          if (state.clips.some((clip) => clip.id === clipId)) {
            return state;
          }
          return {
            clips: [...state.clips, removed].sort(
              (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)
            ),
          };
        });
      }
      console.error("Error deleting audio clip:", err);
      set({ error: "Failed to delete clip" });
      throw err;
    }
  },

  requestTrim: async (clipId, trimStartSec, trimEndSec) => {
    try {
      const response = await axios.patch(`/api/audio/${clipId}/trim`, {
        trimStartSec,
        trimEndSec,
      });
      const updated = response.data.clip as AudioClipDto;
      set((state) => ({
        clips: state.clips.map((c) => (c.id === clipId ? updated : c)),
      }));
    } catch (err: unknown) {
      console.error("Error trimming audio clip:", err);
      set({
        error: axios.isAxiosError(err)
          ? (err.response?.data?.error ?? "Trim failed")
          : "Trim failed",
      });
      throw err;
    }
  },

  setClipPlacement: (clipId, placement) => {
    set((state) => ({
      placements: { ...state.placements, [clipId]: placement },
    }));
  },

  selectTimelineClip: (clipId) => set({ selectedTimelineClipId: clipId }),

  clearUploads: () => set({ uploads: [] }),
  reset: () => {
    clipListScope = undefined;
    clipListRevision += 1;
    set({ ...initialState });
  },
}));
