import { useState } from "react";
import ReactPlayer from "react-player";
import Image from "next/image";
import { formatTime } from "@/app/lib/dateTimeUtils";

interface CustomVideoControlsProps {
  playerRef: React.RefObject<ReactPlayer>;
  duration: number;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  recordingDuration: number;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
}

export default function CustomVideoControls({
  playerRef,
  duration,
  currentTime,
  setCurrentTime,
  recordingDuration,
  setPlaying,
  playing,
}: CustomVideoControlsProps) {
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const handlePlayPause = () => {
    setPlaying((prev) => {
      if (prev) playerRef.current?.getInternalPlayer()?.pause?.();
      else playerRef.current?.getInternalPlayer()?.play?.();
      return !prev;
    });
  };

  const handleSeekStart = () => {
    setDragging(true);
    setDragValue(currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setDragValue(value);
    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        player.currentTime = value;
        player.dispatchEvent(new Event("seeking"));
      }
    }
  };

  const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    const value = Number((e.target as HTMLInputElement).value);
    setCurrentTime(value);

    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        player.currentTime = value;
        player.dispatchEvent(new Event("seeking"));
        playerRef.current.seekTo(value, "seconds");
      }
    }
    setDragging(false);
  };

  const displayDuration = recordingDuration > 0 ? recordingDuration : duration;

  return (
    <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="rounded-full bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
        >
          {playing ? (
            <Image
              src="/icons/pause.png"
              alt="Pause"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          ) : (
            <Image
              src="/icons/play.png"
              alt="Play"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={displayDuration}
          step={0.01}
          value={dragging ? dragValue : currentTime}
          onPointerDown={handleSeekStart}
          onChange={handleSeek}
          onPointerUp={handleSeekEnd}
          className="flex-1 accent-[#A594F9] h-2 rounded-lg bg-gradient-to-r from-[#A594F9] to-[#7C5CFC]"
          style={{
            background: "linear-gradient(90deg, #A594F9 0%, #7C5CFC 100%)",
            height: 8,
            borderRadius: 8,
          }}
        />
        <span className="text-xs text-[#A594F9] font-mono min-w-[60px] text-right">
          {formatTime(currentTime)} /{" "}
          {displayDuration > 0 ? formatTime(displayDuration) : "0:00"}
        </span>
      </div>
    </div>
  );
}