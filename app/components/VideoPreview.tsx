"use client";

import React, { useRef, useState, useEffect } from "react";
import ReactPlayer from "react-player";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";

interface VideoPreviewProps {
  videoUrl: string | null;
  isRecording?: boolean;
  onTimeChange?: (time: number) => void;
  className?: string;
  screenStream?: MediaStream | null;
}

export default function VideoPreview({
  videoUrl,
  isRecording = false,
  onTimeChange,
  className = "",
  screenStream = null,
}: VideoPreviewProps) {
  const playerRef = useRef<ReactPlayer>(null!);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(!isRecording);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const handlePlayPause = () => {
    if (isRecording) return; // Disable controls during recording
    setPlaying((prev) => {
      if (screenStream && videoRef.current) {
        if (prev) videoRef.current.pause();
        else videoRef.current.play();
      } else {
        if (prev) playerRef.current?.getInternalPlayer()?.pause?.();
        else playerRef.current?.getInternalPlayer()?.play?.();
      }
      return !prev;
    });
  };

  const handleSeekStart = () => {
    if (isRecording) return;
    setDragging(true);
    setDragValue(currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isRecording) return;
    setDragValue(Number(e.target.value));
  };

  const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    if (isRecording) return;
    const value = Number((e.target as HTMLInputElement).value);
    setCurrentTime(value);
    if (screenStream && videoRef.current) {
      videoRef.current.currentTime = value;
    } else {
      playerRef.current?.seekTo(value, "seconds");
    }
    onTimeChange?.(value);
    setDragging(false);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const safeDuration = (d: number) => (d && isFinite(d) && d > 0 ? d : null);

  // Set srcObject when screenStream changes
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  return (
    <div
      className={`relative w-full max-w-[400px] h-[260px] sm:w-full sm:max-w-[900px] sm:h-auto sm:aspect-video bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300 ${className}`}
      style={{
        minHeight: "160px",
        padding: 0,
        boxShadow: "0 4px 24px 0 #E6E1FA",
      }}
      ref={videoContainerRef}
    >
      {/* Browser Bar */}
      <div
        className="flex items-center justify-between w-full px-2 sm:px-6 py-1 sm:py-2 bg-[#F6F3FF] rounded-t-2xl border-b border-[#E6E1FA]"
        style={{ minHeight: 32 }}
      >
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E6E1FA]" />
          <span className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#E6E1FA]" />
          <span className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#E6E1FA]" />
        </div>
        <div className="flex-1 flex justify-center">
          <span className="text-xs sm:text-sm text-[#A594F9] font-mono bg-[#F6F3FF] px-2 sm:px-4 py-1 rounded-lg border border-[#E6E1FA] shadow-sm">
            Marvedge.com/Demo/Preview
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setVolume(volume === 0 ? 1 : 0)}
            className="p-1 rounded hover:bg-[#E6E1FA] transition-colors"
            disabled={isRecording}
          >
            {volume === 0 ? (
              <FaVolumeMute className="w-3 h-3 text-[#A594F9]" />
            ) : (
              <FaVolumeUp className="w-3 h-3 text-[#A594F9]" />
            )}
          </button>
        </div>
      </div>

      {/* Video Player */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          zIndex: 1,
          borderRadius: "1.25rem",
          overflow: "hidden",
          background: "#F6F3FF",
        }}
      >
        {screenStream ? (
          <video
            ref={videoRef}
            autoPlay
            muted={isRecording}
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: "1.25rem",
              background: "#F6F3FF",
            }}
            onLoadedMetadata={() => {
              if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
                setDuration(videoRef.current.duration);
              }
            }}
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
                onTimeChange?.(videoRef.current.currentTime);
              }
            }}
          />
        ) : (
          <ReactPlayer
            ref={playerRef}
            url={videoUrl || undefined}
            playing={playing}
            controls={false}
            muted={isRecording}
            volume={volume}
            width="100%"
            height="100%"
            style={{
              objectFit: "contain",
              borderRadius: "1.25rem",
              background: "#F6F3FF",
            }}
            onError={(e) => console.error("Video failed to load", e)}
            onReady={() => console.log("Video loaded")}
            progressInterval={100}
            onProgress={({ playedSeconds }) => {
              setCurrentTime(playedSeconds);
              onTimeChange?.(playedSeconds);
            }}
            onDuration={(dur) => {
              if (isFinite(dur) && !isNaN(dur)) setDuration(dur);
            }}
          />
        )}
      </div>

      {/* Custom Video Controls */}
      <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            disabled={isRecording}
            className="rounded-full bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition disabled:opacity-50"
          >
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect
                  x="3"
                  y="3"
                  width="4"
                  height="12"
                  rx="2"
                  fill="currentColor"
                />
                <rect
                  x="11"
                  y="3"
                  width="4"
                  height="12"
                  rx="2"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4 3V15L15 9L4 3Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={dragging ? dragValue : currentTime}
            onPointerDown={handleSeekStart}
            onChange={handleSeek}
            onPointerUp={handleSeekEnd}
            disabled={isRecording}
            className="flex-1 accent-[#A594F9] h-2 rounded-lg bg-gradient-to-r from-[#A594F9] to-[#7C5CFC] disabled:opacity-50"
            style={{
              background: "linear-gradient(90deg, #A594F9 0%, #7C5CFC 100%)",
              height: 8,
              borderRadius: 8,
            }}
          />
          <span className="text-xs text-[#A594F9] font-mono min-w-[60px] text-right">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* 5-second skip buttons */}
        <div className="flex items-center justify-between mt-2 px-2 w-full">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (isRecording) return;
                const newTime = Math.max(0, currentTime - 5);
                setCurrentTime(newTime);
                if (screenStream && videoRef.current) {
                  videoRef.current.currentTime = newTime;
                } else {
                  playerRef.current?.seekTo(newTime, "seconds");
                }
                onTimeChange?.(newTime);
              }}
              disabled={isRecording}
              className="rounded-full bg-[#F6F3FF] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition disabled:opacity-50"
              title="Back 5 seconds"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20">
                <path
                  d="M10 2v2.06A8 8 0 1 0 18 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 9l-3 3 3 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={() => {
                if (isRecording) return;
                const newTime = Math.min(duration, currentTime + 5);
                setCurrentTime(newTime);
                if (screenStream && videoRef.current) {
                  videoRef.current.currentTime = newTime;
                } else {
                  playerRef.current?.seekTo(newTime, "seconds");
                }
                onTimeChange?.(newTime);
              }}
              disabled={isRecording}
              className="rounded-full bg-[#F6F3FF] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition disabled:opacity-50"
              title="Forward 5 seconds"
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 20 20">
                <path
                  d="M10 2v2.06A8 8 0 1 1 2 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M13 11l3-3-3-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#A594F9] font-mono">
              {isRecording ? "Recording..." : "Preview"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
