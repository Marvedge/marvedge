"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ZoomEffect } from "../interfaces/editor/IZoomEffect";

interface TimelineRulerProps {
  minValue?: number;
  maxValue?: number;
  currentValue?: number;
  onValueChange?: (value: number) => void;
  step?: number;
  majorStep?: number;
  minorStep?: number;
  microStep?: number;
  startTime?: number;
  endTime?: number;
  onStartTimeChange?: (value: number) => void;
  onEndTimeChange?: (value: number) => void;
  onTrim?: (segments: { start: string; end: string }[]) => void;
  processing?: boolean;
  onResetVideo?: () => void;
  onZoomEffectCreate?: (effect: ZoomEffect) => void;
  initialSegments?: { start: string; end: string }[];
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
  onTrim,
  processing = false,
  onResetVideo,
  onZoomEffectCreate,
  initialSegments,
}: TimelineRulerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingHandle] = useState<"current" | "start" | "end" | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(currentValue || 0);
  const [localStartTime, setLocalStartTime] = useState(startTime || minValue);
  const [localEndTime, setLocalEndTime] = useState(endTime || maxValue);
  const [segments, setSegments] = useState<{ start: number; end: number }[]>(
    initialSegments
      ? initialSegments.map((seg) => ({
          start: parseFloat(seg.start),
          end: parseFloat(seg.end),
        }))
      : []
  );
  const [activeSegment, setActiveSegment] = useState(0);
  const [removedSegments, setRemovedSegments] = useState<
    { start: number; end: number }[]
  >([]);
  const [hasBeenTrimmed, setHasBeenTrimmed] = useState(false);
  const [draggingScissor, setDraggingScissor] = useState<
    "left" | "right" | null
  >(null);
  const [scissorPreview, setScissorPreview] = useState<number | null>(null);
  const [draggingCurrentTime, setDraggingCurrentTime] = useState(false);

  useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  useEffect(() => {
    if (startTime !== undefined) setLocalStartTime(startTime);
  }, [startTime]);

  useEffect(() => {
    if (endTime !== undefined) setLocalEndTime(endTime);
  }, [endTime]);

  useEffect(() => {
    if (segments[activeSegment]) {
      setLocalStartTime(segments[activeSegment].start);
      setLocalEndTime(segments[activeSegment].end);
    }
  }, [activeSegment, segments]);

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
          setSegments((prev) => [
            ...prev,
            { start: minValue, end: scissorPreview },
          ]);
          setActiveSegment(segments.length);
        } else if (
          draggingScissor === "right" &&
          scissorPreview > minValue &&
          scissorPreview < maxValue
        ) {
          setSegments((prev) => [
            ...prev,
            { start: scissorPreview, end: maxValue },
          ]);
          setActiveSegment(segments.length);
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

  const updateCurrentTimeFromMouse = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x =
        (e instanceof MouseEvent ? e.clientX : e.nativeEvent.clientX) -
        rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, x / width));
      const value = minValue + (maxValue - minValue) * percentage;
      setLocalValue(value);
      if (onValueChange) onValueChange(value);
    },
    [minValue, maxValue, onValueChange]
  );

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
  }, [draggingCurrentTime, updateCurrentTimeFromMouse]);

  const updateValueFromMouse = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!rulerRef.current) return;

      const rect = rulerRef.current.getBoundingClientRect();
      const x = (e instanceof MouseEvent ? e.clientX : e.clientX) - rect.left;
      const width = rect.width;

      const percentage = Math.max(0, Math.min(1, x / width));
      const newValue = minValue + (maxValue - minValue) * percentage;

      const snappedValue = Math.round(newValue / step) * step;
      const clampedValue = Math.max(0, Math.min(maxValue, snappedValue));

      if (draggingHandle === "start") {
        const newStartTime = Math.min(clampedValue, localEndTime - step);
        setLocalStartTime(newStartTime);
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
    },
    [
      minValue,
      maxValue,
      step,
      localEndTime,
      localStartTime,
      draggingHandle,
      segments,
      activeSegment,
      onStartTimeChange,
      onEndTimeChange,
      onValueChange,
    ]
  );

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        updateValueFromMouse(e);
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isDragging, updateValueFromMouse]);

  const addSegment = () => {
    const newSegment = { start: 0, end: maxValue };
    setSegments([...segments, newSegment]);
    setActiveSegment(segments.length);
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
        if (newSegments[newActiveSegment]) {
          setLocalStartTime(newSegments[newActiveSegment].start);
          setLocalEndTime(newSegments[newActiveSegment].end);
        }
      } else {
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
          if (newSegments[newActiveSegment]) {
            setLocalStartTime(newSegments[newActiveSegment].start);
            setLocalEndTime(newSegments[newActiveSegment].end);
          }
        } else {
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

  const handleSmartTrim = () => {
    const currentTime = localValue;
    const segmentDuration = 4;
    const startTime = currentTime;
    const endTime = Math.min(maxValue, currentTime + segmentDuration);

    const newSegment = { start: startTime, end: endTime };
    setSegments((prev) => {
      const newSegments = [...prev, newSegment];
      setActiveSegment(newSegments.length - 1);
      return newSegments;
    });

    setLocalStartTime(startTime);
    setLocalEndTime(endTime);

    console.log(
      `Created segment from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s`
    );
  };

  const generateTicks = () => {
    const ticks = [];
    const totalRange = maxValue - minValue;

    for (let i = 0; i <= totalRange / majorStep; i++) {
      const value = minValue + i * majorStep;
      ticks.push({
        value,
        type: "major",
        label: value.toFixed(2),
        height: 20,
      });
    }

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

  // const ticks = generateTicks();
  const currentPosition =
    ((localValue - minValue) / (maxValue - minValue)) * 100;

  return (
    <div className="w-full max-w-6xl mx-auto p-8">
      <div className="flex flex-row items-center justify-between w-full mb-4 gap-2 sm:gap-4">
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
        <div className="absolute top-0 left-12 right-12 h-12 z-20">
          {generateTicks().map((tick, index) => {
            const position =
              ((tick.value - minValue) / (maxValue - minValue)) * 100;
            return (
              <div
                key={`${tick.type}-${index}`}
                className="absolute top-0"
                style={{ left: `${position}%` }}
              >
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
                {tick.type === "major" && (
                  <div
                    className={`absolute top-10 ${
                      tick.value === minValue
                        ? "left-1/2 transform translate-x-2"
                        : tick.value === maxValue
                          ? "left-1/2 transform -translate-x-10"
                          : "left-1/2 transform -translate-x-1/2"
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
        <div
          ref={rulerRef}
          className="relative h-32 bg-white border-2 border-[#A594F9] rounded-lg cursor-pointer mt-12"
          onMouseDown={(e) => {
            if (!draggingScissor) {
              setDraggingCurrentTime(true);
              updateCurrentTimeFromMouse(e);
            }
          }}
        >
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
          <div
            className="absolute top-0 w-1 h-full bg-green-500 z-10"
            style={{ left: `${currentPosition}%` }}
          >
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-b-6 border-l-transparent border-r-transparent border-b-green-500" />
          </div>
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
                <div className="absolute top-2 left-2 text-xs font-bold text-blue-800 bg-white bg-opacity-80 px-1 rounded">
                  S{idx + 1}
                </div>
              </div>
            );
          })}
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
        <div className="mt-4 text-center">
          <span className="text-base font-medium text-[#A594F9]">
            Current: {localValue.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
