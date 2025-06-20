"use client";
import { useEffect, useState, RefObject } from "react";

type EditorControlsProps = {
  onTrim: (start: string, end: string) => void;
  processing: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
};

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
};

const EditorControls = ({
  onTrim,
  processing,
  videoRef,
}: EditorControlsProps) => {
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const d = Math.floor(video.duration);
      setDuration(d);
      setEnd(d > 10 ? 10 : d);
    };

    const handleClickZoom = () => toggleZoom();

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("click", handleClickZoom);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("click", handleClickZoom);
    };
  }, [videoRef, zoomed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case "ArrowLeft":
          video.currentTime = Math.max(0, video.currentTime - 1);
          break;
        case "ArrowRight":
          video.currentTime = Math.min(duration, video.currentTime + 1);
          break;
        case "[":
          setStart((prev) => Math.max(0, prev - 1));
          break;
        case "]":
          setEnd((prev) => Math.min(duration, prev + 1));
          break;
        case "Enter":
          handleTrim();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration, processing, videoRef]);

  const handleTrim = () => {
    if (start >= end || duration === 0) {
      alert("Invalid trim range.");
      return;
    }
    onTrim(formatTime(start), formatTime(end));
  };

  const toggleZoom = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!zoomed) {
      video.style.transform = "scale(1.5)";
      video.style.transformOrigin = "center";
      video.style.transition = "transform 0.3s ease";
    } else {
      video.style.transform = "scale(1)";
      video.style.transformOrigin = "initial";
      video.style.transition = "transform 0.3s ease";
    }
    setZoomed(!zoomed);
  };

  return (
    <div className="space-y-6 bg-gray-100 p-4 rounded">
      <h2 className="font-bold text-lg">Trim Video</h2>

      <button
        onClick={toggleZoom}
        className="bg-indigo-600 text-white px-3 py-1 rounded"
      >
        {zoomed ? "🔍 Zoom Out" : "🔎 Zoom In"}
      </button>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Start Time: {formatTime(start)}
        </label>
        <input
          type="range"
          min={0}
          max={end - 1}
          value={start}
          onChange={(e) => setStart(Number(e.target.value))}
          disabled={processing}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          End Time: {formatTime(end)}
        </label>
        <input
          type="range"
          min={start + 1}
          max={duration}
          value={end}
          onChange={(e) => setEnd(Number(e.target.value))}
          disabled={processing}
          className="w-full"
        />
      </div>

      <button
        onClick={handleTrim}
        disabled={processing || start >= end}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {processing ? "Trimming..." : "✂️ Trim Video"}
      </button>

      <p className="text-xs text-gray-500">
        ⌨️ Use <kbd>←</kbd>/<kbd>→</kbd> to seek, <kbd>[</kbd>/<kbd>]</kbd> to
        adjust trim
        <br />
        🖱️ Click on the video to toggle zoom
      </p>
    </div>
  );
};

export default EditorControls;
