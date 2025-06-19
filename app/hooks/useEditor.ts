import { useCallback, useState } from "react";
import { useBlobStore } from "../lib/blobStore";
import { videoTrimmer, videoToMP4, videoToThumbnail } from "../lib/ffmpeg";

export const useEditor = () => {
  const { blob } = useBlobStore();
  const [videoUrl, setVideoUrl] = useState(blob ? URL.createObjectURL(blob) : "");
  const [processing, setProcessing] = useState(false);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [clipName, setClipName] = useState("clip");
  const [clipNote, setClipNote] = useState("");

  const trimApplier = useCallback(async (start: string, end: string) => {
    if (!blob) return;
    setProcessing(true);
    const trimmedBlob = await videoTrimmer(blob, start, end);
    const newUrl = URL.createObjectURL(trimmedBlob);
    setVideoUrl(newUrl);

    const mp4Blob = await videoToMP4(trimmedBlob);
    setMp4Url(URL.createObjectURL(mp4Blob));

    const thumbBlob = await videoToThumbnail(trimmedBlob);
    setThumbnailUrl(URL.createObjectURL(thumbBlob));

    setProcessing(false);
  }, [blob]);

  const resetVideo = () => {
    if (blob) setVideoUrl(URL.createObjectURL(blob));
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
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
