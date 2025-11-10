"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { ZoomEffect } from "../types/editor/zoom-effect";
import Linepage from "./Linepage";

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
  processing?: boolean;
  onResetVideo?: () => void;
  onZoomEffectCreate?: (effect: ZoomEffect) => void;
  initialSegments?: { start: string; end: string }[];
  onTrim?: (segments: { start: string; end: string }[]) => Promise<void>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  isFullscreen: boolean;
  handleFullscreen: () => void;
}

export default function TimelineRuler({
  minValue = 0.05,
  maxValue = 1.0,
  currentValue = 0.07,
  onValueChange,
  step = 0.002,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  processing = false,
  onResetVideo,
  onZoomEffectCreate,
  initialSegments,
  setPlaying,
  handleFullscreen,
}: TimelineRulerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingHandle] = useState<"current" | "start" | "end" | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(currentValue || 0);

  // Initialize with full duration by default
  const [localStartTime, setLocalStartTime] = useState(startTime ?? minValue);
  const [localEndTime, setLocalEndTime] = useState(endTime ?? maxValue);

  const [segments, setSegments] = useState<{ start: number; end: number }[]>(
    initialSegments
      ? initialSegments.map((seg) => ({
          start: parseFloat(seg.start),
          end: parseFloat(seg.end),
        }))
      : [{ start: minValue, end: maxValue }] // Initialize with full duration segment
  );
  const [activeSegment, setActiveSegment] = useState(0);
  const [removedSegments, setRemovedSegments] = useState<{ start: number; end: number }[]>([]);
  const [draggingScissor, setDraggingScissor] = useState<"left" | "right" | null>(null);
  const [scissorPreview, setScissorPreview] = useState<number | null>(null);
  const [draggingCurrentTime, setDraggingCurrentTime] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // Start with no zoom
  const [scrollLeft, setScrollLeft] = useState(0);
  //const [isAutoPlaying] = useState(false);
  const [playheadMode, setPlayheadMode] = useState<"trim" | "non-trim">("non-trim");
  const [selectedTrimIdx, setSelectedTrimIdx] = useState<number | null>(null);
  const FIXED_TRIM_DURATION = 4; // Fixed duration in seconds for initial trim
  //const PLAYHEAD_SPEED = 0.005; // Speed in seconds per frame (increased for visible movement)

  // Use refs to avoid animation interruption when segments change
  const segmentsRef = useRef(segments);
  const playheadModeRef = useRef(playheadMode);
  const selectedTrimIdxRef = useRef(selectedTrimIdx);
  const onValueChangeRef = useRef(onValueChange);
  const onStartTimeChangeRef = useRef(onStartTimeChange);
  const onEndTimeChangeRef = useRef(onEndTimeChange);
  const isUpdatingFromPropRef = useRef(false);

  // Helper function to immediately switch to trim mode
  const switchToTrimMode = (trimIdx: number) => {
    console.log(
      `[MODE] Switching to TRIM mode, trimIdx=${trimIdx}, segment=${JSON.stringify(segments[trimIdx])}`
    );
    playheadModeRef.current = "trim";
    selectedTrimIdxRef.current = trimIdx;
    setPlayheadMode("trim");
    setSelectedTrimIdx(trimIdx);
    setLocalValue(segments[trimIdx].start);
  };

  // Helper function to immediately switch to non-trim mode
  const switchToNonTrimMode = () => {
    playheadModeRef.current = "non-trim";
    selectedTrimIdxRef.current = null;
    setPlayheadMode("non-trim");
    setSelectedTrimIdx(null);

    // Snap playhead to the gap it's in (or nearest gap)
    setLocalValue((currentPos) => {
      const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

      // Check if currentPos is inside a trimmed section
      for (let i = 0; i < sortedSegments.length; i++) {
        if (currentPos >= sortedSegments[i].start && currentPos < sortedSegments[i].end) {
          // Jump to the next gap after this segment
          if (i + 1 < sortedSegments.length) {
            return sortedSegments[i].end;
          } else {
            return sortedSegments[i].end;
          }
        }
      }

      // If we're already in a gap, keep current position
      return currentPos;
    });
  };

  // Update refs whenever they change
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    playheadModeRef.current = playheadMode;
  }, [playheadMode]);

  useEffect(() => {
    selectedTrimIdxRef.current = selectedTrimIdx;
  }, [selectedTrimIdx]);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    onStartTimeChangeRef.current = onStartTimeChange;
  }, [onStartTimeChange]);

  useEffect(() => {
    onEndTimeChangeRef.current = onEndTimeChange;
  }, [onEndTimeChange]);

  // Check if video has been trimmed (multiple segments or segment doesn't span full duration)
  const hasBeenTrimmed =
    segments.length > 1 ||
    (segments.length === 1 &&
      (Math.abs(segments[0].start - minValue) > 0.001 ||
        Math.abs(segments[0].end - maxValue) > 0.001));

  const baseTimelineWidth = 956; // Fixed base width for the timeline
  const zoomedTimelineWidth = baseTimelineWidth * zoomLevel;
  //const scissorWidth = 48; // Fixed width for scissors (12 * 4 = 48px)
  //const totalContainerWidth = baseTimelineWidth + scissorWidth * 2; // Total container width

  // Keep scrollLeft in range when zoom changes
  useEffect(() => {
    if (!scrollContainerRef.current) {
      return;
    }

    const newTimelineWidth = baseTimelineWidth * zoomLevel;
    const maxScroll = Math.max(0, newTimelineWidth - baseTimelineWidth);

    const clampedScrollLeft = Math.min(scrollLeft, maxScroll);
    if (clampedScrollLeft !== scrollLeft) {
      setScrollLeft(clampedScrollLeft);
      scrollContainerRef.current.scrollLeft = clampedScrollLeft;
    }
  }, [zoomLevel, baseTimelineWidth, scrollLeft]);

  useEffect(() => {
    const el = rulerRef.current;
    if (!el) {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorRatio = cursorX / baseTimelineWidth; // Use base width for ratio calculation

        setZoomLevel((prev) => {
          const factor = e.deltaY < 0 ? 1.25 : 0.8;
          const newZoom = Math.max(1, Math.min(prev * factor, 20));

          // Only adjust scroll if zoomed in beyond 1x
          if (newZoom > 1 && scrollContainerRef.current) {
            const newTimelineWidth = baseTimelineWidth * newZoom;
            const maxScroll = Math.max(0, newTimelineWidth - baseTimelineWidth);
            const targetScrollLeft = cursorRatio * newTimelineWidth - cursorX;
            const clampedScrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScroll));

            setScrollLeft(clampedScrollLeft);
            scrollContainerRef.current.scrollLeft = clampedScrollLeft;
          }

          return newZoom;
        });
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [baseTimelineWidth]);

  // const formatTime = (time: number) => {
  //   const minutes = Math.floor(time / 60);
  //   const seconds = Math.floor(time % 60);

  //   return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  // };

  useEffect(() => {
    isUpdatingFromPropRef.current = true;
    setLocalValue(currentValue);
  }, [currentValue]);

  useEffect(() => {
    if (startTime !== undefined) {
      setLocalStartTime(startTime);
    }
  }, [startTime]);

  useEffect(() => {
    if (endTime !== undefined) {
      setLocalEndTime(endTime);
    }
  }, [endTime]);

  useEffect(() => {
    if (segments[activeSegment]) {
      setLocalStartTime(segments[activeSegment].start);
      setLocalEndTime(segments[activeSegment].end);
    }
  }, [activeSegment, segments]);

  useEffect(() => {
    if (!draggingScissor) {
      return;
    }
    const onMove = (e: MouseEvent) => {
      if (!rulerRef.current) {
        return;
      }
      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, x / width));
      const value = minValue + (maxValue - minValue) * percentage;
      setScissorPreview(value);
    };
    const onUp = () => {
      if (scissorPreview !== null) {
        if (draggingScissor === "left" && scissorPreview > minValue && scissorPreview < maxValue) {
          setSegments((prev) => [...prev, { start: minValue, end: scissorPreview }]);
          setActiveSegment(segments.length);
        } else if (
          draggingScissor === "right" &&
          scissorPreview > minValue &&
          scissorPreview < maxValue
        ) {
          setSegments((prev) => [...prev, { start: scissorPreview, end: maxValue }]);
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
      if (!rulerRef.current) {
        return;
      }
      const rect = rulerRef.current.getBoundingClientRect();
      const x = (e instanceof MouseEvent ? e.clientX : e.nativeEvent.clientX) - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, x / width));
      const value = minValue + (maxValue - minValue) * percentage;

      // Allow clicking anywhere - no skipping logic
      setLocalValue(value);
    },
    [minValue, maxValue]
  );

  useEffect(() => {
    if (!draggingCurrentTime) {
      return;
    }
    const onMove = (e: MouseEvent) => {
      updateCurrentTimeFromMouse(e);
    };
    const onUp = () => {
      setPlaying(false);
      setDraggingCurrentTime(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingCurrentTime, updateCurrentTimeFromMouse, setPlaying]);

  const updateValueFromMouse = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!rulerRef.current) {
        return;
      }

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
        onStartTimeChangeRef.current?.(newStartTime);
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
        onEndTimeChangeRef.current?.(newEndTime);
      } else {
        setLocalValue(clampedValue);
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

  // const addSegment = () => {
  //   const newSegment = { start: minValue, end: maxValue };
  //   setSegments([...segments, newSegment]);
  //   setActiveSegment(segments.length);
  //   setLocalStartTime(newSegment.start);
  //   setLocalEndTime(newSegment.end);
  // };

  const removeSegment = (idx: number) => {
    const newSegments = segments.filter((_, i) => i !== idx);
    setSegments(newSegments);
    const newActiveSegment = Math.min(activeSegment, newSegments.length - 1);
    setActiveSegment(newActiveSegment);
    if (newSegments[newActiveSegment]) {
      setLocalStartTime(newSegments[newActiveSegment].start);
      setLocalEndTime(newSegments[newActiveSegment].end);
    }
    // If all segments are deleted, switch to NON-TRIM mode for continuous playback
    if (newSegments.length === 0) {
      switchToNonTrimMode();
    }
  };

  const handleUndo = () => {
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      setRemovedSegments((prev) => [...prev, lastSegment]);
      setSegments((prev) => {
        const newSegments = prev.slice(0, -1);
        const newActiveSegment = Math.min(activeSegment, newSegments.length - 1);
        setActiveSegment(newActiveSegment);
        if (newSegments[newActiveSegment]) {
          setLocalStartTime(newSegments[newActiveSegment].start);
          setLocalEndTime(newSegments[newActiveSegment].end);
        }

        // If all segments are deleted, switch to NON-TRIM mode for continuous playback
        if (newSegments.length === 0) {
          switchToNonTrimMode();
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

  const handleSmartTrim = () => {
    const currentTime = localValue;
    const startTime = Math.max(minValue, currentTime);
    const endTime = Math.min(maxValue, currentTime + FIXED_TRIM_DURATION);

    const newSegment = { start: startTime, end: endTime };
    setSegments((prev) => {
      const newSegments = [...prev, newSegment];
      setActiveSegment(newSegments.length - 1);
      return newSegments;
    });

    setLocalStartTime(startTime);
    setLocalEndTime(endTime);

    console.log(`Created segment from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s`);
  };

  // Auto-play playhead movement intentionally disabled. Legacy block removed.

  // Separate effect to call onValueChange callback after localValue updates
  // But skip if the update came from a prop change
  useEffect(() => {
    if (isUpdatingFromPropRef.current) {
      isUpdatingFromPropRef.current = false;
      return;
    }
    onValueChangeRef.current?.(localValue);
  }, [localValue]);

  // const generateTicks = () => {
  //   const ticks: { value: number; type: string; label?: string }[] = [];

  //   const totalRange = maxValue - minValue;
  //   const targetTickCount = 8 * zoomLevel; // Increase with zoom
  //   const roughStep = totalRange / targetTickCount;

  //   // Round major step to nearest integer second >= 1
  //   const majorStep = Math.max(1, Math.round(roughStep));

  //   // Always keep an odd number of subdivisions
  //   let divisions = 5; // default = 5 ticks (1 major + 4 minors)
  //   if (zoomLevel > 3) {
  //     divisions = 7;
  //   }
  //   if (zoomLevel > 6) {
  //     divisions = 9;
  //   }
  //   if (zoomLevel > 10) {
  //     divisions = 11;
  //   }

  //   const minorStep = majorStep / (divisions - 1);
  //   const midIndex = Math.floor(divisions / 2); // middle tick index

  //   // Start from nearest major tick
  //   const startMajorTick = Math.ceil(minValue / majorStep) * majorStep;

  //   for (let v = startMajorTick; v <= maxValue; v += majorStep) {
  //     ticks.push({ value: v, type: "major", label: formatTime(v) });

  //     // Add subdivisions
  //     for (let i = 1; i < divisions; i++) {
  //       const tickVal = v + i * minorStep;
  //       if (tickVal < v + majorStep && tickVal < maxValue) {
  //         ticks.push({
  //           value: tickVal,
  //           type: i === midIndex ? "middle" : "minor",
  //         });
  //       }
  //     }
  //   }
  //   console.log("ticks", ticks);
  //   return ticks;
  // };

  const currentPosition = ((localValue - minValue) / (maxValue - minValue)) * zoomedTimelineWidth;
  const handleZoomClick = () => {
    if (!onZoomEffectCreate) {
      return;
    }
    onZoomEffectCreate({
      id: Date.now().toString(),
      startTime: Math.max(0, localValue - 1),
      endTime: Math.min(maxValue, localValue + 2),
      zoomLevel: 2.0,
      x: 0.5,
      y: 0.5,
    });
  };
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex flex-row items-center justify-between w-full mb-6 gap-3 sm:gap-6 ">
        <div className="flex gap-3 sm:gap-4 items-center">
          <button
            onClick={handleZoomClick}
            className="h-[50.85px] w-[111.71px] px-4 flex items-center justify-center gap-1 font-medium bg-white text-[#8A76FC] text-sm rounded-lg hover:shadow-md transition-all duration-200"
          >
            <Image src="/icons/zoooom.svg" alt="Zoom" width={26} height={26} />
            <span className="text-sm font-medium leading-none">Zoom</span>
          </button>

          {/* <button
            onClick={addSegment}
            className="h-10 px-4 flex items-center justify-center gap-2 font-medium bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
          >
            <Image
              src="/icons/+.svg"
              alt="Add"
              width={16}
              height={16}
              className="w-5 h-5 brightness-0 invert"
            />
            Add Segment
          </button> */}

          <button
            onClick={handleSmartTrim}
            disabled={processing}
            className="h-[50.85px] w-[111.71px] px-4 flex items-center justify-center gap-2 font-medium bg-white text-[#8A76FC] text-sm rounded-lg hover:shadow-md transition-all duration-200"
          >
            <Image src="/icons/trim-new.svg" alt="Trim" width={16} height={16} />
            <span className="text-sm font-medium leading-none"> Trim </span>
          </button>
          {/* Reset Timeline  */}
          {onResetVideo && hasBeenTrimmed && (
            <button
              onClick={onResetVideo}
              className="h-[50.85px] w-[163px] px-4 flex items-center justify-center gap-2 font-medium bg-white text-[#8A76FC] text-sm rounded-lg hover:shadow-md transition-all duration-200"
            >
              <span className="text-sm font-medium leading-none"> Reset Timeline </span>
            </button>
          )}
          {/* <button
            onClick={() => removeSegment(activeSegment)}
            disabled={segments.length === 0}
            className="h-10 px-4 flex items-center justify-center gap-2 font-medium bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-red-400 disabled:to-red-500"
          >
            <Image
              src="/icons/delete-demo.svg"
              alt="Delete"
              width={16}
              height={16}
              className="w-5 h-5 brightness-0 invert"
            />
            Delete
          </button> */}
          {/* Zoom Slider */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100/80 rounded-lg backdrop-blur-sm ">
            {/* Minus button */}
            <button
              onClick={() => setZoomLevel((prev) => Math.max(1, prev * 0.8))}
              className="text-gray-600 hover:text-purple-600 hover:bg-white rounded p-1 transition-colors"
              title="Zoom out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>

            {/* Slider */}
            <input
              type="range"
              min="1"
              max="20"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #8A76FC ${
                  ((zoomLevel - 1) / (20 - 1)) * 100
                }%, #E9D8FD ${((zoomLevel - 1) / (20 - 1)) * 100}%)`,
              }}
              className="
                w-[170px] h-[13px]
                rounded-full appearance-none cursor-pointer

            [&::-webkit-slider-runnable-track]:h-2
            [&::-webkit-slider-runnable-track]:rounded-full

            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4 
            [&::-webkit-slider-thumb]:w-4 
            [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-[#8A76FC]
            [&::-webkit-slider-thumb]:shadow
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:relative
            [&::-webkit-slider-thumb]:z-10
            [&::-webkit-slider-thumb]:-mt-1

            [&::-moz-range-track]:h-2
            [&::-moz-range-track]:rounded-full
            [&::-moz-range-track]:bg-purple-200

            [&::-moz-range-progress]:h-2
            [&::-moz-range-progress]:rounded-full
            [&::-moz-range-progress]:bg-[#8A76FC]

            accent-[#8A76FC]
          "
            />

            {/* Plus button */}
            <button
              onClick={() => setZoomLevel((prev) => Math.min(20, prev * 1.25))}
              className="text-gray-600 hover:text-purple-600 hover:bg-white rounded p-1 transition-colors"
              title="Zoom in"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>

            {/* Zoom level display */}
            <span className="text-xs font-medium text-gray-700 ml-1 w-10 text-right">
              {zoomLevel.toFixed(1)}x
            </span>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3 items-center">
          <button
            onClick={handleFullscreen}
            disabled={segments.length === 0}
            className="h-[51px] w-[51px] px-3 flex items-center justify-center font-medium bg-white hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="FullScreen"
          >
            <Image src="/icons/Group 316.svg" alt="fullscreen" width={18.67} height={21} />
          </button>
          <button
            onClick={() => removeSegment(activeSegment)}
            disabled={segments.length === 0}
            className="h-[51px] w-[51px] px-3 flex items-center justify-center font-medium bg-white hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Delete"
          >
            <Image src="/icons/Vector (1) copy.svg" alt="delete_icon" width={18.67} height={21} />
          </button>
          <button
            onClick={() => {
              console.log("Screen Fliped");
            }}
            disabled={segments.length === 0}
            className="h-[51px] w-[51px] px-3 flex items-center justify-center font-medium bg-white hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Flip Video"
          >
            <Image src="/icons/Vector copy.svg" alt="flip_icon" width={23.33} height={23.33} />
          </button>
          <button
            onClick={handleUndo}
            disabled={segments.length === 0}
            className="h-[51px] w-[51px] px-3 flex items-center justify-center font-medium bg-white hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Image src="/icons/undo.svg" alt="Undo" width={18.41} height={14.71} />
          </button>
          <button
            onClick={handleRedo}
            disabled={removedSegments.length === 0}
            className="h-[51px] w-[51px] px-3 flex items-center justify-center font-medium bg-white hover:bg-gray-50 text-gray-700 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo"
          >
            <Image src="/icons/redo.svg" alt="Redo" width={18.41} height={14.71} />
          </button>
          {/* {onResetVideo && hasBeenTrimmed && (
            <button
              onClick={onResetVideo}
              className="h-10 px-4 flex items-center justify-center gap-2 font-medium bg-linear-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
            >
              <Image
                src="/icons/reset.png"
                alt="Reset"
                width={16}
                height={16}
                className="w-4 h-4 brightness-0 invert"
              />
              Reset video
            </button>
          )} */}
        </div>
      </div>

      {/* {zoomLevel > 1 && (
        <div className="mb-2 text-sm text-gray-600">
          Zoom: {zoomLevel.toFixed(1)}x (Ctrl+Scroll to zoom)
        </div>
      )} */}

      {/* Timeline Container - Fixed width */}
      <div className="max-w-[1379px] h-[173px]">
        <div
          className=" flex items-center justify-between bg-transparent"
          style={{ height: "173px" }}
        >
          {/* Left Scissor - Fixed position and size */}
          <div
            className="
            flex flex-col items-center justify-between
            bg-[#8A76FC]
            rounded-l-lg
            cursor-ew-resize
            z-30
            shrink-0
            select-none
            py-3
          "
            style={{ width: "32px", height: "173px" }}
            onMouseDown={() => {
              setDraggingScissor("left");
              setScissorPreview(null);
            }}
          >
            <div
              className="
            flex flex-col items-center justify-between
            bg-[#8A76FC]
            rounded-l-lg
            cursor-ew-resize
            z-30
            shrink-0
            select-none
            "
              style={{ width: "20px", height: "143.5px" }}
            >
              {/* Top Line */}
              <div className="w-px bg-white/80" style={{ height: "55.5px" }} />

              {/* Scissor Icon */}
              <Image
                src="/icons/trim-new.svg"
                alt="Trim"
                width={20}
                height={20}
                style={{ filter: "brightness(0) invert(1)" }}
              />

              {/* Bottom Line */}
              <div className="w-px bg-white/80" style={{ height: "55.5px" }} />
            </div>
          </div>

          {/* Scrollable Timeline Container - Fixed width */}
          <div
            className=" flex-1 h-full overflow-hidden"
            // style={{ width: `${1000}px`, height: "100%" }}
          >
            <div
              ref={scrollContainerRef}
              className={` w-full h-full overflow-y-hidden ${
                zoomLevel > 1 ? "overflow-x-auto" : "overflow-x-hidden"
              }`}
              onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            >
              <div
                ref={rulerRef}
                className="relative bg-white border-y border-[#A594F9] cursor-pointer "
                style={{
                  width: "100%",
                  minWidth: `${baseTimelineWidth}px`,
                  height: "100%",
                  // paddingLeft: "20px",
                  // paddingRight: "20px",
                  boxSizing: "border-box",
                }}
                onMouseDown={(e) => {
                  if (!draggingScissor) {
                    setDraggingCurrentTime(true);
                    updateCurrentTimeFromMouse(e);
                    // Switch to non-trim mode when clicking on timeline
                    switchToNonTrimMode();
                  }
                }}
                onClick={(e) => {
                  // Also switch to non-trim mode on click if not on a segment
                  const target = e.target as HTMLElement;
                  if (!target.closest('[class*="segment"]')) {
                    switchToNonTrimMode();
                  }
                }}
              >
                <Linepage
                  maxValue={maxValue}
                  minValue={minValue}
                  zoomLevel={zoomLevel}
                  width={zoomedTimelineWidth}
                />
                {/* {generateTicks().map((tick, index) => {
                  const positionPx =
                    ((tick.value - minValue) / (maxValue - minValue)) * zoomedTimelineWidth;

                  return (
                    <div
                      key={`${tick.type}-${index}`}
                      className="absolute"
                      style={{ left: `${positionPx}px`, top: "0" }}
                    >
                      <div
                        className={`bg-[#A594F9] mx-auto ${
                          tick.type === "major"
                            ? "w-0.5 h-6"
                            : tick.type === "middle"
                              ? "w-0.5 h-5"
                              : "w-px h-3"
                        }`}
                      />
                      {tick.type === "major" && (
                        <div className="absolute top-7 -translate-x-1/2 left-1/2">
                          <span className="text-xs text-[#A594F9] font-medium">{tick.label}</span>
                        </div>
                      )}
                    </div>
                  );
                })} */}
                {/* Current position line + triangle */}
                <div
                  className="absolute top-0 h-full z-40 pointer-events-none"
                  style={{
                    left: `${0 + currentPosition - scrollLeft}px`,
                  }}
                >
                  {/* Triangle head */}
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2
               w-0 h-0 
               border-l-[9px] border-r-[9px] border-t-[9px]
               border-l-transparent border-r-transparent border-t-green-500"
                  />

                  {/* Vertical line */}
                  <div className="w-0.5 h-full bg-green-500 mx-auto" />
                </div>
                {/* Segments */}
                {segments.map((segment, idx) => {
                  const startPosition =
                    ((segment.start - minValue) / (maxValue - minValue)) * zoomedTimelineWidth;
                  const endPosition =
                    ((segment.end - minValue) / (maxValue - minValue)) * zoomedTimelineWidth;
                  const width = endPosition - startPosition;

                  return (
                    <div
                      key={`segment-${idx}`}
                      className={`absolute top-0 h-[84px] mt-[50px] z-10 group cursor-pointer transition-opacity ${
                        idx === activeSegment
                          ? "bg-green-400 opacity-70"
                          : "bg-green-300 opacity-50 hover:opacity-65"
                      }`}
                      style={{
                        left: `${startPosition}px`,
                        width: `${width}px`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSegment(idx);
                        switchToTrimMode(idx);
                      }}
                    >
                      {/* Segment Label */}
                      <div className="absolute top-2 left-2 text-[11px] font-bold text-green-900 bg-white bg-opacity-80 px-2 py-1 rounded pointer-events-none">
                        Trim {idx + 1}
                      </div>

                      {/* Left Resize Handle */}
                      <div
                        className="absolute top-0 -left-1 h-full w-2 bg-green-600 opacity-0 group-hover:opacity-100 cursor-ew-resize transition-opacity hover:bg-green-700 hover:w-3"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        title="Drag to resize start"
                      />

                      {/* Right Resize Handle */}
                      <div
                        className="absolute top-0 -right-1 h-full w-2 bg-green-600 opacity-0 group-hover:opacity-100 cursor-ew-resize transition-opacity hover:bg-green-700 hover:w-3"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        title="Drag to resize end"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Scissor - Fixed position and size */}
          <div
            className="
            flex flex-col items-center justify-between
            bg-[#8A76FC]
            rounded-r-lg
            cursor-ew-resize
            z-30
            shrink-0
            select-none
            py-3
          "
            style={{ width: "32px", height: "173px" }}
            onMouseDown={() => {
              setDraggingScissor("right");
              setScissorPreview(null);
            }}
          >
            <div
              className="
            flex flex-col items-center justify-between
            bg-[#8A76FC]
            rounded-r-lg
            cursor-ew-resize
            z-30
            shrink-0
            select-none
            "
              style={{ width: "20px", height: "143.5px" }}
            >
              {/* Top Line */}
              <div className="w-px bg-white/80" style={{ height: "55.5px" }} />

              {/* Scissor Icon */}
              <Image
                src="/icons/trim-new.svg"
                alt="Trim"
                width={20}
                height={20}
                style={{ filter: "brightness(0) invert(1)", transform: "scaleX(-1)" }}
              />

              {/* Bottom Line */}
              <div className="w-px bg-white/80" style={{ height: "55.5px" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Current value display */}
      <div className="mt-2 text-center">
        <span className="text-sm font-medium text-[#A594F9]">
          Current: {localValue.toFixed(2)}s
        </span>
      </div>
    </div>
  );
}
