import { create } from "zustand";

export const useBlobStore = create<{
  blob: Blob | null;
  sourceDuration: number;
  title: string;
  description: string;
  setBlob: (blob: Blob | null) => void;
  setSourceDuration: (seconds: number) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  reset: () => void;
  restoreBlob: () => void;
}>((set) => ({
  blob: null,
  sourceDuration: 0,
  title: "",
  description: "",
  setBlob: (blob) => {
    set({ blob });
  },
  setSourceDuration: (sourceDuration) => set({ sourceDuration }),
  setTitle: (title) => set({ title }),
  setDescription: (description) => set({ description }),
  reset: () => set({ blob: null, sourceDuration: 0, title: "", description: "" }),
  restoreBlob: () => {},
}));
