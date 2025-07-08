"use client"

import { RefObject, useCallback, useState, useEffect } from "react"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface TimelineSliderProps {
  duration: number // Duration in seconds]
  step?: number // Step size for the slider
  formatTime?: (seconds: number) => string // Custom time formatter
  onTimeChange?: (time: number) => void // Callback when time changes
  ontrim: (start: string, end: string) => void,
  processing: boolean,
  videoRef: RefObject<HTMLVideoElement | null>
}

export function TimelineSlider({
  duration,
  step = 1,
  formatTime,
  onTimeChange,
  ontrim,
  processing,
  videoRef,
}: TimelineSliderProps) {

  //const [currentTime, setcurrentTime] = useState(0)
  const [start, setstart] = useState(0)
  const [end, setend] = useState(duration)
  const [zoomed, setzoomed] = useState(false)

  // Default time formatter
  const defaultFormatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs}:${mins}:${secs.toString().padStart(2, "0")}`
  }

  const timeFormatter = defaultFormatTime || formatTime

  const toggleZoom = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.style.transition = "transform 0.3s ease";
    video.style.transformOrigin = "center center"; 

    if (!zoomed) {
      video.style.transform = "scale(1.5)";
    } else {
      video.style.transform = "scale(1)";
    }
    setzoomed((z) => !z);
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

    ontrim(defaultFormatTime(start), defaultFormatTime(end));
  }, [start, end, duration, ontrim]);


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
          setstart((prev) => Math.max(0, prev - 1));
          break;
        case "]":
          setend((prev) => Math.min(duration, prev + 1));
          break;
        case "Enter":
          handleTrim();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration, processing, videoRef, handleTrim]);

  // Generate time markers based on duration
  const generateTimeMarkers = () => {
    const markers = []
    const markerCount = Math.min(10, Math.max(5, Math.floor(duration / 60))) // Between 5-10 markers
    const interval = duration / (markerCount - 1)

    for (let i = 0; i < markerCount; i++) {
      const time = i * interval
      markers.push({
        time: time,
        position: (time / duration) * 100,
        label: timeFormatter(time),
      })
    }
    return markers
  }

  const timeMarkers = generateTimeMarkers()

  const handleStartTimeChange = (value: number[]) => {
    const newTime = value[0]
    setstart(newTime)
    onTimeChange?.(newTime)
  }

  const handleEndTimeChange = (value: number[]) => {
    const newTime = value[0]
    setend(newTime)
    onTimeChange?.(newTime)
  }

  return (
    <Card className='p-6 w-full max-w-4xl'>
      <div className="space-y-6">
        {/* Timeline Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">Timeline Duration: {timeFormatter(duration)}</div>
          <div className="text-lg font-mono">
            StartTime : {timeFormatter(start)}
          </div>
          <div className="text-lg font-mono">
            EndTime : {timeFormatter(end)}
          </div>
        </div>

        {/* Timeline Visualization */}
        <div className="relative">
          {/* Time markers */}

          {timeMarkers.map((marker, index) => (
            <div key={index} className="absolute transform -translate-x-1/2" style={{ left: `${marker.position}%` }}>
              <div className="w-3 h-3 z-4 bg-background border-2 border-primary rounded-full -mt-0.5" />
              <div className="text-xs text-muted-foreground mt-2 whitespace-nowrap">{marker.label}</div>
            </div>
          ))}

          <div className="relative mb-4">
            {/* <div className="absolute top-0 left-0 right-0 h-2 bg-muted rounded-full" />
            <div
              className="absolute top-0 left-0 h-2 bg-primary rounded-full transition-all duration-200"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            /> */}

            {/* Marker dots and labels */}

          </div>

          {/* Current time indicator indicating current time playing*/}
          {/* <div
            className="absolute top-0 transform -translate-x-1/2 transition-all duration-200"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="w-4 h-4 bg-primary rounded-full shadow-lg -mt-1" />
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap">
              {timeFormatter(currentTime)}
            </div>
          </div>
        </div> */}

          {/* Start Slider */}
          <div className="px-2">
            <Slider
              value={[start]}
              onValueChange={handleStartTimeChange}
              max={duration}
              step={step}
              className="w-full
              [&_[role=slider]]:bg-red-600
    [&_[role=slider]]:border-red-600
    [&_[role=slider]]:hover:bg-red-700
    [&_[role=slider]]:focus:ring-red-600
    [&_[role=slider-track]]:bg-red-200
    [&_[role=slider-range]]:bg-red-600
              "
            />

            <Slider
              value={[end]}
              onValueChange={handleEndTimeChange}
              max={duration}
              step={step}
              className="w-full
                      [&_[role=slider]]:bg-blue-600
    [&_[role=slider]]:border-blue-600
    [&_[role=slider]]:hover:bg-blue-700
    [&_[role=slider]]:focus:ring-blue-600
    [&_[role=slider-track]]:bg-blue-200
    [&_[role=slider-range]]:bg-blue-600
  "
            />
          </div>

          {/* Progress Info
          <div className="flex justify-between text-sm text-muted-foreground mt-5">
            <span>Progress: {Math.round((currentTime / duration) * 100)}%</span>
            <span>Remaining: {timeFormatter(duration - currentTime)}</span>
          </div> */}

          <div className="grid grid-cols-1 md:grid-cols-2 items-center mt-10">
            <Button variant='default'
              onClick={toggleZoom}
              className="w-1/3"
            >{zoomed ? "Zoom out" : "Zoom in"}</Button>
            <Button
              onClick={handleTrim}
              disabled={processing || start >= end}
              className="text-white transition-all w-1/3">
              {processing ? "Trimmin" : "Trim"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
