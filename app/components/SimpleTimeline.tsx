import { useState } from "react";
import Image from "next/image";
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

  const handlePlayPause = () => {
    setVideoPlaying(!videoPlaying);
  };

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

  const handleSkip = (seconds: number) => {
    const newTime =
      seconds > 0
        ? Math.min(displayDuration, videoCurrentTime + seconds)
        : Math.max(0, videoCurrentTime + seconds);
    setVideoCurrentTime(newTime);

    // Force immediate video frame update
    if (videoPlayerRef.current) {
      const player = videoPlayerRef.current.getInternalPlayer();
      if (player) {
        // Set time directly and force a frame update
        player.currentTime = newTime;
        // Force the video to update by triggering a seek event
        player.dispatchEvent(new Event("seeking"));
        videoPlayerRef.current.seekTo(newTime, "seconds");
      }
    }
  };

  return (
    <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="rounded-full bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
        >
          {videoPlaying ? (
            <Image src="/icons/pause.png" alt="Pause" width={18} height={18} className="w-4 h-4" />
          ) : (
            <Image src="/icons/play.png" alt="Play" width={18} height={18} className="w-4 h-4" />
          )}
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
          className="flex-1 accent-[#A594F9] h-2 rounded-lg bg-linear-to-r from-[#A594F9] to-[#7C5CFC]"
          style={{
            background: "linear-gradient(90deg, #A594F9 0%, #7C5CFC 100%)",
            height: 8,
            borderRadius: 8,
          }}
        />
        <span className="text-xs text-[#A594F9] font-mono min-w-[60px] text-right">
          {formatTime(videoCurrentTime)} /{" "}
          {displayDuration > 0 ? formatTime(displayDuration) : "0:00"}
        </span>
      </div>

      {/* 5-second skip buttons */}
      <div className="flex items-center justify-between mt-2 px-2 w-full">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSkip(-5)}
            className="rounded-full bg-purple-500 text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
            title="Back 5 seconds"
          >
            <Image
              src="/icons/replay.svg"
              alt="Back 5 seconds"
              width={20}
              height={20}
              className="w-5 h-5"
            />
          </button>
          <button
            onClick={() => handleSkip(5)}
            className="rounded-full bg-purple-500 text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
            title="Forward 5 seconds"
          >
            <Image
              src="/icons/forward.svg"
              alt="Forward 5 seconds"
              width={20}
              height={20}
              className="w-5 h-5"
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#A594F9] font-mono">Preview</span>
        </div>
      </div>
    </div>
  );
}
