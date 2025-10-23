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
  const [removedSegments, setRemovedSegments] = useState<
    { start: number; end: number }[]
  >([]);
  const [hasBeenTrimmed, setHasBeenTrimmed] = useState(false);
  const [draggingScissor, setDraggingScissor] = useState<
    "left" | "right" | null
  >(null);
  const [scissorPreview, setScissorPreview] = useState<number | null>(null);
  const [draggingCurrentTime, setDraggingCurrentTime] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // Start with no zoom
  const [scrollLeft, setScrollLeft] = useState(0);
  const [resizingSegmentIdx, setResizingSegmentIdx] = useState<number | null>(
    null
  );
  const [resizingHandle, setResizingHandle] = useState<"start" | "end" | null>(
    null
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [playheadMode, setPlayheadMode] = useState<"trim" | "non-trim">("non-trim");
  const [selectedTrimIdx, setSelectedTrimIdx] = useState<number | null>(null);
  const FIXED_TRIM_DURATION = 4; // Fixed duration in seconds for initial trim
  const PLAYHEAD_SPEED = 0.005; // Speed in seconds per frame (increased for visible movement)

  // Use refs to avoid animation interruption when segments change
  const segmentsRef = useRef(segments);
  const playheadModeRef = useRef(playheadMode);
  const selectedTrimIdxRef = useRef(selectedTrimIdx);
  const onValueChangeRef = useRef(onValueChange);
  
  // Helper function to immediately switch to trim mode
  const switchToTrimMode = (trimIdx: number) => {
    console.log(`[MODE] Switching to TRIM mode, trimIdx=${trimIdx}, segment=${JSON.stringify(segments[trimIdx])}`);
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
      // Find the gap boundaries for the current position
      let gapStart = minValue;
      let gapEnd = maxValue;
      
      const sortedSegments = [...segments].sort((a, b) => a.start - b.start);
      
      // Check if currentPos is inside a trimmed section
      let isInTrimmedSection = false;
      for (let i = 0; i < sortedSegments.length; i++) {
        if (currentPos >= sortedSegments[i].start && currentPos < sortedSegments[i].end) {
          isInTrimmedSection = true;
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

  const baseTimelineWidth = 1050; // Fixed base width for the timeline
  const zoomedTimelineWidth = baseTimelineWidth * zoomLevel;
  const scissorWidth = 48; // Fixed width for scissors (12 * 4 = 48px)
  const totalContainerWidth = baseTimelineWidth + scissorWidth * 2; // Total container width

  // Keep scrollLeft in range when zoom changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;

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
    if (!el) return;

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
            const clampedScrollLeft = Math.max(
              0,
              Math.min(targetScrollLeft, maxScroll)
            );

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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

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

      // Allow clicking anywhere - no skipping logic
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
    const newSegment = { start: minValue, end: maxValue };
    setSegments([...segments, newSegment]);
    setActiveSegment(segments.length);
    setLocalStartTime(newSegment.start);
    setLocalEndTime(newSegment.end);
  };

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
        const newActiveSegment = Math.min(
          activeSegment,
          newSegments.length - 1
        );
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

    console.log(
      `Created segment from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s`
    );
  };

  // Handle segment resize
  useEffect(() => {
    if (resizingSegmentIdx === null || resizingHandle === null) return;

    const onMove = (e: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const percentage = Math.max(0, Math.min(1, x / width));
      const value = minValue + (maxValue - minValue) * percentage;

      setSegments((prev) => {
        const updated = [...prev];
        const segment = updated[resizingSegmentIdx];

        if (resizingHandle === "start") {
          // Don't let start go past end, maintain minimum duration
          segment.start = Math.min(value, segment.end - 0.1);
        } else if (resizingHandle === "end") {
          // Don't let end go before start, maintain minimum duration
          segment.end = Math.max(value, segment.start + 0.1);
        }

        return updated;
      });
    };

    const onUp = () => {
      setResizingSegmentIdx(null);
      setResizingHandle(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingSegmentIdx, resizingHandle, minValue, maxValue]);

  // Auto-play playhead movement
  useEffect(() => {
    if (!isAutoPlaying) {
      console.log("[ANIMATION] isAutoPlaying is FALSE, not starting");
      return;
    }
    console.log("[ANIMATION] Starting animation loop, isAutoPlaying=true");

    const animationInterval = setInterval(() => {
      setLocalValue((currentVal) => {
        let nextValue = currentVal + PLAYHEAD_SPEED;
        const currentMode = playheadModeRef.current;
        const currentSegments = segmentsRef.current;
        const currentSelectedIdx = selectedTrimIdxRef.current;
        let finalValue = currentVal;

        if (currentMode === "trim" && currentSelectedIdx !== null) {
          // TRIM MODE: Move within trim section, loop back to start when reaching end
          const selectedSegment = currentSegments[currentSelectedIdx];
          if (selectedSegment) {
            // Check if we've reached the end of the segment
            if (nextValue >= selectedSegment.end) {
              // Loop back to the start of the segment
              finalValue = selectedSegment.start;
            } else {
              // Move within the segment
              finalValue = nextValue;
            }
          }
        } else {
          // NON-TRIM MODE: Move through gaps only, skip trimmed sections, jump to next gap when current gap ends
          let gapStart = minValue;
          let gapEnd = maxValue;
          let currentGapIndex = -1; // Track which gap we're in

          // Sort segments by start position
          const sortedSegments = [...currentSegments].sort((a, b) => a.start - b.start);

          // First, check if currentVal is already inside a trimmed section
          let isInTrimmedSection = false;
          for (let i = 0; i < sortedSegments.length; i++) {
            if (currentVal >= sortedSegments[i].start && currentVal < sortedSegments[i].end) {
              isInTrimmedSection = true;
              break;
            }
          }

          // If we're inside a trimmed section, jump to the next gap after it
          if (isInTrimmedSection) {
            for (let i = 0; i < sortedSegments.length; i++) {
              if (currentVal < sortedSegments[i].end) {
                // Found the segment we're in, set gap after it
                if (i + 1 < sortedSegments.length) {
                  gapStart = sortedSegments[i].end;
                  gapEnd = sortedSegments[i + 1].start;
                  currentGapIndex = i + 1; // Gap after segment i
                } else {
                  gapStart = sortedSegments[i].end;
                  gapEnd = maxValue;
                  currentGapIndex = sortedSegments.length; // Gap after last segment
                }
                break;
              }
            }
          } else {
            // We're in a gap, find which one
            // Gap 0: minValue to segment[0].start
            // Gap 1: segment[0].end to segment[1].start
            // Gap 2: segment[1].end to segment[2].start
            // ... and so on
            
            for (let i = 0; i < sortedSegments.length; i++) {
              if (currentVal < sortedSegments[i].start) {
                // We're in a gap before this segment
                gapEnd = sortedSegments[i].start;
                currentGapIndex = i; // Gap before segment i
                break;
              } else {
                // We passed this segment, update gapStart for next iteration
                gapStart = sortedSegments[i].end;
              }
            }
            // If we didn't break, we're in the gap after the last segment
            if (currentGapIndex === -1) {
              currentGapIndex = sortedSegments.length;
            }
          }

          // DEBUG
          if (currentMode === "non-trim" && currentVal !== 0) {
            console.log(`Non-trim: currentVal=${currentVal.toFixed(4)}, gap=[${gapStart.toFixed(4)}, ${gapEnd.toFixed(4)}], nextValue=${nextValue.toFixed(4)}, gapIdx=${currentGapIndex}`);
          }

          // Move within the gap or jump to next gap when current gap ends
          if (nextValue >= gapEnd) {
            // Current gap is ending, find the next gap
            const sortedSegments = [...currentSegments].sort((a, b) => a.start - b.start);
            let nextGapStart = minValue;
            let nextGapEnd = maxValue;
            
            // Calculate all gap boundaries
            const gaps: Array<{ start: number; end: number }> = [];
            if (sortedSegments.length === 0) {
              gaps.push({ start: minValue, end: maxValue });
            } else {
              // Gap before first segment
              if (sortedSegments[0].start > minValue) {
                gaps.push({ start: minValue, end: sortedSegments[0].start });
              }
              // Gaps between segments
              for (let i = 0; i < sortedSegments.length - 1; i++) {
                if (sortedSegments[i].end < sortedSegments[i + 1].start) {
                  gaps.push({ start: sortedSegments[i].end, end: sortedSegments[i + 1].start });
                }
              }
              // Gap after last segment
              if (sortedSegments[sortedSegments.length - 1].end < maxValue) {
                gaps.push({ start: sortedSegments[sortedSegments.length - 1].end, end: maxValue });
              }
            }
            
            // Find which gap we're in
            let currentGapIdx = -1;
            for (let i = 0; i < gaps.length; i++) {
              if (currentVal >= gaps[i].start && currentVal < gaps[i].end) {
                currentGapIdx = i;
                break;
              }
            }
            
            // Jump to next gap if available
            if (currentGapIdx !== -1 && currentGapIdx + 1 < gaps.length) {
              finalValue = gaps[currentGapIdx + 1].start;
            } else if (gaps.length > 0) {
              // No more gaps, loop back to the first gap
              finalValue = gaps[0].start;
            } else {
              // No gaps available, stop at the end of current gap
              finalValue = gapEnd;
            }
          } else if (nextValue < gapStart) {
            // Shouldn't happen, but just in case
            finalValue = gapStart;
          } else {
            finalValue = nextValue;
          }
        }

        // Call onValueChange callback
        if (onValueChangeRef.current && finalValue !== currentVal) {
          onValueChangeRef.current(finalValue);
        }

        return finalValue;
      });
    }, 33); // ~30fps

    return () => clearInterval(animationInterval);
  }, [isAutoPlaying, minValue, maxValue]);

  // Function to check if a position is within any trimmed section
  const isPositionInTrimmedSection = (position: number): boolean => {
    return segments.some((seg) => position >= seg.start && position <= seg.end);
  };

  // Function to get next valid position after trimmed sections
  const getNextValidPosition = (
    currentPos: number,
    direction: "forward" | "backward"
  ): number => {
    const step = 0.01;

    if (direction === "forward") {
      let pos = currentPos;
      // Move forward and skip any trimmed sections
      while (pos <= maxValue) {
        if (!isPositionInTrimmedSection(pos)) {
          return pos;
        }
        // Find the next segment boundary
        const nextSegment = segments.find((seg) => seg.start >= pos);
        if (nextSegment) {
          pos = nextSegment.end + step;
        } else {
          break;
        }
      }
      return Math.min(maxValue, pos);
    } else {
      let pos = currentPos;
      // Move backward and skip any trimmed sections
      while (pos >= minValue) {
        if (!isPositionInTrimmedSection(pos)) {
          return pos;
        }
        // Find the previous segment boundary
        const prevSegment = [...segments].reverse().find((seg) => seg.end <= pos);
        if (prevSegment) {
          pos = prevSegment.start - step;
        } else {
          break;
        }
      }
      return Math.max(minValue, pos);
    }
  };

  const generateTicks = () => {
    const ticks: { value: number; type: string; label?: string }[] = [];

    const totalRange = maxValue - minValue;
    const targetTickCount = 8 * zoomLevel; // Increase with zoom
    const roughStep = totalRange / targetTickCount;

    // Round major step to nearest integer second >= 1
    const majorStep = Math.max(1, Math.round(roughStep));

    // Always keep an odd number of subdivisions
    let divisions = 5; // default = 5 ticks (1 major + 4 minors)
    if (zoomLevel > 3) divisions = 7;
    if (zoomLevel > 6) divisions = 9;
    if (zoomLevel > 10) divisions = 11;

    const minorStep = majorStep / (divisions - 1);
    const midIndex = Math.floor(divisions / 2); // middle tick index

    // Start from nearest major tick
    const startMajorTick = Math.ceil(minValue / majorStep) * majorStep;

    for (let v = startMajorTick; v <= maxValue; v += majorStep) {
      ticks.push({ value: v, type: "major", label: formatTime(v) });

      // Add subdivisions
      for (let i = 1; i < divisions; i++) {
        const tickVal = v + i * minorStep;
        if (tickVal < v + majorStep && tickVal < maxValue) {
          ticks.push({
            value: tickVal,
            type: i === midIndex ? "middle" : "minor",
          });
        }
      }
    }

    return ticks;
  };

  const currentPosition =
    ((localValue - minValue) / (maxValue - minValue)) * zoomedTimelineWidth;

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
            className="min-w-[80px] h-11 px-5 flex items-center justify-center gap-1 font-semibold border border-purple-500 cursor-pointer text-purple-500 text-sm rounded"
          >
            <Image
              src="/icons/zoooom.svg"
              alt="Zoom"
              width={16}
              height={16}
              className="w-7 h-7 translate-y-0.5"
            />
            Zoom in
          </button>
          <button
            onClick={addSegment}
            className="min-w-[80px] h-11 px-5 flex items-center justify-center gap-1 font-semibold cursor-pointer border border-purple-500 rounded-large text-purple-500 text-sm rounded"
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
            className="min-w-[80px] cursor-pointer h-11 px-5 flex items-center justify-center gap-1 font-semibold text-purple-500 border border-purple-500 text-sm rounded-lg disabled:opacity-60"
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={16}
              height={16}
              className="w-5 h-5"
            />
            Trim & Merge
          </button>
          <button
            onClick={handleSmartTrim}
            disabled={processing}
            className="min-w-[100px] cursor-pointer h-11 px-6 flex items-center justify-center gap-1 font-semibold border border-green-500 text-green-600 text-sm rounded-lg disabled:opacity-60 hover:bg-green-50"
          >
            <Image
              src="/icons/trim-new.svg"
              alt="Trim"
              width={16}
              height={16}
              className="w-4 h-4"
            />
            Add Trim
          </button>
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className="min-w-[80px] cursor-pointer h-11 px-6 flex items-center justify-center gap-1 font-semibold border border-blue-500 text-blue-600 text-sm rounded-lg hover:bg-blue-50"
          >
            {isAutoPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <span className="text-xs font-semibold text-gray-600">Mode:</span>
            <span className={`text-xs font-bold px-2 py-1 rounded ${
              playheadMode === "trim" 
                ? "bg-green-200 text-green-800" 
                : "bg-blue-200 text-blue-800"
            }`}>
              {playheadMode === "trim" ? `Trim Section #${selectedTrimIdx !== null ? selectedTrimIdx + 1 : "—"}` : "All Trims (Skip Non-Trim)"}
            </span>
          </div>

          <button
            onClick={() => removeSegment(activeSegment)}
            disabled={segments.length === 0}
            className="min-w-[80px] cursor-pointer h-11 px-7 flex items-center justify-center gap-1 font-semibold bg-red-200 hover:bg-red-300 text-red-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Image
              src="/icons/delete-demo.svg"
              alt="Delete"
              width={16}
              height={16}
              className="w-5 h-5"
            />
            Delete
          </button>
          {/* Zoom In/Out Slider */}
          {/* Zoom Slider */}
          <div className="relative w-56">
            {/* Minus button */}
            <button
              onClick={() => setZoomLevel((prev) => Math.max(1, prev * 0.8))}
              className="absolute -top-3 left-0 text-purple-400 hover:text-purple-600"
            >
              –
            </button>

            {/* Plus button */}
            <button
              onClick={() => setZoomLevel((prev) => Math.min(20, prev * 1.25))}
              className="absolute -top-3 right-0 text-purple-400 hover:text-purple-600"
            >
              +
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
                w-full h-2 mt-2
                rounded-full appearance-none

            [&::-webkit-slider-runnable-track]:h-2
            [&::-webkit-slider-runnable-track]:rounded-full

            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-3.5 
            [&::-webkit-slider-thumb]:w-3.5 
            [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-[#8A76FC]
            [&::-webkit-slider-thumb]:shadow
            [&::-webkit-slider-thumb]:relative
            [&::-webkit-slider-thumb]:z-10
            [&::-webkit-slider-thumb]:-mt-[3.2px] 

            [&::-moz-range-track]:h-2
            [&::-moz-range-track]:rounded-full
            [&::-moz-range-track]:bg-purple-200

            [&::-moz-range-progress]:h-2
            [&::-moz-range-progress]:rounded-full
            [&::-moz-range-progress]:bg-[#8A76FC]

            accent-[#8A76FC]
          "
            />
          </div>
        </div>
        <div className="flex gap-2 sm:gap-4">
          <button
            onClick={handleUndo}
            disabled={segments.length === 0}
            className="min-w-[40px] cursor-pointer h-8 px-2 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="min-w-[40px] cursor-pointer h-8 px-2 flex items-center justify-center font-semibold bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSegment(idx);
                  switchToTrimMode(idx);
                }}
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

      {/* {zoomLevel > 1 && (
        <div className="mb-2 text-sm text-gray-600">
          Zoom: {zoomLevel.toFixed(1)}x (Ctrl+Scroll to zoom)
        </div>
      )} */}

      {/* Timeline Container - Fixed width */}
      <div
        className="relative mx-auto flex items-center bg-transparent"
        style={{ width: `${totalContainerWidth}px`, height: "123px" }}
      >
        {/* Left Scissor - Fixed position and size */}
        <div
          className="
          flex flex-col items-center justify-between
          h-full w-8
          bg-[#8A76FC]
          rounded-l-lg
          cursor-ew-resize
          z-30
          flex-shrink-0
          select-none
          py-3
        "
          onMouseDown={() => {
            setDraggingScissor("left");
            setScissorPreview(null);
          }}
        >
          {/* Top Line */}
          <div className="w-px h-12 bg-white/80" />

          {/* Scissor Icon */}
          <Image
            src="/icons/trim-new.svg"
            alt="Trim"
            width={20}
            height={20}
            style={{ filter: "brightness(0) invert(1)" }}
          />

          {/* Bottom Line */}
          <div className="w-px h-12 bg-white/80" />
        </div>

        {/* Scrollable Timeline Container - Fixed width */}
        <div
          className="relative flex-shrink-0"
          style={{ width: `${baseTimelineWidth}px`, height: "100%" }}
        >
          <div
            ref={scrollContainerRef}
            className={`w-full h-full  overflow-y-hidden ${
              zoomLevel > 1 ? "overflow-x-auto" : "overflow-x-hidden"
            }`}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          >
            <div
              ref={rulerRef}
              className="relative  bg-white border border-[#A594F9] cursor-pointer"
              style={{
                width: `${zoomedTimelineWidth}px`,
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
              {/* Tick marks */}
              {generateTicks().map((tick, index) => {
                const positionPx =
                  ((tick.value - minValue) / (maxValue - minValue)) *
                  zoomedTimelineWidth;

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
                        <span className="text-xs text-[#A594F9] font-medium">
                          {tick.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Current position line + triangle */}
              <div
                className="absolute top-0 h-full z-40 pointer-events-none"
                style={{
                  left: `${0 + currentPosition - scrollLeft}px`,
                }}
              >
                {/* Triangle head */}
                <div
                  className="absolute -top-0 left-1/2 -translate-x-1/2
               w-0 h-0 
               border-l-[9px] border-r-[9px] border-t-[9px]
               border-l-transparent border-r-transparent border-t-green-500"
                />

                {/* Vertical line */}
                <div className="w-[2px] h-full bg-green-500 mx-auto" />
              </div>

              {/* Segments */}
              {segments.map((segment, idx) => {
                const startPosition =
                  ((segment.start - minValue) / (maxValue - minValue)) *
                  zoomedTimelineWidth;
                const endPosition =
                  ((segment.end - minValue) / (maxValue - minValue)) *
                  zoomedTimelineWidth;
                const width = endPosition - startPosition;

                return (
                  <div
                    key={`segment-${idx}`}
                    className={`absolute top-0 h-full z-10 group cursor-pointer transition-opacity ${
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
                        setResizingSegmentIdx(idx);
                        setResizingHandle("start");
                      }}
                      title="Drag to resize start"
                    />

                    {/* Right Resize Handle */}
                    <div
                      className="absolute top-0 -right-1 h-full w-2 bg-green-600 opacity-0 group-hover:opacity-100 cursor-ew-resize transition-opacity hover:bg-green-700 hover:w-3"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizingSegmentIdx(idx);
                        setResizingHandle("end");
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
            h-full w-8
            bg-[#8A76FC]
            rounded-r-lg
            cursor-ew-resize
            z-30
            flex-shrink-0
            select-none
            py-3
          "
          onMouseDown={() => {
            setDraggingScissor("left");
            setScissorPreview(null);
          }}
        >
          {/* Top Line */}
          <div className="w-px h-12 bg-white/80" />

          {/* Scissor Icon */}
          <Image
            src="/icons/trim-new.svg"
            alt="Trim"
            width={20}
            height={20}
            style={{ filter: "brightness(0) invert(1)" }}
          />

          {/* Bottom Line */}
          <div className="w-px h-12 bg-white/80" />
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
