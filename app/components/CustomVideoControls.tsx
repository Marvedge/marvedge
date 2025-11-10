import { useState } from "react";
import ReactPlayer from "react-player";
import Image from "next/image";
import { formatTime } from "@/app/lib/dateTimeUtils";
import { FaExpand, FaVolumeMute, FaVolumeUp } from "react-icons/fa";

interface CustomVideoControlsProps {
  playerRef: React.RefObject<ReactPlayer>;
  duration: number;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  recordingDuration: number;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
  volume: number;
  setVolume: (t: number) => void;
  handleFullscreen: () => void;
}

export default function CustomVideoControls({
  playerRef,
  duration,
  currentTime,
  setCurrentTime,
  recordingDuration,
  setPlaying,
  playing,
  volume,
  setVolume,
  handleFullscreen,
}: CustomVideoControlsProps) {
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const handlePlayPause = () => {
    setPlaying((prev) => {
      if (prev) {
        playerRef.current?.getInternalPlayer()?.pause?.();
      } else {
        playerRef.current?.getInternalPlayer()?.play?.();
      }
      return !prev;
    });
  };

  const handleSeekStart = () => {
    setDragging(true);
    setDragValue(currentTime);
    setPlaying(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setDragValue(value);
    setPlaying(false);
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
    // setPlaying(false);
    setDragging(false);
  };

  const displayDuration = recordingDuration > 0 ? recordingDuration : duration;

  return (
    <div className="w-full px-6 pb-2 pt-0 flex flex-col gap-2">
      <div className="flex items-center gap-4 w-full">
        {/* Play / Pause */}
        <button
          onClick={handlePlayPause}
          className="rounded-full cursor-pointer bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
        >
          {playing ? (
            <Image src="/icons/pause.png" alt="Pause" width={24} height={24} />
          ) : (
            <Image src="/icons/play.png" alt="Play" width={24} height={24} />
          )}
        </button>

        {/* Timeline + Time */}
        <div className="flex items-center gap-3 flex-1">
          <input
            type="range"
            min={0}
            max={displayDuration}
            step={0.01}
            value={dragging ? dragValue : currentTime}
            onPointerDown={handleSeekStart}
            onChange={handleSeek}
            onPointerUp={handleSeekEnd}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointerflex-1 accent-[#A594F9] cursor-pointer bg-linear-to-r from-[#A594F9] to-[#7C5CFC]"
            style={{
              background: `linear-gradient(90deg, #7C5CFC ${(currentTime / displayDuration) * 100}%, #E6E1FA ${(currentTime / displayDuration) * 100}%)`,
            }}
          />
          <span className="text-xs text-[#7C5CFC] font-mono min-w-[60px] text-right">
            {formatTime(currentTime)} / {formatTime(displayDuration || 0)}
          </span>
        </div>

        {/* RIGHT SIDE CONTROLS */}
        <div className="flex items-center gap-3">
          {/* Skip -5 */}
          <button
            onClick={() => {
              const newTime = Math.max(0, currentTime - 5);
              setCurrentTime(newTime);
              playerRef.current?.seekTo(newTime, "seconds");
            }}
            className="p-2 rounded-full cursor-pointer bg-[#7C5CFC] hover:bg-[#6A4DE8] text-white transition"
            title="Back 5 seconds"
          >
            <Image src="/icons/replay.svg" alt="Replay" width={16} height={16} />
          </button>

          {/* Skip +5 */}
          <button
            onClick={() => {
              const newTime = Math.min(displayDuration, currentTime + 5);
              setCurrentTime(newTime);
              playerRef.current?.seekTo(newTime, "seconds");
            }}
            className="p-2 rounded-full cursor-pointer bg-[#7C5CFC] hover:bg-[#6A4DE8] text-white transition"
            title="Forward 5 seconds"
          >
            <Image src="/icons/forward.svg" alt="Forward" width={16} height={16} />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2 w-36">
            <button onClick={() => setVolume(volume === 0 ? 1 : 0)}>
              {volume === 0 ? (
                <FaVolumeMute className="text-[#7C5CFC] text-xl" />
              ) : (
                <FaVolumeUp className="text-[#7C5CFC] text-xl" />
              )}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full h-2 rounded-lg accent-[#7C5CFC]"
            />
          </div>

          {/* Fullscreen */}
          <button
            className="text-[#7C5CFC] hover:text-[#5A48D2] p-2"
            title="Fullscreen"
            onClick={handleFullscreen}
          >
            <FaExpand size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
