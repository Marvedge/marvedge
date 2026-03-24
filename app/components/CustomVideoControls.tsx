import { useState } from "react";
import ReactPlayer from "react-player";
import Image from "next/image";
import { formatTime } from "@/app/lib/dateTimeUtils";
import { FaVolumeMute, FaVolumeUp } from "react-icons/fa";

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
  playbackSpeed: number;
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
  playbackSpeed,
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
    setDragValue(currentTime / Math.max(0.0001, playbackSpeed));
    setPlaying(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const effectiveValue = Number(e.target.value); // UI seconds (speed-adjusted)
    const speed = Math.max(0.0001, playbackSpeed);
    const sourceValue = effectiveValue * speed; // underlying media seconds
    setDragValue(effectiveValue);
    setPlaying(false);
    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        player.currentTime = sourceValue;
        player.dispatchEvent(new Event("seeking"));
      }
    }
  };

  const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    const effectiveValue = Number((e.target as HTMLInputElement).value);
    const speed = Math.max(0.0001, playbackSpeed);
    const sourceValue = effectiveValue * speed;
    setCurrentTime(sourceValue);

    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      if (player) {
        player.currentTime = sourceValue;
        player.dispatchEvent(new Event("seeking"));
        playerRef.current.seekTo(sourceValue, "seconds");
      }
    }
    // setPlaying(false);
    setDragging(false);
  };

  const displayDuration = recordingDuration > 0 ? recordingDuration : duration;
  const speed = Math.max(0.0001, playbackSpeed);
  const effectiveDuration = displayDuration / speed;
  const effectiveCurrentTime = currentTime / speed;

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
            max={effectiveDuration}
            step={0.01}
            value={dragging ? dragValue : effectiveCurrentTime}
            onPointerDown={handleSeekStart}
            onChange={handleSeek}
            onPointerUp={handleSeekEnd}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointerflex-1 accent-[#A594F9] cursor-pointer bg-linear-to-r from-[#A594F9] to-[#7C5CFC]"
            style={{
              background: `linear-gradient(90deg, #7C5CFC ${(effectiveCurrentTime / Math.max(0.0001, effectiveDuration)) * 100}%, #E6E1FA ${(effectiveCurrentTime / Math.max(0.0001, effectiveDuration)) * 100}%)`,
            }}
          />
          <span className="text-xs text-[#7C5CFC] font-mono min-w-[60px] text-right">
            {formatTime(effectiveCurrentTime)} / {formatTime(effectiveDuration || 0)}
          </span>
        </div>

        {/* RIGHT SIDE CONTROLS */}
        <div className="flex items-center gap-3">
          {/* Skip -5 */}
          <button
            onClick={() => {
              const newEffective = Math.max(0, effectiveCurrentTime - 5);
              const newSource = newEffective * speed;
              setCurrentTime(newSource);
              playerRef.current?.seekTo(newSource, "seconds");
            }}
            className="p-2 rounded-full cursor-pointer bg-[#7C5CFC] hover:bg-[#6A4DE8] text-white transition"
            title="Back 5 seconds"
          >
            <Image src="/icons/replay.svg" alt="Replay" width={16} height={16} />
          </button>

          {/* Skip +5 */}
          <button
            onClick={() => {
              const newEffective = Math.min(effectiveDuration, effectiveCurrentTime + 5);
              const newSource = newEffective * speed;
              setCurrentTime(newSource);
              playerRef.current?.seekTo(newSource, "seconds");
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
            onClick={handleFullscreen}
            className="p-2 rounded-full cursor-pointer bg-[#7C5CFC] hover:bg-[#6A4DE8] text-white transition"
            title="Fullscreen"
            type="button"
          >
            <Image src="/icons/Group 316.svg" alt="Fullscreen" width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
