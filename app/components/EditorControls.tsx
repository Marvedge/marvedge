"use client";
import { useEffect, useState } from "react";

export type EditorControlsProps = {
  onTrim: (start: string, end: string) => void;
  processing: boolean;
};

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
};

const EditorControls = ({ onTrim, processing }: EditorControlsProps) => {
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);

  useEffect(() => {
    const video = document.querySelector("video");
    if (video) {
      video.onloadedmetadata = () => {
        const d = video.duration;
        const rounded = Math.floor(d);
        setDuration(rounded);
        setEnd(rounded > 10 ? 10 : rounded); // fallback default trim
      };
    }
  }, []);

  const handleTrim = () => {
    if (start >= end || duration === 0) {
      alert("Invalid trim range.");
      return;
    }
    const formattedStart = formatTime(start);
    const formattedEnd = formatTime(end);
    onTrim(formattedStart, formattedEnd);
  };

  return (
    <div className="space-y-6 bg-gray-100 p-4 rounded">
      <h2 className="font-bold text-lg">✂️ Trim Video</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium">Start Time: {formatTime(start)}</label>
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
        <label className="text-sm font-medium">End Time: {formatTime(end)}</label>
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
        {processing ? "Trimming..." : "✂️ Trim Clip"}
      </button>
    </div>
  );
};

export default EditorControls;

