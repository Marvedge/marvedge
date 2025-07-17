"use client";

import React, {
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReactPlayer from "react-player";
interface TimelineSliderProps {
  duration: number; // Duration in seconds]
  formatTime?: (seconds: number) => string; // Custom time formatter
  onTimeChange?: (time: number) => void; // Callback when time changes
  ontrim: (start: string, end: string) => void;
  processing: boolean;
  playerRef: React.RefObject<ReactPlayer | null>;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  onResetVideo?: () => void;
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
}: TimelineSliderProps) {
  const [start, setstart] = useState(0);
  const [end, setend] = useState(duration);
  const [zoomed, setzoomed] = useState(false);
  const [dragging, setDragging] = useState<null | "start" | "end">(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Default time formatter
  const defaultFormatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs}:${mins}:${secs.toString().padStart(2, "0")}`;
  };
  const timeFormatter = formatTime || defaultFormatTime;

  const toggleZoom = useCallback(() => {
    // ReactPlayer does not support zooming via style directly, so you may want to implement this differently if needed
    setzoomed((z) => !z);
  }, []);

  const handleTrim = useCallback(() => {
    if (isNaN(duration) || duration === 0) {
      alert("Video duration not loaded yet.");
      return;
    }
    if (start >= end) {
      alert("Invalid trim range: Start must be less than End.");
      return;
    }
    ontrim(timeFormatter(start), timeFormatter(end));
  }, [start, end, duration, ontrim, timeFormatter]);

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
    return margin + ((svgWidth - 2 * margin) * t) / duration;
  };
  // Convert X position to time
  const xToTime = useCallback((x: number) => {
    const clamped = Math.max(margin, Math.min(svgWidth - margin, x));
    return ((clamped - margin) / (svgWidth - 2 * margin)) * duration;
  }, [duration, margin, svgWidth]);

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

  // Mouse/touch handlers for dragging handles
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      if (e instanceof MouseEvent) clientX = e.clientX;
      else if (e.touches && e.touches[0]) clientX = e.touches[0].clientX;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left;
      let newTime = xToTime(x); // use floating point for smoothness
      newTime = Math.max(0, Math.min(duration, newTime));
      if (dragging === "start") {
        if (newTime >= end) newTime = end - 0.01;
        setstart(newTime);
        onTimeChange?.(newTime);
        // Sync video preview
        playerRef?.current?.seekTo(newTime, "seconds");
        setCurrentTime(newTime);
      } else if (dragging === "end") {
        if (newTime <= start) newTime = start + 0.01;
        setend(newTime);
        onTimeChange?.(newTime);
        // Sync video preview
        playerRef?.current?.seekTo(newTime, "seconds");
        setCurrentTime(newTime);
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
  }, [dragging, start, end, duration, onTimeChange, playerRef, setCurrentTime, xToTime]);

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
          setstart((prev) => {
            const newStart = Math.max(0, prev - 1);
            return newStart >= end ? end - 1 : newStart;
          });
          break;
        case "]":
          setend((prev) => {
            const newEnd = Math.min(duration, prev + 1);
            return newEnd <= start ? start + 1 : newEnd;
          });
          break;
        case "Enter":
          handleTrim();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration, processing, playerRef, handleTrim, end, start, currentTime, setCurrentTime]);

  // Helper for triangle pointer
  const trianglePoints = (
    x: number,
    y: number,
    w: number,
    h: number,
    direction: "up" | "down"
  ) => {
    if (direction === "down") {
      return `${x},${y} ${x - w / 2},${y + h} ${x + w / 2},${y + h}`;
    } else {
      return `${x},${y} ${x - w / 2},${y - h} ${x + w / 2},${y - h}`;
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
        {/* Controls: Zoom and Trim buttons above timeline */}
        <div className="flex flex-row justify-start gap-2 sm:gap-6 mb-4 w-full">
          <Button
            variant="default"
            onClick={toggleZoom}
            className="flex-1 max-w-[120px] h-12 flex items-center justify-center gap-2 bg-white text-[#7C5CFC] border border-[#7C5CFC] rounded-lg shadow-sm transition-all text-base font-semibold hover:bg-[#F6F3FF] hover:text-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9]"
          >
            <span className="flex items-center gap-2">
              <svg
                width="50"
                height="58"
                viewBox="0 0 10 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline-block align-middle"
              >
                <path
                  d="M19.5 18.5703L16.3634 15.4337M16.3634 15.4337C16.8999 14.8972 17.3255 14.2603 17.6159 13.5593C17.9063 12.8583 18.0557 12.1069 18.0557 11.3482C18.0557 10.5894 17.9063 9.83808 17.6159 9.13708C17.3255 8.43608 16.8999 7.79913 16.3634 7.26261C15.8269 6.72608 15.19 6.30049 14.489 6.01013C13.7879 5.71976 13.0366 5.57031 12.2779 5.57031C11.5191 5.57031 10.7678 5.71976 10.0668 6.01013C9.36577 6.30049 8.72882 6.72608 8.1923 7.26261C7.10874 8.34617 6.5 9.81579 6.5 11.3482C6.5 12.8806 7.10874 14.3502 8.1923 15.4337C9.27586 16.5173 10.7455 17.126 12.2779 17.126C13.8102 17.126 15.2799 16.5173 16.3634 15.4337ZM12.2779 9.18153V13.5148M10.1112 11.3482H14.4445"
                  stroke="#8A76FC"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {zoomed ? "Zoom out" : "Zoom in"}
            </span>
          </Button>
          <Button
            onClick={handleTrim}
            disabled={processing || start >= end}
            className="flex-1 max-w-[120px] h-12 flex items-center justify-center gap-2 bg-white text-[#7C5CFC] border border-[#7C5CFC] rounded-lg shadow-sm transition-all text-base font-semibold hover:bg-[#F6F3FF] hover:text-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="inline-block align-middle"
              >
                <path
                  d="M12.4053 14.4053L20.375 6.43555C20.5 6.31055 20.4053 6.09375 20.1875 6.09375H17.9375C17.875 6.09375 17.8125 6.11719 17.7715 6.16406L11.1719 12.7637L8.95312 10.541C9.23438 10.0547 9.375 9.50781 9.375 8.92188C9.375 7.00781 7.74219 5.375 5.82812 5.375C3.91406 5.375 2.28125 7.00781 2.28125 8.92188C2.28125 10.8359 3.91406 12.4688 5.82812 12.4688C6.41406 12.4688 6.96094 12.3281 7.44727 12.0469L9.67188 14.2715L7.44531 16.498C6.96094 16.2148 6.41406 16.0781 5.82812 16.0781C3.91406 16.0781 2.28125 17.7109 2.28125 19.625C2.28125 21.5391 3.91406 23.1719 5.82812 23.1719C7.74219 23.1719 9.375 21.5391 9.375 19.625C9.375 19.0391 9.23438 18.4922 8.95312 18.0059L11.1719 15.7871L17.7715 22.3867C17.8125 22.4336 17.875 22.457 17.9375 22.457H20.1875C20.4053 22.457 20.5 22.2402 20.375 22.1152L12.4053 14.4053ZM5.82812 11.1094C4.8125 11.1094 3.98438 10.2812 3.98438 9.26562C3.98438 8.25 4.8125 7.42188 5.82812 7.42188C6.84375 7.42188 7.67188 8.25 7.67188 9.26562C7.67188 10.2812 6.84375 11.1094 5.82812 11.1094ZM5.82812 20.8594C4.8125 20.8594 3.98438 20.0312 3.98438 19.0156C3.98438 18 4.8125 17.1719 5.82812 17.1719C6.84375 17.1719 7.67188 18 7.67188 19.0156C7.67188 20.0312 6.84375 20.8594 5.82812 20.8594Z"
                  fill="#8A76FC"
                />
              </svg>
              Trim
            </span>
          </Button>
          {onResetVideo && (
            <Button
              variant="default"
              onClick={onResetVideo}
              className="flex-1 max-w-[120px] h-12 flex items-center justify-center gap-2 bg-white text-[#7C5CFC] border border-[#7C5CFC] rounded-lg shadow-sm transition-all text-base font-semibold hover:bg-[#F6F3FF] hover:text-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9]"
            >
              <span className="flex items-center gap-2">
                <svg width='22' height='22' fill='none' viewBox='0 0 24 24' className='inline-block align-middle'><path d='M17.65 6.35A8 8 0 1 0 12 4v4l5-5-5-5v4a10 10 0 1 1-7.07 2.93' stroke='#7C5CFC' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'/></svg>
                Reset
              </span>
            </Button>
          )}
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
        </div>
        {/* SVG Timeline */}
        <div className="w-full flex justify-center">
          <svg
            ref={svgRef}
            width="100%"
            height={height * 1.5}
            style={{
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 2px 8px #ede7fa",
              width: "100%",
              minWidth: 400,
              maxWidth: 1400,
              height: height * 1.5,
            }}
            viewBox={`0 0 ${svgWidth} ${height}`}
            preserveAspectRatio="none"
            onClick={handleTimelineClick}
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
            {/* Trim region */}
            <rect
              x={isNaN(start) ? margin : timeToX(start)}
              y={timelineY}
              width={
                isNaN(end) || isNaN(start) ? 0 : timeToX(end) - timeToX(start)
              }
              height={timelineHeight}
              fill={trimColor}
              opacity={0.7}
              rx={6}
            />
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
              onMouseDown={() => setDragging("start")}
              onTouchStart={() => setDragging("start")}
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
              onMouseDown={() => setDragging("end")}
              onTouchStart={() => setDragging("end")}
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
