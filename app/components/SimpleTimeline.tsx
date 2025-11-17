import { useState } from "react";
import { formatTime } from "@/app/lib/dateTimeUtils";
import ReactPlayer from "react-player";

interface SimpleTimelineProps {
  videoPlaying: boolean;
  setVideoPlaying: (playing: boolean) => void;
  videoCurrentTime: number;
  setVideoCurrentTime: (time: number) => void;
  videoDuration: number;
  recordingDuration: number;
  videoPlayerRef: React.RefObject<ReactPlayer | null>;
}

export default function SimpleTimeline({
  videoPlaying,
  setVideoPlaying,
  videoCurrentTime,
  setVideoCurrentTime,
  videoDuration,
  recordingDuration,
  videoPlayerRef,
}: SimpleTimelineProps) {
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Use recording duration if available, otherwise use detected duration
  const displayDuration = recordingDuration > 0 ? recordingDuration : videoDuration;

  const handleSeekStart = () => {
    setDragging(true);
    setDragValue(videoCurrentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setDragValue(value);

    // Update video frame immediately during dragging
    if (videoPlayerRef.current) {
      const player = videoPlayerRef.current.getInternalPlayer();
      if (player) {
        // Set time directly and force a frame update
        player.currentTime = value;
        // Force the video to update by triggering a seek event
        player.dispatchEvent(new Event("seeking"));
      }
    }
  };

  const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    const value = Number((e.target as HTMLInputElement).value);
    setVideoCurrentTime(value);

    // Force immediate video frame update
    if (videoPlayerRef.current) {
      const player = videoPlayerRef.current.getInternalPlayer();
      if (player) {
        // Set time directly and force a frame update
        player.currentTime = value;
        // Force the video to update by triggering a seek event
        player.dispatchEvent(new Event("seeking"));
        videoPlayerRef.current.seekTo(value, "seconds");
      } else {
        videoPlayerRef.current.seekTo(value, "seconds");
      }
    }

    setDragging(false);
  };

  const handlePlayPause = () => {
    setVideoPlaying(!videoPlaying);
  };

  const handleSkip = (seconds: number) => {
    const newTime =
      seconds > 0
        ? Math.min(displayDuration, videoCurrentTime + seconds)
        : Math.max(0, videoCurrentTime + seconds);
    setVideoCurrentTime(newTime);

    if (videoPlayerRef.current) {
      const player = videoPlayerRef.current.getInternalPlayer();
      if (player) {
        player.currentTime = newTime;
        player.dispatchEvent(new Event("seeking"));
        videoPlayerRef.current.seekTo(newTime, "seconds");
      }
    }
  };

  return (
    <div className="w-full bg-white px-6 pb-3 pt-3 flex items-center gap-3 rounded-lg">
      <button
        onClick={() => handleSkip(-5)}
        className="text-[#A594F9] hover:opacity-70 transition"
        title="Rewind 5 seconds"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
        </svg>
      </button>
      <button onClick={handlePlayPause} className="text-[#A594F9] hover:opacity-70 transition">
        {videoPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button
        onClick={() => handleSkip(5)}
        className="text-[#A594F9] hover:opacity-70 transition"
        title="Forward 5 seconds"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={displayDuration}
        step={0.01}
        value={dragging ? dragValue : videoCurrentTime}
        onPointerDown={handleSeekStart}
        onChange={handleSeek}
        onPointerUp={handleSeekEnd}
        className="flex-1 h-1.5 rounded-full accent-[#A594F9]"
        style={{
          background: `linear-gradient(90deg, #A594F9 0%, #A594F9 ${displayDuration > 0 ? (videoCurrentTime / displayDuration) * 100 : 0}%, #E6E1FA ${displayDuration > 0 ? (videoCurrentTime / displayDuration) * 100 : 0}%, #E6E1FA 100%)`,
        }}
      />
      <span className="text-xs text-[#1a1a2e] font-mono min-w-[50px] text-right">
        {formatTime(videoCurrentTime)}/{formatTime(displayDuration > 0 ? displayDuration : 0)}
      </span>
    </div>
  );
}
