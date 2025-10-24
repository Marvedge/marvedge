"use client";
import { Button } from "@/app/components/ui/button";
import { useEffect, useState, RefObject, useCallback } from "react";
import { formatTimeFull } from "@/app/lib/dateTimeUtils";

type EditorControlsProps = {
  onTrim: (start: string, end: string) => void;
  processing: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  duration: number;
};

const EditorControls = ({ onTrim, processing, videoRef, duration }: EditorControlsProps) => {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);
  const [zoomed, setZoomed] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState("00:00:00");
  const [endTimeInput, setEndTimeInput] = useState("00:00:10");
  // Update input fields when slider values change
  useEffect(() => {
    setStartTimeInput(formatTimeFull(start));
  }, [start]);

  useEffect(() => {
    setEndTimeInput(formatTimeFull(end));
  }, [end]);

  const toggleZoom = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!zoomed) {
      video.style.transform = "scale(1.5)";
      video.style.transformOrigin = "center";
      video.style.transition = "transform 0.3s ease";
    } else {
      video.style.transform = "scale(1)";
      video.style.transformOrigin = "initial";
      video.style.transition = "transform 0.3s ease";
    }
    setZoomed((z) => !z);
  }, [videoRef, zoomed]);

  const handleTrim = useCallback(() => {
    if (isNaN(duration) || duration === 0) {
      alert("Video duration not loaded yet.");
      return;
    }

    if (start >= end) {
      alert("Invalid trim range: Start must be less than End.");
      return;
    }

    onTrim(formatTimeFull(start), formatTimeFull(end));
  }, [start, end, duration, onTrim]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) {
        return;
      }
      const video = videoRef.current;
      if (!video) {
        return;
      }

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
  }, [duration, processing, videoRef, handleTrim]);

  return (
    <div className="space-y-6 bg-white border border-gray-200 rounded-2xl shadow-md p-6">
      <h2 className="font-semibold text-xl text-gray-800">🎛️ Trim Controls</h2>

      <div className="space-y-2">
        <div className="flex flex-row gap-2 flex-wrap">
          <Button
            onClick={toggleZoom}
            className=" bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition"
          >
            {zoomed ? "🔍 Zoom Out" : "🔎 Zoom In"}
          </Button>

          <Button
            onClick={handleTrim}
            disabled={processing || start >= end}
            className={` text-white transition ${
              processing || start >= end
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {processing ? "⏳ Trimming..." : "✂️ Trim Video"}
          </Button>
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ⏱ Start Time: <span className="font-mono">{formatTimeFull(start)}</span>
          </label>

          {/* Manual input for start time */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"></div>
                <input
                  type="text"
                  value={startTimeInput}
                  readOnly
                  placeholder="00:00:00"
                  disabled={processing}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm font-mono bg-gray-50 shadow-sm transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed cursor-default"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <span className="text-xs text-gray-400 font-medium">HH:MM:SS</span>
                </div>
              </div>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, end - 1)}
            value={start}
            onChange={(e) => {
              const val = Number(e.target.value);
              setStart(val);
              if (val >= end) {
                setEnd(val + 1 <= duration ? val + 1 : duration);
              }
            }}
            disabled={processing}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>

        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ⏲ End Time: <span className="font-mono">{formatTimeFull(end)}</span>
          </label>

          {/* Manual input for end time */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"></div>
                <input
                  type="text"
                  value={endTimeInput}
                  readOnly
                  placeholder="00:00:10"
                  disabled={processing}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm font-mono bg-gray-50 shadow-sm transition-all duration-200 disabled:bg-gray-50 disabled:cursor-not-allowed cursor-default"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <span className="text-xs text-gray-400 font-medium">HH:MM:SS</span>
                </div>
              </div>
            </div>
          </div>

          <input
            type="range"
            min={start + 1}
            max={duration}
            value={end}
            onChange={(e) => {
              const val = Number(e.target.value);
              setEnd(val);
              if (val <= start) {
                setStart(val - 1 >= 0 ? val - 1 : 0);
              }
            }}
            disabled={processing}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>
      </div>

      <div className="text-xs text-gray-500 mt-6 border-t pt-4">
        <p className="mb-1 font-semibold">⌨️ Keyboard Shortcuts:</p>
        <ul className="list-disc list-inside leading-5">
          <li>
            <kbd className="kbd">←</kbd> / <kbd className="kbd">→</kbd> — Seek video
          </li>
          <li>
            <kbd className="kbd">[</kbd> / <kbd className="kbd">]</kbd> — Adjust trim range
          </li>
          <li>
            <kbd className="kbd">Enter</kbd> — Apply trim
          </li>
          <li>🖱️ Click on video to toggle zoom</li>
        </ul>
        <p className="mt-2 text-xs">
          💡 <strong>Tip:</strong> Use the sliders above to adjust the trim range. Input fields are
          read-only and update automatically.
        </p>
      </div>
    </div>
  );
};

export default EditorControls;
