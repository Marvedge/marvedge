import { create } from "zustand";

export const useBlobStore = create<{
  blob: Blob | null;
  title: string;
  description: string;
  setBlob: (blob: Blob | null) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  reset: () => void;
  restoreBlob: () => void;
}>((set) => ({
  blob: null,
  title: "",
  description: "",
  setBlob: (blob) => {
    set({ blob });
    if (blob) {
      const reader = new FileReader();
      reader.onload = () => {
        localStorage.setItem("uploadedVideo", reader.result as string);
      };
      reader.readAsDataURL(blob);
    } else {
      localStorage.removeItem("uploadedVideo");
    }
  },
  setTitle: (title) => set({ title }),
  setDescription: (description) => set({ description }),
  reset: () => set({ blob: null, title: "", description: "" }),
  restoreBlob: () => {
    const dataUrl = localStorage.getItem("uploadedVideo");
    if (dataUrl) {
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          set({ blob });
        });
    }
  },
}));
