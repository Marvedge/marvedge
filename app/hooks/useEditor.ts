import { useCallback, useRef, useState, useEffect } from "react";
import { useBlobStore } from "../store/blobStore";
import {
  videoTrimmer,
  videoToMP4WithOverlays,
  videoToThumbnail,
} from "../lib/ffmpeg";
import { ZoomEffect } from "../interfaces/editor/IZoomEffect";

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
      onProgress?: (progress: number) => void,
      zoomEffects?: ZoomEffect[]
    ) => {
      if (!blob) return;
      setProcessing(true);
      setError(null);
      try {
        const trimmedBlob = await videoTrimmer(
          blob,
          startOrSegments as string,
          end!
        );
        const trimmedUrl = URL.createObjectURL(trimmedBlob);
        setVideoUrl(trimmedUrl);

        let processedBlob: Blob = trimmedBlob;

        // Apply zoom effects if any
        if (zoomEffects && zoomEffects.length > 0) {
          console.log("Processing zoom effects:", zoomEffects);
          console.log("Original blob size:", trimmedBlob.size);

          // Use enhanced zoom processor
          const { createEnhancedZoomProcessor } = await import(
            "../lib/enhancedZoomProcessor"
          );
          processedBlob = await createEnhancedZoomProcessor(
            trimmedBlob,
            zoomEffects
          );

          console.log("Zoom effects processing completed");
          console.log("Processed blob size:", processedBlob.size);

          // Update the video URL to show the processed video with zoom effects
          const processedUrl = URL.createObjectURL(processedBlob);
          setVideoUrl(processedUrl);
        } else {
          console.log("No zoom effects to process");
        }

        let mp4Blob: Blob;

        if (currentOverlays.current.length > 0) {
          mp4Blob = await videoToMP4WithOverlays(
            processedBlob,
            currentOverlays.current
          );
        } else {
          const { videoToMP4 } = await import("../lib/ffmpeg");
          mp4Blob = await videoToMP4(processedBlob);
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
  };
};
