"use client";
import Image from "next/image";
import React, { useCallback, useState, useEffect, useRef } from "react";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import ReactPlayer from "react-player";
import { defaultFormatTime } from "@/app/lib/dateTimeUtils";
import { ZoomEffect } from "../types/editor/zoom-effect";
import { toggleZoom, trianglePoints } from "../lib/utils";

interface TrimSegment {
  start: number;
  end: number;
}

// interface ZoomEffect {
//   id: string;
//   startTime: number;
//   endTime: number;
//   zoomLevel: number;
// }

interface TimelineSliderProps {
  duration: number; // Duration in seconds
  formatTime?: (seconds: number) => string; // Custom time formatter
  onTimeChange?: (time: number) => void; // Callback when time changes
  ontrim: (segments: { start: string; end: string }[]) => void;
  processing: boolean;
  playerRef: React.RefObject<ReactPlayer | null>;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  onResetVideo?: () => void;
  setProgress?: (progress: number) => void; // new prop
  zoomEffects?: ZoomEffect[];
  onZoomEffectCreate?: (effect: ZoomEffect) => void;
  onZoomEffectRemove?: (id: string) => void;
  externalStartTime?: number;
  externalEndTime?: number;
  onExternalTimeChange?: (start: number, end: number) => void;
  // New prop for initial segments
  initialSegments?: { start: string; end: string }[];
  // New prop for segment change callback
  onSegmentsChange?: (segments: { start: string; end: string }[]) => void;
}

export function TimelineSlider({
  duration,
  formatTime,
  onTimeChange,
  ontrim,
  processing,
  playerRef,
  currentTime,
  setCurrentTime,
  onResetVideo,
  setProgress,
  zoomEffects = [],
  onZoomEffectCreate,
  onZoomEffectRemove,
  onExternalTimeChange,
  initialSegments,
  onSegmentsChange,
}: TimelineSliderProps) {
  const [segments, setSegments] = useState<TrimSegment[]>([
    { start: 0, end: duration || 80.0 }, // Dynamic end based on duration
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoomed, setzoomed] = useState(false);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [progress] = useState(0);

  // Undo/Redo state management
  const [removedSegments, setRemovedSegments] = useState<TrimSegment[]>([]);
  const [removedActiveIdx, setRemovedActiveIdx] = useState<number[]>([]);

  // Drag and drop state for segment reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hasBeenTrimmed, setHasBeenTrimmed] = useState(false);

  useEffect(() => {
    if (setProgress) {
      setProgress(progress);
    }
  }, [progress, setProgress]);

  useEffect(() => {
    console.log(
      "Current state - segments:",
      segments.length,
      "removedSegments:",
      removedSegments.length
    );
    console.log("Segments:", segments);
  }, [segments.length, removedSegments.length, segments]);

  useEffect(() => {
    console.log(
      "Current state - segments:",
      segments.length,
      "removedSegments:",
      removedSegments.length
    );
    console.log("Segments:", segments);
  }, [segments.length, removedSegments.length, segments]);

  // Update segments when duration changes or when initialSegments are provided
  useEffect(() => {
    if (duration > 0) {
      if (initialSegments && initialSegments.length > 0) {
        // Convert time string format to numbers for internal use
        const convertedSegments = initialSegments.map((seg) => {
          const startSeconds = convertTimeStringToSeconds(seg.start);
          const endSeconds = convertTimeStringToSeconds(seg.end);
          return {
            start: startSeconds,
            end: endSeconds,
          };
        });
        setSegments(convertedSegments);
      } else {
        setSegments((prev) => {
          const updated = [...prev];
          updated[0] = { start: 0, end: duration };
          return updated;
        });
      }
    }
  }, [duration, initialSegments]);

  const timeFormatter = formatTime || defaultFormatTime;

  // Helper function to convert time string to seconds
  const convertTimeStringToSeconds = (timeString: string): number => {
    const parts = timeString.split(":");
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };

  // Call onSegmentsChange when segments change
  useEffect(() => {
    if (onSegmentsChange) {
      const formattedSegments = segments.map((seg) => ({
        start: timeFormatter(seg.start),
        end: timeFormatter(seg.end),
      }));
      onSegmentsChange(formattedSegments);
    }
  }, [segments, onSegmentsChange, timeFormatter]);

  const handleToggleZoom = useCallback(() => {
    toggleZoom(onZoomEffectCreate, currentTime, duration || 80.0, setzoomed);
  }, [onZoomEffectCreate, currentTime, duration, setzoomed]);

  const handleTrim = useCallback(() => {
    if (isNaN(duration) || duration === 0) {
      alert("Video duration not loaded yet.");
      return;
    }
    if (segments.some((seg) => seg.start >= seg.end)) {
      alert("Invalid trim range in one or more segments.");
      return;
    }
    ontrim(
      segments.map((seg) => ({
        start: timeFormatter(seg.start),
        end: timeFormatter(seg.end),
      }))
    );
    setHasBeenTrimmed(true);
  }, [segments, duration, ontrim, timeFormatter]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // console.log("Drag start:", index);
    setDragIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", index.toString());
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 10, 10);
    }
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    // console.log("Drop:", dragIndex, "to", dropIndex);
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      setIsDragging(false);
      return;
    }

    const newSegments = [...segments];
    const draggedSegment = newSegments[dragIndex];
    newSegments.splice(dragIndex, 1);
    newSegments.splice(dropIndex, 0, draggedSegment);

    setSegments(newSegments);

    if (activeIdx === dragIndex) {
      setActiveIdx(dropIndex);
    } else if (activeIdx > dragIndex && activeIdx <= dropIndex) {
      setActiveIdx(activeIdx - 1);
    } else if (activeIdx < dragIndex && activeIdx >= dropIndex) {
      setActiveIdx(activeIdx + 1);
    }

    setDragIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
  };

  const handleDragEnd = () => {
    // console.log("Drag end");
    setDragIndex(null);
    setDragOverIndex(null);
    setTimeout(() => setIsDragging(false), 100);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (mouseStartPos && !isDragging) {
      const deltaX = Math.abs(e.clientX - mouseStartPos.x);
      const deltaY = Math.abs(e.clientY - mouseStartPos.y);
      if (deltaX > 5 || deltaY > 5) {
        // console.log("Mouse drag start:", index);
        setDragIndex(index);
        setIsDragging(true);
        setMouseStartPos(null);
      }
    }
  };

  const handleMouseUp = () => {
    setMouseStartPos(null);
  };

  const [svgWidth, setSvgWidth] = useState(800);
  const height = 90;
  const margin = 40;
  const timelineY = 40;
  const timelineHeight = 12; // Matches Figma ruler thickness
  const handleWidth = 20; // Matches Figma triangle base
  const handleHeight = 24; // Matches Figma triangle height
  const rulerColor = "#A594F9"; // Figma purple
  const trimColor = "#E6E1FA"; // Light background
  const handleColor = "#A594F9"; // Figma handle color
  const tickColor = "#A594F9";
  const labelColor = "#A594F9";

  const timeToX = (t: number) => {
    if (isNaN(t) || isNaN(duration) || duration === 0) {
      return margin;
    }
    const x = margin + ((svgWidth - 2 * margin) * t) / duration;
    return Math.max(margin, Math.min(svgWidth - margin, x));
  };

  const xToTime = useCallback(
    (x: number) => {
      const clamped = Math.max(margin, Math.min(svgWidth - margin, x));
      return ((clamped - margin) / (svgWidth - 2 * margin)) * (duration || 80.0);
    },
    [duration, margin, svgWidth]
  );

  useEffect(() => {
    const updateWidth = () => {
      if (svgRef.current) {
        setSvgWidth(svgRef.current.getBoundingClientRect().width);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const updateSegment = useCallback(
    (key: "start" | "end", value: number) => {
      // console.log(
      //   "Updating segment:",
      //   key,
      //   "to",
      //   value,
      //   "for activeIdx:",
      //   activeIdx
      // );
      setSegments((segs) => {
        const updated = segs.map((seg, i) => (i === activeIdx ? { ...seg, [key]: value } : seg));
        return updated;
      });
    },
    [activeIdx]
  );

  const start = segments[activeIdx]?.start ?? 0;
  const end = segments[activeIdx]?.end ?? (duration || 80.0);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    // console.log("Dragging started:", dragging);

    const onMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      if (e instanceof MouseEvent) {
        clientX = e.clientX;
      } else if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX;
      }
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const x = clientX - rect.left;
      let newTime = xToTime(x);
      newTime = Math.max(0, Math.min(duration || 80.0, newTime));

      if (dragging === "start") {
        if (newTime >= end) {
          newTime = end - 0.01;
        }
        updateSegment("start", newTime);
        onTimeChange?.(newTime);
        setCurrentTime(newTime);
        // Force immediate video frame update during dragging
        if (playerRef?.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            // Set time directly and force a frame update
            player.currentTime = newTime;
            // Force the video to update by triggering a seek event
            player.dispatchEvent(new Event("seeking"));
          }
        }

        // Always notify parent
        if (onExternalTimeChange) {
          onExternalTimeChange(newTime, end);
        }
      } else if (dragging === "end") {
        if (newTime <= start) {
          newTime = start + 0.01;
        }
        updateSegment("end", newTime);
        onTimeChange?.(newTime);
        setCurrentTime(newTime);
        // Force immediate video frame update during dragging
        if (playerRef?.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            // Set time directly and force a frame update
            player.currentTime = newTime;
            // Force the video to update by triggering a seek event
            player.dispatchEvent(new Event("seeking"));
          }
        }

        // Always notify parent
        if (onExternalTimeChange) {
          onExternalTimeChange(start, newTime);
        }
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [
    dragging,
    start,
    end,
    duration,
    onTimeChange,
    playerRef,
    setCurrentTime,
    xToTime,
    updateSegment,
    activeIdx,
    onExternalTimeChange,
  ]);

  const handleTimelineClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const x = e.clientX - rect.left;
    let seekTime = xToTime(x);
    seekTime = Math.max(0, Math.min(duration || 80.0, seekTime));
    playerRef?.current?.seekTo(seekTime, "seconds");
    setCurrentTime(seekTime);

    // Force immediate video frame update
    if (playerRef?.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        // Set time directly and force a frame update
        player.currentTime = seekTime;
        // Force the video to update by triggering a seek event
        player.dispatchEvent(new Event("seeking"));
        playerRef.current.seekTo(seekTime, "seconds");
      }
    }
  };

  const handleUndo = useCallback(() => {
    if (segments.length > 1) {
      const lastSegment = segments[segments.length - 1];
      setRemovedSegments((prev) => [...prev, lastSegment]);
      setRemovedActiveIdx((prev) => [...prev, activeIdx]);
      setSegments((prev) => prev.slice(0, -1));
      setActiveIdx(Math.min(activeIdx, segments.length - 2));
    }
  }, [segments, activeIdx, setRemovedSegments, setRemovedActiveIdx, setSegments, setActiveIdx]);

  const handleRedo = useCallback(() => {
    if (removedSegments.length > 0) {
      const segmentToRestore = removedSegments[removedSegments.length - 1];
      const activeIdxToRestore = removedActiveIdx[removedActiveIdx.length - 1];
      setSegments((prev) => [...prev, segmentToRestore]);
      setActiveIdx(activeIdxToRestore);
      setRemovedSegments((prev) => prev.slice(0, -1));
      setRemovedActiveIdx((prev) => prev.slice(0, -1));
    }
  }, [
    removedSegments,
    removedActiveIdx,
    setSegments,
    setActiveIdx,
    setRemovedSegments,
    setRemovedActiveIdx,
  ]);

  const addSegment = () => {
    setSegments([...segments, { start: 0, end: duration || 80.0 }]);
    setActiveIdx(segments.length);
  };

  const removeSegment = (idx: number) => {
    if (segments.length > 1) {
      const newSegments = segments.filter((_, i) => i !== idx);
      setSegments(newSegments);
      setActiveIdx(Math.min(activeIdx, newSegments.length - 1));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) {
        return;
      }
      switch (e.key) {
        case "ArrowLeft":
          const newTimeLeft = Math.max(0, currentTime - 1);
          setCurrentTime(newTimeLeft);

          // Force immediate video frame update
          if (playerRef?.current) {
            const player = playerRef.current.getInternalPlayer();
            if (player) {
              // Set time directly and force a frame update
              player.currentTime = newTimeLeft;
              // Force the video to update by triggering a seek event
              player.dispatchEvent(new Event("seeking"));
              playerRef.current.seekTo(newTimeLeft, "seconds");
            }
          }
          break;
        case "ArrowRight":
          const newTimeRight = Math.min(duration, currentTime + 1);
          setCurrentTime(newTimeRight);

          // Force immediate video frame update
          if (playerRef?.current) {
            const player = playerRef.current.getInternalPlayer();
            if (player) {
              // Set time directly and force a frame update
              player.currentTime = newTimeRight;
              // Force the video to update by triggering a seek event
              player.dispatchEvent(new Event("seeking"));
              playerRef.current.seekTo(newTimeRight, "seconds");
            }
          }
          break;
        case "[":
          updateSegment("start", Math.max(0, start - 1));
          break;
        case "]":
          updateSegment("end", Math.min(duration || 80.0, end + 1));
          break;
        case "Enter":
          handleTrim();
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case "y":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleRedo();
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    duration,
    processing,
    playerRef,
    handleTrim,
    end,
    start,
    currentTime,
    setCurrentTime,
    updateSegment,
    handleUndo,
    handleRedo,
  ]);

  // Major ticks (every 20 seconds), minor ticks (every 5 seconds), and micro ticks (every 1 second)
  const majorTickCount = 5; // 0, 20, 40, 60, 80 (or dynamic duration)
  const minorTickInterval = 5; // Minor ticks every 5 seconds
  const microTickInterval = 1; // Micro ticks every 1 second for finer granularity

  const majorTicks = Array.from({ length: majorTickCount }, (_, i) => {
    const t = ((duration || 80.0) * i) / (majorTickCount - 1);
    return {
      time: t,
      x: timeToX(t),
      label: t.toFixed(2),
    };
  });

  const minorTicks: { time: number; x: number }[] = [];
  for (let i = 0; i <= (duration || 80.0); i += minorTickInterval) {
    minorTicks.push({
      time: i,
      x: timeToX(i),
    });
  }

  const microTicks: { time: number; x: number }[] = [];
  for (let i = 0; i <= (duration || 80.0); i += microTickInterval) {
    microTicks.push({
      time: i,
      x: timeToX(i),
    });
  }

  return (
    <Card className="p-6 w-full max-w-6xl border-2 border-[#E6E1FA] shadow-lg">
      <div className="space-y-6">
        {progress > 0 && progress < 100 && (
          <div className="w-full h-2 bg-gray-200 rounded mb-2 overflow-hidden">
            <div className="h-full bg-[#7C5CFC] transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex flex-row flex-wrap gap-2 sm:gap-4 mb-4 w-full">
          <div className="flex gap-2 sm:gap-4">
            <Button
              variant="outline"
              onClick={handleToggleZoom}
              className="min-w-[90px] h-8 px-3 flex items-center gap-2 font-semibold text-sm"
            >
              <span className="flex items-center gap-2">
                <Image
                  src="/icons/zoom-new.png"
                  alt="Zoom"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
                {zoomed ? "Zoom in" : "Zoom in"}
              </span>
            </Button>
            <Button
              onClick={handleTrim}
              disabled={processing || segments.some((seg) => seg.start >= seg.end)}
              className="min-w-[90px] h-8 px-3 flex items-center gap-2 font-semibold disabled:opacity-60 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
            >
              <span className="flex items-center gap-2">
                <Image
                  src="/icons/trim-new.svg"
                  alt="Trim"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
                Trim & Merge
              </span>
            </Button>
            <Button
              onClick={addSegment}
              className="min-w-[90px] h-8 px-3 flex items-center gap-2 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm"
            >
              <span className="flex items-center gap-2">
                <Image src="/icons/+.svg" alt="Add" width={20} height={20} className="w-5 h-5" />
                Add Segment
              </span>
            </Button>
            <Button
              onClick={() => removeSegment(activeIdx)}
              disabled={segments.length <= 1}
              className="min-w-[90px] h-8 px-3 flex items-center gap-2 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <span className="flex items-center gap-2">
                <Image src="/icons/-.svg" alt="Remove" width={20} height={20} className="w-5 h-5" />
                Remove Segment
              </span>
            </Button>
          </div>
          <div className="flex-1"></div>
          <div className="flex gap-2 sm:gap-4">
            <Button
              onClick={handleUndo}
              disabled={segments.length <= 1}
              className="min-w-[50px] h-8 px-3 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Image src="/icons/undo.svg" alt="Undo" width={20} height={20} className="w-5 h-5" />
            </Button>
            <Button
              onClick={handleRedo}
              disabled={removedSegments.length === 0}
              className="min-w-[50px] h-8 px-3 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Image src="/icons/redo.svg" alt="Redo" width={20} height={20} className="w-5 h-5" />
            </Button>
            {onResetVideo && hasBeenTrimmed && (
              <Button
                variant="outline"
                onClick={onResetVideo}
                className="min-w-[90px] h-8 px-3 flex items-center gap-2 font-semibold text-sm"
              >
                <span className="flex items-center gap-2">
                  <Image
                    src="/icons/reset.png"
                    alt="Reset"
                    width={20}
                    height={20}
                    className="w-5 h-5"
                  />
                  Reset Video
                </span>
              </Button>
            )}
          </div>
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <span>📋</span>
            <span>Drag segments to reorder them</span>
            {isDragging && <span className="text-blue-500">(Dragging...)</span>}
            {dragIndex !== null && <span className="text-green-500">(From: {dragIndex + 1})</span>}
            {dragOverIndex !== null && (
              <span className="text-purple-500">(To: {dragOverIndex + 1})</span>
            )}
          </div>
          <div className="flex gap-2">
            {segments.map((seg, idx) => (
              <Button
                key={idx}
                variant={idx === activeIdx ? "default" : "outline"}
                onClick={() => {
                  if (!isDragging) {
                    setActiveIdx(idx);
                  }
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnter={(e) => handleDragEnter(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={(e) => handleMouseMove(e, idx)}
                onMouseUp={handleMouseUp}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all duration-200 cursor-grab active:cursor-grabbing hover:scale-105 ${
                  idx === activeIdx
                    ? "bg-[#7C5CFC] text-white shadow-lg"
                    : "bg-white text-[#7C5CFC] border border-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC] hover:shadow-md"
                } ${
                  dragOverIndex === idx ? "ring-2 ring-[#7C5CFC] ring-opacity-50 scale-110" : ""
                } ${dragIndex === idx ? "opacity-50 scale-95 shadow-xl" : ""}`}
              >
                Segment {idx + 1}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            Timeline Duration: {timeFormatter(duration || 80.0)}
          </div>
          <div className="text-lg font-mono">StartTime : {timeFormatter(start)}</div>
          <div className="text-lg font-mono">EndTime : {timeFormatter(end)}</div>
          <div className="text-sm font-medium text-[#7C5CFC]">Active: Segment {activeIdx + 1}</div>
        </div>
        <div className="w-full flex justify-center">
          <svg
            ref={svgRef}
            width="100%"
            style={{ maxWidth: 1400, height: height * 1.5 }}
            viewBox={`0 0 ${svgWidth} ${height}`}
            preserveAspectRatio="none"
            onClick={handleTimelineClick}
            key={`timeline-${start}-${end}-${activeIdx}`}
          >
            {/* Ruler bar */}
            <rect
              x={margin}
              y={timelineY}
              width={svgWidth - 2 * margin}
              height={timelineHeight}
              rx={6}
              fill="#F6F3FF"
              stroke={rulerColor}
              strokeWidth={2}
            />
            {/* Trim regions */}
            {segments.map((seg, idx) => (
              <rect
                key={idx}
                x={isNaN(seg.start) ? margin : timeToX(seg.start)}
                y={timelineY}
                width={
                  isNaN(seg.end) || isNaN(seg.start) ? 0 : timeToX(seg.end) - timeToX(seg.start)
                }
                height={timelineHeight}
                fill={idx === activeIdx ? trimColor : "#D1C4E9"}
                opacity={0.7}
                rx={6}
              />
            ))}
            {/* Current time marker */}
            <line
              x1={isNaN(currentTime) ? margin : timeToX(currentTime)}
              y1={timelineY - 10}
              x2={isNaN(currentTime) ? margin : timeToX(currentTime)}
              y2={timelineY + timelineHeight + 20}
              stroke={rulerColor}
              strokeWidth={2}
              opacity={0.9}
            />
            {/* Zoom effects indicators */}
            {zoomEffects.map((effect) => {
              const startX = timeToX(effect.startTime);
              const endX = timeToX(effect.endTime);
              const width = endX - startX;
              return (
                <g key={`zoom-${effect.id}`}>
                  <rect
                    x={startX}
                    y={timelineY}
                    width={width}
                    height={timelineHeight}
                    fill="rgba(124, 92, 252, 0.5)"
                    stroke="rgba(124, 92, 252, 1)"
                    strokeWidth={3}
                    strokeDasharray="5,5"
                    rx={4}
                  />
                  <text
                    x={startX + width / 2}
                    y={timelineY - 8}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#7C5CFC"
                  >
                    🔍 {effect.zoomLevel.toFixed(1)}x
                  </text>
                  {onZoomEffectRemove && (
                    <foreignObject
                      x={startX + width / 2 + 20}
                      y={timelineY - 22}
                      width={20}
                      height={20}
                    >
                      <button
                        style={{
                          width: "20px",
                          height: "20px",
                          background: "#7C5CFC",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          cursor: "pointer",
                          fontSize: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // console.log("Removing zoom effect:", effect.id);
                          onZoomEffectRemove(effect.id);
                        }}
                      >
                        ✕
                      </button>
                    </foreignObject>
                  )}
                  <circle
                    cx={startX}
                    cy={timelineY + timelineHeight / 2}
                    r={4}
                    fill="#7C5CFC"
                    stroke="white"
                    strokeWidth={2}
                  />
                  <circle
                    cx={endX}
                    cy={timelineY + timelineHeight / 2}
                    r={4}
                    fill="#7C5CFC"
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={startX}
                    y={timelineY + timelineHeight + 15}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#7C5CFC"
                  >
                    {timeFormatter(effect.startTime)}
                  </text>
                  <text
                    x={endX}
                    y={timelineY + timelineHeight + 15}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#7C5CFC"
                  >
                    {timeFormatter(effect.endTime)}
                  </text>
                </g>
              );
            })}
            {/* Major and minor tick marks */}
            {majorTicks.map((tick, i) => (
              <g key={`major-${i}`}>
                <line
                  x1={tick.x}
                  y1={timelineY}
                  x2={tick.x}
                  y2={timelineY + timelineHeight + 20}
                  stroke={tickColor}
                  strokeWidth={2}
                />
                <text
                  x={tick.x}
                  y={timelineY + timelineHeight + 32}
                  textAnchor="middle"
                  fontSize={14}
                  fill={labelColor}
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {minorTicks.map((tick, i) => {
              if (!majorTicks.some((mt) => mt.time === tick.time)) {
                return (
                  <line
                    key={`minor-${i}`}
                    x1={tick.x}
                    y1={timelineY}
                    x2={tick.x}
                    y2={timelineY + timelineHeight + 10}
                    stroke={tickColor}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                );
              }
              return null;
            })}
            {/* Micro ticks for finer granularity */}
            {microTicks.map((tick, i) => {
              if (
                !majorTicks.some((mt) => mt.time === tick.time) &&
                !minorTicks.some((mt) => mt.time === tick.time)
              ) {
                return (
                  <line
                    key={`micro-${i}`}
                    x1={tick.x}
                    y1={timelineY}
                    x2={tick.x}
                    y2={timelineY + timelineHeight + 6}
                    stroke={tickColor}
                    strokeWidth={0.5}
                    opacity={0.3}
                  />
                );
              }
              return null;
            })}
            {/* Fixed markers at 0.00 and dynamic end (duration) */}
            <polygon
              points={trianglePoints(
                timeToX(0),
                timelineY + timelineHeight / 2,
                handleWidth,
                handleHeight,
                "up"
              )}
              fill={handleColor}
              stroke={rulerColor}
              strokeWidth={2}
              opacity={0.95}
            >
              <title>Start: 0.00</title>
            </polygon>
            <text
              x={timeToX(0)}
              y={timelineY - handleHeight + 8}
              textAnchor="middle"
              fontSize={13}
              fill={labelColor}
            >
              0.00
            </text>
            <polygon
              points={trianglePoints(
                timeToX(duration || 80.0),
                timelineY + timelineHeight / 2,
                handleWidth,
                handleHeight,
                "up"
              )}
              fill={handleColor}
              stroke={rulerColor}
              strokeWidth={2}
              opacity={0.95}
            >
              <title>End: {timeFormatter(duration || 80.0)}</title>
            </polygon>
            <text
              x={timeToX(duration || 80.0)}
              y={timelineY - handleHeight + 8}
              textAnchor="middle"
              fontSize={13}
              fill={labelColor}
            >
              {timeFormatter(duration || 80.0)}
            </text>
            {/* Start and End handles */}
            <g
              style={{ cursor: "ew-resize" }}
              onMouseDown={(e) => {
                // console.log("End handle mouse down");
                e.stopPropagation();
                setDragging("start");
              }}
            >
              <polygon
                points={trianglePoints(
                  timeToX(start),
                  timelineY + timelineHeight / 2,
                  handleWidth,
                  handleHeight,
                  "up"
                )}
                fill={handleColor}
                stroke={rulerColor}
                strokeWidth={2}
                opacity={0.95}
              />
              <text
                x={timeToX(start)}
                y={timelineY - handleHeight + 8}
                textAnchor="middle"
                fontSize={13}
                fill={rulerColor}
              >
                {timeFormatter(start)}
              </text>
            </g>
            <g
              style={{ cursor: "ew-resize" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging("end");
              }}
            >
              <polygon
                points={trianglePoints(
                  timeToX(end),
                  timelineY + timelineHeight / 2,
                  handleWidth,
                  handleHeight,
                  "up"
                )}
                fill={handleColor}
                stroke={rulerColor}
                strokeWidth={2}
                opacity={0.95}
              />
              <text
                x={timeToX(end)}
                y={timelineY - handleHeight + 8}
                textAnchor="middle"
                fontSize={13}
                fill={rulerColor}
              >
                {timeFormatter(end)}
              </text>
            </g>
          </svg>
        </div>
      </div>
    </Card>
  );
}

// Import trianglePoints from dateUtils.ts instead of defining it here
