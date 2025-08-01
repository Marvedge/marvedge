"use client";
import Image from "next/image";
import React, { useCallback, useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReactPlayer from "react-player";
import {
  defaultFormatTime,
  toggleZoom,
  trianglePoints,
  ZoomEffect,
} from "@/lib/dateUtils";

interface TrimSegment {
  start: number;
  end: number;
}

interface TimelineSliderProps {
  duration: number; // Duration in seconds]
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
  // New props for external trim times
  externalStartTime?: number;
  externalEndTime?: number;
  onExternalTimeChange?: (start: number, end: number) => void;
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
  externalStartTime,
  externalEndTime,
  onExternalTimeChange,
}: TimelineSliderProps) {
  const [segments, setSegments] = useState<TrimSegment[]>([
    { start: 0, end: duration },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoomed, setzoomed] = useState(false);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [progress] = useState(0);


  // Drag and drop state for segment reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (setProgress) setProgress(progress);
  }, [progress, setProgress]);

  // Update segments when duration changes
  useEffect(() => {
    if (duration > 0) {
      setSegments((prev) => {
        const updated = [...prev];
        updated[0] = { start: 0, end: duration };
        return updated;
      });
    }
  }, [duration]);

  const timeFormatter = formatTime || defaultFormatTime;

  const handleToggleZoom = useCallback(() => {
    toggleZoom(onZoomEffectCreate, currentTime, duration, setzoomed);
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
  }, [segments, duration, ontrim, timeFormatter]);

  // Drag and drop handlers for segment reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    console.log("Drag start:", index);
    setDragIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", index.toString());
    // Set a drag image for better visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 10, 10);
    }
    // Prevent the click event from firing
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
    console.log("Drop:", dragIndex, "to", dropIndex);
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      setIsDragging(false);
      return;
    }

    // Reorder segments
    const newSegments = [...segments];
    const draggedSegment = newSegments[dragIndex];
    newSegments.splice(dragIndex, 1);
    newSegments.splice(dropIndex, 0, draggedSegment);

    setSegments(newSegments);

    // Update active index if needed
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
    console.log("Drag end");
    setDragIndex(null);
    setDragOverIndex(null);
    // Small delay to prevent click event interference
    setTimeout(() => setIsDragging(false), 100);
  };

  // Mouse event handlers as fallback
  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStartPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent, index: number) => {
    if (mouseStartPos && !isDragging) {
      const deltaX = Math.abs(e.clientX - mouseStartPos.x);
      const deltaY = Math.abs(e.clientY - mouseStartPos.y);

      // Start dragging if mouse moved more than 5px
      if (deltaX > 5 || deltaY > 5) {
        console.log("Mouse drag start:", index);
        setDragIndex(index);
        setIsDragging(true);
        setMouseStartPos(null);
      }
    }
  };

  const handleMouseUp = () => {
    setMouseStartPos(null);
  };

  // SVG timeline dimensions
  const [svgWidth, setSvgWidth] = useState(800); // default, will update on mount
  const height = 90;
  const margin = 40;
  const timelineY = 40;
  const timelineHeight = 12;
  const handleWidth = 24;
  const handleHeight = 28;
  const rulerColor = "#A594F9";
  const trimColor = "#E6E1FA";
  const handleColor = "#A594F9";
  const tickColor = "#A594F9";
  const labelColor = "#A594F9";

  // Convert time to X position, guard against NaN
  const timeToX = (t: number) => {
    if (!duration || isNaN(duration) || isNaN(t)) return margin;
    const x = margin + ((svgWidth - 2 * margin) * t) / duration;
    console.log("timeToX:", { t, duration, svgWidth, margin, x });
    return x;
  };
  // Convert X position to time
  const xToTime = useCallback(
    (x: number) => {
      const clamped = Math.max(margin, Math.min(svgWidth - margin, x));
      return ((clamped - margin) / (svgWidth - 2 * margin)) * duration;
    },
    [duration, margin, svgWidth]
  );

  // Responsive: update svgWidth on mount and resize
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

  // Update segment
  const updateSegment = useCallback(
    (key: "start" | "end", value: number) => {
      console.log(
        "Updating segment:",
        key,
        "to",
        value,
        "for activeIdx:",
        activeIdx
      );
      setSegments((segs) => {
        console.log("Previous segments:", segs);
        const updated = segs.map((seg, i) => {
          if (i === activeIdx) {
            console.log("Updating segment", i, "from", seg, "to", {
              ...seg,
              [key]: value,
            });
            return { ...seg, [key]: value };
          }
          return seg;
        });
        console.log("New segments:", updated);
        return updated;
      });
    },
    [activeIdx]
  );
  // Replace start/end with active segment
  const start = segments[activeIdx]?.start ?? 0;
  const end = segments[activeIdx]?.end ?? duration;

  console.log("Current segment values:", {
    start,
    end,
    activeIdx,
    segments: segments[activeIdx],
  });

  // Special debugging for segment 1
  if (activeIdx === 0) {
    console.log("Segment 1 specific:", {
      start,
      end,
      dragging,
      externalStartTime,
      externalEndTime,
      segmentData: segments[0],
    });
  }

  // Mouse/touch handlers for dragging handles
  useEffect(() => {
    if (!dragging) return;

    console.log("Dragging started:", dragging);

    const onMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      if (e instanceof MouseEvent) clientX = e.clientX;
      else if (e.touches && e.touches[0]) clientX = e.touches[0].clientX;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left;
      let newTime = xToTime(x);
      newTime = Math.max(0, Math.min(duration, newTime));

      console.log("Dragging:", dragging, "New time:", newTime);

      if (dragging === "start") {
        if (newTime >= end) newTime = end - 0.01;
        updateSegment("start", newTime);
        onTimeChange?.(newTime);
        playerRef?.current?.seekTo(newTime, "seconds");
        setCurrentTime(newTime);
        // Always notify parent
        if (onExternalTimeChange) {
          onExternalTimeChange(newTime, end);
        }
      } else if (dragging === "end") {
        if (newTime <= start) newTime = start + 0.01;
        updateSegment("end", newTime);
        onTimeChange?.(newTime);
        playerRef?.current?.seekTo(newTime, "seconds");
        setCurrentTime(newTime);
        // Always notify parent
        if (onExternalTimeChange) {
          onExternalTimeChange(start, newTime);
        }
      }
    };
    const onUp = () => {
      console.log("Dragging ended");
      setDragging(null);
    };
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

  // Click to seek on timeline
  const handleTimelineClick = (
    e: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    let seekTime = xToTime(x);
    seekTime = Math.max(0, Math.min(duration, seekTime));
    playerRef?.current?.seekTo(seekTime, "seconds");
    setCurrentTime(seekTime);
  };

  // Keyboard controls for trim handles and video
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) return;
      switch (e.key) {
        case "ArrowLeft":
          playerRef?.current?.seekTo(Math.max(0, currentTime - 1), "seconds");
          setCurrentTime(Math.max(0, currentTime - 1));
          break;
        case "ArrowRight":
          playerRef?.current?.seekTo(
            Math.min(duration, currentTime + 1),
            "seconds"
          );
          setCurrentTime(Math.min(duration, currentTime + 1));
          break;
        case "[":
          updateSegment("start", Math.max(0, start - 1));
          break;
        case "]":
          updateSegment("end", Math.min(duration, end + 1));
          break;
        case "Enter":
          handleTrim();
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
  ]);

  // Add segment
  const addSegment = () => {
    setSegments([...segments, { start: 0, end: duration }]);
    setActiveIdx(segments.length);
  };
  // Remove segment
  const removeSegment = (idx: number) => {
    if (segments.length > 1) {
      const newSegments = segments.filter((_, i) => i !== idx);
      setSegments(newSegments);
      setActiveIdx(Math.min(activeIdx, newSegments.length - 1));
    }
  };

  // Generate tick marks
  const markerCount = 21;
  const ticks = Array.from({ length: markerCount }, (_, i) => {
    const t = (duration * i) / (markerCount - 1);
    return {
      time: t,
      x: timeToX(t),
      label: t.toFixed(2),
    };
  });

  return (
    <Card className="p-6 w-full max-w-6xl">
      <div className="space-y-6">
        {/* Progress Bar */}
        {progress > 0 && progress < 100 && (
          <div className="w-full h-2 bg-gray-200 rounded mb-2 overflow-hidden">
            <div
              className="h-full bg-[#7C5CFC] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {/* Controls: Zoom, Trim, Add/Remove Segments */}
        <div className="flex flex-row flex-wrap gap-2 sm:gap-4 mb-4 w-full">
          <Button
            variant="outline"
            onClick={handleToggleZoom}
            className="min-w-[110px] h-10 px-4 flex items-center gap-2 font-semibold"
          >
            <span className="flex items-center gap-2">
              <Image
                src="/icons/zoom-new.png"
                alt="Notifications"
                width={24}
                height={24}
                className="w-6 h-6"
              />
              {zoomed ? "Zoom in" : "Zoom in"}
            </span>
          </Button>
          <Button
            onClick={handleTrim}
            disabled={
              processing || segments.some((seg) => seg.start >= seg.end)
            }
            className="min-w-[110px] h-10 px-4 flex items-center gap-2 font-semibold disabled:opacity-60 bg-gray-200 hover:bg-gray-300 text-gray-800"
          >
            <span className="flex items-center gap-2">
              <Image
                src="/icons/trim-new.svg"
                alt="Notifications"
                width={24}
                height={24}
                className="w-6 h-6"
              />
              Trim & Merge
            </span>
          </Button>
          <Button
            onClick={addSegment}
            className="min-w-[110px] h-10 px-4 flex items-center gap-2 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800"
          >
            <span className="flex items-center gap-2">
              <Image
                src="/icons/+.svg"
                alt="Notifications"
                width={24}
                height={24}
                className="w-6 h-6"
              />
              Add Segment
            </span>
          </Button>
          {segments.length > 1 && (
            <Button
              onClick={() => removeSegment(activeIdx)}
              className="min-w-[110px] h-10 px-4 flex items-center gap-2 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800"
            >
              <span className="flex items-center gap-2">
                <Image
                  src="/icons/-.svg"
                  alt="Notifications"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
                Remove Segment
              </span>
            </Button>
          )}
          {onResetVideo && (
            <Button
              variant="outline"
              onClick={onResetVideo}
              className="min-w-[110px] h-10 px-4 flex items-center gap-2 font-semibold"
            >
              <span className="flex items-center gap-2">
                <Image
                  src="/icons/reset.png"
                  alt="Notifications"
                  width={24}
                  height={24}
                  className="w-6 h-6"
                />
                Reset
              </span>
            </Button>
          )}
        </div>
        {/* Segment Selector */}
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <span>📋</span>
            <span>Drag segments to reorder them</span>
            {isDragging && <span className="text-blue-500">(Dragging...)</span>}
            {dragIndex !== null && (
              <span className="text-green-500">(From: {dragIndex + 1})</span>
            )}
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
                  // Only handle click if not dragging
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
                  dragOverIndex === idx
                    ? "ring-2 ring-[#7C5CFC] ring-opacity-50 scale-110"
                    : ""
                } ${dragIndex === idx ? "opacity-50 scale-95 shadow-xl" : ""}`}
              >
                Segment {idx + 1}
              </Button>
            ))}
          </div>
        </div>
        {/* Timeline Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">
            Timeline Duration: {timeFormatter(duration)}
          </div>
          <div className="text-lg font-mono">
            StartTime : {timeFormatter(start)}
          </div>
          <div className="text-lg font-mono">
            EndTime : {timeFormatter(end)}
          </div>
          <div className="text-sm font-medium text-[#7C5CFC]">
            Active: Segment {activeIdx + 1}
          </div>
        </div>
        {/* SVG Timeline */}
        <div className="w-full flex justify-center">
          <svg
            ref={svgRef}
            width="100%"
            style={{
              maxWidth: 1400,
              height: height * 1.5,
            }}
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
            {/* All trim regions */}
            {segments.map((seg, idx) => (
              <rect
                key={idx}
                x={isNaN(seg.start) ? margin : timeToX(seg.start)}
                y={timelineY}
                width={
                  isNaN(seg.end) || isNaN(seg.start)
                    ? 0
                    : timeToX(seg.end) - timeToX(seg.start)
                }
                height={timelineHeight}
                fill={idx === activeIdx ? trimColor : "#D1C4E9"}
                opacity={0.7}
                rx={6}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIdx(idx);
                }}
              />
            ))}
            {/* Current time marker */}
            <line
              x1={isNaN(currentTime) ? margin : timeToX(currentTime)}
              y1={timelineY - 10}
              x2={isNaN(currentTime) ? margin : timeToX(currentTime)}
              y2={timelineY + timelineHeight + 20}
              stroke="#7C5CFC"
              strokeWidth={3}
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
                    fontWeight="bold"
                    style={{ userSelect: "none" }}
                  >
                    🔍 {effect.zoomLevel.toFixed(1)}x
                  </text>
                  {onZoomEffectRemove && (
                    <foreignObject
                      x={startX + width / 2 + 20}
                      y={timelineY - 22}
                      width={20}
                      height={20}
                      style={{ overflow: "visible" }}
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
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                        title="Remove zoom effect"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log("Removing zoom effect:", effect.id);
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
                    fontWeight="bold"
                    style={{ userSelect: "none" }}
                  >
                    {timeFormatter(effect.startTime)}
                  </text>
                  <text
                    x={endX}
                    y={timelineY + timelineHeight + 15}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#7C5CFC"
                    fontWeight="bold"
                    style={{ userSelect: "none" }}
                  >
                    {timeFormatter(effect.endTime)}
                  </text>
                </g>
              );
            })}
            {/* Tick marks and labels */}
            {ticks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick.x}
                  y1={timelineY}
                  x2={tick.x}
                  y2={timelineY + timelineHeight + (i % 5 === 0 ? 18 : 10)}
                  stroke={tickColor}
                  strokeWidth={i % 5 === 0 ? 2 : 1}
                />
                {i % 5 === 0 && (
                  <text
                    x={tick.x}
                    y={timelineY + timelineHeight + 28}
                    textAnchor="middle"
                    fontSize={14}
                    fill={labelColor}
                    fontWeight="bold"
                  >
                    {tick.label}
                  </text>
                )}
              </g>
            ))}
            {/* Start handle (triangle pointer) */}
            <g
              style={{ cursor: "ew-resize" }}
              onMouseDown={(e) => {
                console.log("Start handle mouse down");
                e.stopPropagation();
                setDragging("start");
              }}
              onTouchStart={(e) => {
                console.log("Start handle touch start");
                e.stopPropagation();
                setDragging("start");
              }}
            >
              {/* Time label above handle */}
              <text
                x={isNaN(start) ? margin : timeToX(start)}
                y={timelineY - handleHeight + 8}
                textAnchor="middle"
                fontSize={13}
                fill="#7C5CFC"
                fontWeight="bold"
                style={{ userSelect: "none" }}
              >
                {timeFormatter(start)}
              </text>
              {/* Triangle pointer */}
              <polygon
                points={trianglePoints(
                  isNaN(start) ? margin : timeToX(start),
                  timelineY - 4,
                  handleWidth,
                  handleHeight,
                  "up"
                )}
                fill={handleColor}
                stroke="#7C5CFC"
                strokeWidth={2}
                opacity={0.95}
                style={{
                  transition:
                    dragging === "start"
                      ? "none"
                      : "all 0.18s cubic-bezier(.4,2,.6,1)",
                }}
              />
            </g>
            {/* End handle (triangle pointer) */}
            <g
              style={{ cursor: "ew-resize" }}
              onMouseDown={(e) => {
                console.log("End handle mouse down");
                e.stopPropagation();
                setDragging("end");
              }}
              onTouchStart={(e) => {
                console.log("End handle touch start");
                e.stopPropagation();
                setDragging("end");
              }}
            >
              {/* Time label above handle */}
              <text
                x={isNaN(end) ? margin : timeToX(end)}
                y={timelineY - handleHeight + 8}
                textAnchor="middle"
                fontSize={13}
                fill="#7C5CFC"
                fontWeight="bold"
                style={{ userSelect: "none" }}
              >
                {timeFormatter(end)}
              </text>
              {/* Triangle pointer */}
              <polygon
                points={trianglePoints(
                  isNaN(end) ? margin : timeToX(end),
                  timelineY - 4,
                  handleWidth,
                  handleHeight,
                  "up"
                )}
                fill={handleColor}
                stroke="#7C5CFC"
                strokeWidth={2}
                opacity={0.95}
                style={{
                  transition:
                    dragging === "end"
                      ? "none"
                      : "all 0.18s cubic-bezier(.4,2,.6,1)",
                }}
              />
            </g>
          </svg>
        </div>
      </div>
    </Card>
  );
}
