import { create } from "zustand";

export const useBlobStore = create<{
  blob: Blob | null;
  title: string;
  description: string;
  setBlob: (blob: Blob | null) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  reset: () => void;
}>((set) => ({
  blob: null,
  title: "",
  description: "",
  setBlob: (blob) => set({ blob }),
  setTitle: (title) => set({ title }),
  setDescription: (description) => set({ description }),
  reset: () => set({ blob: null, title: "", description: "" }),
}));
