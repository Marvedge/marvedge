import { useCallback, useRef, useState } from "react";
import { useBlobStore } from "../lib/blobStore";
import {
  videoTrimmer,
  videoToMP4WithOverlays,
  videoToThumbnail,
} from "../lib/ffmpeg";

type Overlay =
  | { type: "blur" | "rect"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x: number; y: number; x2: number; y2: number }
  | { type: "text"; x: number; y: number; text: string };

export const useEditor = () => {
  const { blob } = useBlobStore();
  const [videoUrl, setVideoUrl] = useState(blob ? URL.createObjectURL(blob) : "");
  const [processing, setProcessing] = useState(false);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [clipName, setClipName] = useState("clip");
  const [clipNote, setClipNote] = useState("");

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

  const trimApplier = useCallback(
    async (start: string, end: string) => {
      if (!blob) return;
      setProcessing(true);

      const trimmedBlob = await videoTrimmer(blob, start, end);
      const trimmedUrl = URL.createObjectURL(trimmedBlob);
      setVideoUrl(trimmedUrl);

      let mp4Blob: Blob;

      if (currentOverlays.current.length > 0) {
        mp4Blob = await videoToMP4WithOverlays(trimmedBlob, currentOverlays.current);
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

  return {
    videoUrl,
    mp4Url,
    thumbnailUrl,
    processing,
    trimApplier,
    resetVideo,
    clipName,
    setClipName,
    clipNote,
    setClipNote,
    downloadBlob,
    setOverlays,
    loadOverlays,
  };
};