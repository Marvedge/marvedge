import { useCallback, useState } from "react";
import { useBlobStore } from "../lib/blobStore";
import {
  videoTrimmer,
  videoToMP4WithOverlays,
  videoToThumbnail,
} from "../lib/ffmpeg";

// Reuse this type from your overlay-enabled editor
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

  const trimApplier = useCallback(
    async (start: string, end: string, overlays?: Overlay[]) => {
      if (!blob) return;
      setProcessing(true);

      const trimmedBlob = await videoTrimmer(blob, start, end);
      const trimmedUrl = URL.createObjectURL(trimmedBlob);
      setVideoUrl(trimmedUrl);

      let mp4Blob: Blob;

      if (overlays && overlays.length > 0) {
        mp4Blob = await videoToMP4WithOverlays(trimmedBlob, overlays);
      } else {
        const { videoToMP4 } = await import("../lib/ffmpeg");
        mp4Blob = await videoToMP4(trimmedBlob);
      }

      setMp4Url(URL.createObjectURL(mp4Blob));

      const thumbBlob = await videoToThumbnail(trimmedBlob);
      setThumbnailUrl(URL.createObjectURL(thumbBlob));

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
  };
};
