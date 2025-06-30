import { create } from "zustand";

export const useBlobStore = create<{
  blob: Blob | null;
  setBlob: (blob: Blob | null) => void;
}>((set) => ({
  blob: null,
  setBlob: (blob) => set({ blob }),
}));