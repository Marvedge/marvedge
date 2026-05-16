import { useEffect } from "react";
import ReactPlayer from "react-player";

interface UseVideoDurationProps {
  videoUrl: string | null;
  duration: number;
  recordingDuration: number;
  blob: Blob | null;
  playerRef: React.RefObject<ReactPlayer>;
  setDuration: (duration: number | ((prev: number) => number)) => void;
}

export function useVideoDuration({
  videoUrl,
  recordingDuration,
  blob,
  playerRef,
  setDuration,
}: UseVideoDurationProps) {
  const isBlobSource = !!videoUrl && videoUrl.startsWith("blob:");

  useEffect(() => {
    if (!videoUrl) {
      setDuration(0);
      return;
    }

    // For fresh local recordings, recorder duration is trustworthy and immediate.
    if (isBlobSource && recordingDuration > 0) {
      setDuration(Math.max(0, Math.floor(recordingDuration)));
      return;
    }

    // For saved/remote videos, always read real media metadata.
    const probe = blob && isBlobSource ? URL.createObjectURL(blob) : videoUrl;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      if (probe && blob && isBlobSource) {
        URL.revokeObjectURL(probe);
      }
    };

    video.onloadedmetadata = () => {
      const d = Number(video.duration);
      if (Number.isFinite(d) && d > 0) {
        setDuration(Math.floor(d));
      }
      cleanup();
    };

    video.onerror = () => {
      cleanup();
    };

    video.src = probe;
    video.load();

    return cleanup;
  }, [videoUrl, isBlobSource, recordingDuration, blob, setDuration, playerRef]);
}
