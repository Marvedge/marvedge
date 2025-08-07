"use client";
import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface TimelineRulerProps {
  minValue?: number;
  maxValue?: number;
  currentValue?: number;
  onValueChange?: (value: number) => void;
  step?: number;
  majorStep?: number;
  minorStep?: number;
  microStep?: number;
  // Trim functionality props
  startTime?: number;
  endTime?: number;
  onStartTimeChange?: (value: number) => void;
  onEndTimeChange?: (value: number) => void;
  showTrimHandles?: boolean;
  // Controller functionality props
  onTrim?: (segments: { start: string; end: string }[]) => void;
  processing?: boolean;
  onAddSegment?: () => void;
  onRemoveSegment?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onResetVideo?: () => void;
  onZoomEffectCreate?: (effect: any) => void;
}

export default function TimelineRuler({
  minValue = 0.05,
  maxValue = 1.0,
  currentValue = 0.07,
  onValueChange,
  step = 0.002,
  majorStep = 0.05,
  minorStep = 0.01,
  microStep = 0.002,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  showTrimHandles = false,
  onTrim,
  processing = false,
  onAddSegment,
  onRemoveSegment,
  onUndo,
  onRedo,
  onResetVideo,
  onZoomEffectCreate,
}: TimelineRulerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<
    "current" | "start" | "end" | null
  >(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(currentValue || 0);
  const [localStartTime, setLocalStartTime] = useState(startTime || minValue);
  const [localEndTime, setLocalEndTime] = useState(endTime || maxValue);

  // Segment management state - start with empty array
  const [segments, setSegments] = useState<{ start: number; end: number }[]>(
    []
  );
  const [activeSegment, setActiveSegment] = useState(0);
  const [removedSegments, setRemovedSegments] = useState<
    { start: number; end: number }[]
  >([]);
  const [hasBeenTrimmed, setHasBeenTrimmed] = useState(false);

  // Add new state for scissor dragging
  const [draggingScissor, setDraggingScissor] = useState<
    null | "left" | "right"
  >(null);
  const [scissorPreview, setScissorPreview] = useState<number | null>(null);

  // Add state for dragging the current time marker
  const [draggingCurrentTime, setDraggingCurrentTime] = useState(false);

  useEffect(() => {
    // Ensure we always update localValue when currentValue changes
    // This is especially important when currentValue is 0
    setLocalValue(currentValue);
  }, [currentValue]);

  useEffect(() => {
    if (startTime !== undefined) setLocalStartTime(startTime);
  }, [startTime]);

  useEffect(() => {
    if (endTime !== undefined) setLocalEndTime(endTime);
  }, [endTime]);

  // Update trim handles when active segment changes
  useEffect(() => {
    if (segments[activeSegment]) {
      setLocalStartTime(segments[activeSegment].start);
      setLocalEndTime(segments[activeSegment].end);
    }
  }, [activeSegment, segments]);

  // Mouse event handlers for scissor dragging
  useEffect(() => {
    if (!draggingScissor) return;
    const onMove = (e: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, x / width));
      const value = minValue + (maxValue - minValue) * percentage;
      setScissorPreview(value);
    };
    const onUp = () => {
      if (scissorPreview !== null) {
        if (
          draggingScissor === "left" &&
          scissorPreview > minValue &&
          scissorPreview < maxValue
        ) {
          // Create segment from 0 to scissorPreview
          setSegments((prev) => [
            ...prev,
            { start: minValue, end: scissorPreview },
          ]);
          setActiveSegment(segments.length); // new segment is last
        } else if (
          draggingScissor === "right" &&
          scissorPreview > minValue &&
          scissorPreview < maxValue
        ) {
          // Create segment from scissorPreview to maxValue
          setSegments((prev) => [
            ...prev,
            { start: scissorPreview, end: maxValue },
          ]);
          setActiveSegment(segments.length); // new segment is last
        }
      }
      setDraggingScissor(null);
      setScissorPreview(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingScissor, scissorPreview, minValue, maxValue, segments.length]);

  // Handler to update current time based on mouse position
  const updateCurrentTimeFromMouse = (e: MouseEvent | React.MouseEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x =
      (e instanceof MouseEvent ? e.clientX : e.nativeEvent.clientX) - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, x / width));
    const value = minValue + (maxValue - minValue) * percentage;
    setLocalValue(value);
    if (onValueChange) onValueChange(value);
  };

  // Mouse event listeners for dragging
  useEffect(() => {
    if (!draggingCurrentTime) return;
    const onMove = (e: MouseEvent) => {
      updateCurrentTimeFromMouse(e);
    };
    const onUp = () => setDraggingCurrentTime(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingCurrentTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateValueFromMouse(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && draggingHandle) {
      updateValueFromMouse(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingHandle(null);
  };

  const handleTrimHandleMouseDown = (
    e: React.MouseEvent,
    handle: "start" | "end"
  ) => {
    e.stopPropagation();
    setDraggingHandle(handle);
    setIsDragging(true);
  };

  // Segment management functions
  const addSegment = () => {
    const newSegment = { start: 0, end: maxValue };
    setSegments([...segments, newSegment]);
    setActiveSegment(segments.length);
    // Update trim handles to match the new segment
    setLocalStartTime(newSegment.start);
    setLocalEndTime(newSegment.end);
  };

  const removeSegment = (idx: number) => {
    if (segments.length > 0) {
      const newSegments = segments.filter((_, i) => i !== idx);
      setSegments(newSegments);
      if (newSegments.length > 0) {
        const newActiveSegment = Math.min(
          activeSegment,
          newSegments.length - 1
        );
        setActiveSegment(newActiveSegment);
        // Update trim handles to match the new active segment
        if (newSegments[newActiveSegment]) {
          setLocalStartTime(newSegments[newActiveSegment].start);
          setLocalEndTime(newSegments[newActiveSegment].end);
        }
      } else {
        // No segments left, reset to default
        setActiveSegment(0);
        setLocalStartTime(minValue);
        setLocalEndTime(maxValue);
      }
    }
  };

  const handleUndo = () => {
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      setRemovedSegments((prev) => [...prev, lastSegment]);
      setSegments((prev) => {
        const newSegments = prev.slice(0, -1);
        if (newSegments.length > 0) {
          const newActiveSegment = Math.min(
            activeSegment,
            newSegments.length - 1
          );
          setActiveSegment(newActiveSegment);
          // Update trim handles to match the new active segment
          if (newSegments[newActiveSegment]) {
            setLocalStartTime(newSegments[newActiveSegment].start);
            setLocalEndTime(newSegments[newActiveSegment].end);
          }
        } else {
          // No segments left, reset to default
          setActiveSegment(0);
          setLocalStartTime(minValue);
          setLocalEndTime(maxValue);
        }
        return newSegments;
      });
    }
  };

  const handleRedo = () => {
    if (removedSegments.length > 0) {
      const segmentToRestore = removedSegments[removedSegments.length - 1];
      setSegments((prev) => [...prev, segmentToRestore]);
      setRemovedSegments((prev) => prev.slice(0, -1));
    }
  };

  const handleTrim = () => {
    if (segments.some((seg) => seg.start >= seg.end)) {
      alert("Invalid trim range in one or more segments.");
      return;
    }
    onTrim?.(
      segments.map((seg) => ({
        start: seg.start.toFixed(2),
        end: seg.end.toFixed(2),
      }))
    );
    setHasBeenTrimmed(true);
  };

  // New function for smart trim based on current time
  const handleSmartTrim = () => {
    const currentTime = localValue; // Current video time
    const segmentDuration = 4; // 4 seconds duration for each segment
    const startTime = currentTime;
    const endTime = Math.min(maxValue, currentTime + segmentDuration);

    // Create a new segment from current time to current time + 4 seconds
    const newSegment = { start: startTime, end: endTime };

    // Add the new segment to the segments array
    setSegments((prev) => {
      const newSegments = [...prev, newSegment];
      // Set this new segment as active
      setActiveSegment(newSegments.length - 1);
      return newSegments;
    });

    // Update local start and end times to match the new segment
    setLocalStartTime(startTime);
    setLocalEndTime(endTime);

    console.log(
      `Created segment from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s`
    );
  };

  const updateValueFromMouse = (e: React.MouseEvent) => {
    if (!rulerRef.current) return;

    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Calculate value based on position, ensuring it starts from 0
    const percentage = Math.max(0, Math.min(1, x / width));
    const newValue = minValue + (maxValue - minValue) * percentage;

    // Snap to nearest step and ensure it's not negative
    const snappedValue = Math.round(newValue / step) * step;
    const clampedValue = Math.max(0, Math.min(maxValue, snappedValue));

    if (draggingHandle === "start") {
      const newStartTime = Math.min(clampedValue, localEndTime - step);
      setLocalStartTime(newStartTime);
      // Update the active segment's start time
      if (segments[activeSegment]) {
        const updatedSegments = [...segments];
        updatedSegments[activeSegment] = {
          ...updatedSegments[activeSegment],
          start: newStartTime,
        };
        setSegments(updatedSegments);
      }
      onStartTimeChange?.(newStartTime);
    } else if (draggingHandle === "end") {
      const newEndTime = Math.max(clampedValue, localStartTime + step);
      setLocalEndTime(newEndTime);
      // Update the active segment's end time
      if (segments[activeSegment]) {
        const updatedSegments = [...segments];
        updatedSegments[activeSegment] = {
          ...updatedSegments[activeSegment],
          end: newEndTime,
        };
        setSegments(updatedSegments);
      }
      onEndTimeChange?.(newEndTime);
    } else {
      setLocalValue(clampedValue);
      onValueChange?.(clampedValue);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        updateValueFromMouse(e as any);
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isDragging]);

  // Generate tick marks
  const generateTicks = () => {
    const ticks = [];
    const totalRange = maxValue - minValue;

    // Major ticks (every 0.05)
    for (let i = 0; i <= totalRange / majorStep; i++) {
      const value = minValue + i * majorStep;
      ticks.push({
        value,
        type: "major",
        label: value.toFixed(2),
        height: 20,
      });
    }

    // Minor ticks (every 0.01)
    for (let i = 0; i <= totalRange / minorStep; i++) {
      const value = minValue + i * minorStep;
      if (value % majorStep !== 0) {
        ticks.push({
          value,
          type: "minor",
          label: "",
          height: 12,
        });
      }
    }

    // Micro ticks (every 0.002)
    for (let i = 0; i <= totalRange / microStep; i++) {
      const value = minValue + i * microStep;
      if (value % minorStep !== 0) {
        ticks.push({
          value,
          type: "micro",
          label: "",
          height: 6,
        });
      }
    }

    return ticks.sort((a, b) => a.value - b.value);
  };

  const ticks = generateTicks();
  const currentPosition =
    ((localValue - minValue) / (maxValue - minValue)) * 100;

  return (
    <div className="w-full max-w-6xl mx-auto p-8">
      {/* Controller buttons */}
      <div className="flex flex-row items-center justify-between w-full mb-4 gap-2 sm:gap-4">
        {/* Editing Group */}
        <div className="flex gap-2 sm:gap-4">
          <button
            onClick={
              onZoomEffectCreate
                ? () =>
                    onZoomEffectCreate({
                      id: Date.now().toString(),
                      startTime: Math.max(0, localValue - 1),
                      endTime: Math.min(maxValue, localValue + 2),
                      zoomLevel: 2.0,
                      x: 0.5,
                      y: 0.5,
                    })
                : undefined
            }
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded"
          >
            <Image
              src="/icons/zoom-new.png"
              alt="Zoom"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Zoom in
          </button>
          <button
            onClick={addSegment}
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded"
          >
            <Image
              src="/icons/+.svg"
              alt="Add"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Add Segment
          </button>
          <button
            onClick={() => removeSegment(activeSegment)}
            disabled={segments.length === 0}
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image
              src="/icons/-.svg"
              alt="Remove"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Remove
          </button>
          <button
            onClick={handleTrim}
            disabled={processing}
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-60"
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Trim & Merge
          </button>
          <button
            onClick={handleSmartTrim}
            disabled={processing}
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-60"
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Trim Part
          </button>
          <button
            onClick={() => removeSegment(activeSegment)}
            disabled={segments.length === 0}
            className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-red-200 hover:bg-red-300 text-red-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image
              src="/icons/delete-demo.svg"
              alt="Delete"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Delete
          </button>
        </div>

        <div className="flex gap-2 sm:gap-4">
          <button
            onClick={handleUndo}
            disabled={segments.length === 0}
            className="min-w-[40px] h-8 px-2 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image
              src="/icons/undo.svg"
              alt="Undo"
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </button>
          <button
            onClick={handleRedo}
            disabled={removedSegments.length === 0}
            className="min-w-[40px] h-8 px-2 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image
              src="/icons/redo.svg"
              alt="Redo"
              width={16}
              height={16}
              className="w-4 h-4"
            />
          </button>
          {onResetVideo && hasBeenTrimmed && (
            <button
              onClick={onResetVideo}
              className="min-w-[80px] h-8 px-2 flex items-center justify-center gap-1 font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded"
            >
              <Image
                src="/icons/reset.png"
                alt="Reset"
                width={16}
                height={16}
                className="w-4 h-4"
              />
              Reset video
            </button>
          )}
        </div>
      </div>

      {/* Segment display */}
      {segments && segments.length > 0 ? (
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
            <span>📋</span>
            <span>Click segments to select them</span>
          </div>
          <div className="flex gap-2">
            {segments.map((seg, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSegment(idx)}
                className={`text-xs px-3 py-1 rounded-full font-semibold transition-all duration-200 cursor-pointer hover:scale-105 ${
                  idx === activeSegment
                    ? "bg-[#7C5CFC] text-white shadow-lg"
                    : "bg-white text-[#7C5CFC] border border-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC] hover:shadow-md"
                }`}
              >
                Segment {idx + 1} ({seg.start.toFixed(1)}-{seg.end.toFixed(1)}s)
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-2">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1"></div>
        </div>
      )}

      <div className="relative">
        {/* Tick marks and labels - positioned ABOVE the timeline box */}
        <div className="absolute top-0 left-12 right-12 h-12 z-20">
          {ticks.map((tick, index) => {
            const position =
              ((tick.value - minValue) / (maxValue - minValue)) * 100;
            return (
              <div
                key={`${tick.type}-${index}`}
                className="absolute top-0"
                style={{ left: `${position}%` }}
              >
                {/* Tick mark - extends downward from above the box */}
                <div
                  className={`bg-[#A594F9] ${
                    tick.type === "major"
                      ? "w-1 h-8"
                      : tick.type === "minor"
                        ? "w-0.5 h-5"
                        : "w-0.5 h-2"
                  }`}
                  style={{
                    opacity: tick.type === "micro" ? 0.4 : 0.7,
                  }}
                />

                {/* Label for major ticks - positioned below the tick marks with more space */}
                {tick.type === "major" && (
                  <div
                    className={`absolute top-10 ${
                      tick.value === minValue
                        ? "left-1/2 transform translate-x-2" // Start time - move right more
                        : tick.value === maxValue
                          ? "left-1/2 transform -translate-x-10" // End time - move left even more
                          : "left-1/2 transform -translate-x-1/2" // Other labels - center
                    }`}
                  >
                    <span className="text-sm text-[#A594F9] font-medium">
                      {tick.label}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Main timeline box container - bigger and cleaner */}
        <div
          ref={rulerRef}
          className="relative h-32 bg-white border-2 border-[#A594F9] rounded-lg cursor-pointer mt-12"
          onMouseDown={(e) => {
            // Only allow seeking if not dragging a scissor
            if (!draggingScissor) {
              setDraggingCurrentTime(true);
              updateCurrentTimeFromMouse(e);
            }
          }}
        >
          {/* Left scissor (draggable) */}
          <div
            className="absolute left-0 top-0 w-12 h-full bg-[#A594F9] rounded-l-lg flex items-center justify-center cursor-ew-resize z-30"
            onMouseDown={() => {
              setDraggingScissor("left");
              setScissorPreview(null);
            }}
            style={{ userSelect: "none" }}
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={20}
              height={20}
              className="w-5 h-5 text-white"
            />
          </div>
          {/* Right scissor (draggable) */}
          <div
            className="absolute right-0 top-0 w-12 h-full bg-[#A594F9] rounded-r-lg flex items-center justify-center cursor-ew-resize z-30"
            onMouseDown={() => {
              setDraggingScissor("right");
              setScissorPreview(null);
            }}
            style={{ userSelect: "none" }}
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={20}
              height={20}
              className="w-5 h-5 text-white"
            />
          </div>

          {/* Current position marker - extends full height of the box */}
          <div
            className="absolute top-0 w-1 h-full bg-green-500 z-10"
            style={{ left: `${currentPosition}%` }}
          >
            {/* Green triangle at top - bigger */}
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-b-6 border-l-transparent border-r-transparent border-b-green-500" />
          </div>

          {/* Segment highlighting */}
          {segments.map((segment, idx) => {
            const startPosition =
              ((segment.start - minValue) / (maxValue - minValue)) * 100;
            const endPosition =
              ((segment.end - minValue) / (maxValue - minValue)) * 100;
            const width = endPosition - startPosition;
            return (
              <div
                key={`segment-${idx}`}
                className={`absolute top-0 h-full z-5 ${
                  idx === activeSegment
                    ? "bg-blue-400 opacity-60"
                    : "bg-blue-200 opacity-40"
                }`}
                style={{
                  left: `${startPosition}%`,
                  width: `${width}%`,
                }}
              >
                {/* Segment label */}
                <div className="absolute top-2 left-2 text-xs font-bold text-blue-800 bg-white bg-opacity-80 px-1 rounded">
                  S{idx + 1}
                </div>
              </div>
            );
          })}

          {/* Preview highlight while dragging scissor */}
          {draggingScissor && scissorPreview !== null && (
            <div
              className="absolute top-0 h-full bg-yellow-300 opacity-40 z-20"
              style={{
                left:
                  draggingScissor === "left"
                    ? "0%"
                    : `${((scissorPreview - minValue) / (maxValue - minValue)) * 100}%`,
                width:
                  draggingScissor === "left"
                    ? `${((scissorPreview - minValue) / (maxValue - minValue)) * 100}%`
                    : `${((maxValue - scissorPreview) / (maxValue - minValue)) * 100}%`,
              }}
            />
          )}
        </div>

        {/* Current value display - bigger text */}
        <div className="mt-4 text-center">
          <span className="text-base font-medium text-[#A594F9]">
            Current: {localValue.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
