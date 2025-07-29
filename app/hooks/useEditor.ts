import { useCallback, useRef, useState, useEffect } from "react";
import { useBlobStore } from "../lib/blobStore";
import {
  videoTrimmer,
  videoToMP4WithOverlays,
  videoToThumbnail,
  multiSegmentTrimmer,
} from "../lib/ffmpeg";

type Overlay =
  | { type: "blur" | "rect"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x: number; y: number; x2: number; y2: number }
  | { type: "text"; x: number; y: number; text: string };

export const useEditor = () => {
  const { blob, title, description, restoreBlob } = useBlobStore();
  const [videoUrl, setVideoUrl] = useState(
    blob ? URL.createObjectURL(blob) : ""
  );
  const [processing, setProcessing] = useState(false);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [clipName, setClipName] = useState(title || "clip");
  const [clipNote, setClipNote] = useState(description || "");
  const [error, setError] = useState<string | null>(null); // <-- Add error state

  const thumbnailGenerated = useRef(false);

  const currentOverlays = useRef<Overlay[]>([]);
  const setOverlays = (list: Overlay[]) => {
    currentOverlays.current = list;
    localStorage.setItem("videoOverlays", JSON.stringify(list));
  };

  const loadOverlays = (): Overlay[] => {
    const stored = localStorage.getItem("videoOverlays");
    return stored ? JSON.parse(stored) : [];
  };

  useEffect(() => {
    if (!blob) {
      restoreBlob();
    }
  }, [blob, restoreBlob]);

  // Add a callback for when trimming is done
  const trimApplier = useCallback(
    async (
      startOrSegments: string | { start: string; end: string }[],
      end?: string,
      onDone?: (success: boolean) => void,
      onProgress?: (progress: number) => void
    ) => {
      if (!blob) return;
      setProcessing(true);
      setError(null);
      try {
        let trimmedBlob: Blob;
        if (Array.isArray(startOrSegments)) {
          trimmedBlob = await multiSegmentTrimmer(blob, startOrSegments, onProgress);
        } else {
          trimmedBlob = await videoTrimmer(blob, startOrSegments, end!);
        }
        const trimmedUrl = URL.createObjectURL(trimmedBlob);
        setVideoUrl(trimmedUrl);

        let mp4Blob: Blob;

        if (currentOverlays.current.length > 0) {
          mp4Blob = await videoToMP4WithOverlays(
            trimmedBlob,
            currentOverlays.current
          );
        } else {
          const { videoToMP4 } = await import("../lib/ffmpeg");
          mp4Blob = await videoToMP4(trimmedBlob);
        }

        setMp4Url(URL.createObjectURL(mp4Blob));

        if (!thumbnailGenerated.current) {
          const thumbBlob = await videoToThumbnail(trimmedBlob);
          setThumbnailUrl(URL.createObjectURL(thumbBlob));
          thumbnailGenerated.current = true;
        }
        setProcessing(false);
        if (onDone) onDone(true);
      } catch (err: unknown) {
        setProcessing(false);
        setError((err as Error)?.message || "Failed to trim video");
        if (onDone) onDone(false);
      }
    },
    [blob]
  );

  const resetVideo = () => {
    if (blob) setVideoUrl(URL.createObjectURL(blob));
  };

  const downloadBlob = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const setClipNameWithStore = (name: string) => {
    setClipName(name);
    useBlobStore.getState().setTitle(name);
  };

  const setClipNoteWithStore = (note: string) => {
    setClipNote(note);
    useBlobStore.getState().setDescription(note);
  };

  return {
    videoUrl,
    mp4Url,
    thumbnailUrl,
    processing,
    trimApplier,
    resetVideo,
    clipName,
    setClipName: setClipNameWithStore,
    clipNote,
    setClipNote: setClipNoteWithStore,
    downloadBlob,
    setOverlays,
    loadOverlays,
    error, // <-- return error state
    multiSegmentTrimmer,
  };
};
