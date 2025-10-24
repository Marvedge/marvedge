"use client";

import React, { useRef, useState, useEffect } from "react";
import ReactPlayer from "react-player";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { formatTime } from "@/app/lib/dateTimeUtils";

interface VideoPreviewProps {
  videoUrl: string | null;
  isRecording?: boolean;
  onTimeChange?: (time: number) => void;
  className?: string;
  screenStream?: MediaStream | null;
  showControls?: boolean;
}

export default function VideoPreview({
  videoUrl,
  isRecording = false,
  onTimeChange,
  className = "",
  screenStream = null,
  showControls = true,
}: VideoPreviewProps) {
  const playerRef = useRef<ReactPlayer>(null!);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(!isRecording);
  const [volume, setVolume] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const handlePlayPause = () => {
    if (isRecording) return;
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

  // Set srcObject when screenStream changes
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Monitor duration for recorded videos
  useEffect(() => {
    if (videoUrl && !screenStream) {
      const checkDuration = () => {
        if (
          videoRef.current &&
          videoRef.current.duration &&
          isFinite(videoRef.current.duration) &&
          videoRef.current.duration > 0
        ) {
          setDuration(videoRef.current.duration);
        }
      };

      checkDuration();

      // Multiple attempts to get duration with different delays - FASTER
      const timers = [
        setTimeout(checkDuration, 10),
        setTimeout(checkDuration, 50),
        setTimeout(checkDuration, 100),
        setTimeout(checkDuration, 200),
        setTimeout(checkDuration, 300),
      ];

      const getDurationFromBlob = async () => {
        try {
          const response = await fetch(videoUrl);
          const blob = await response.blob();
          const tempVideo = document.createElement("video");
          tempVideo.src = URL.createObjectURL(blob);
          tempVideo.preload = "metadata";

          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(tempVideo.duration);
            }
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempVideo.src);
          };

          // Also try to load the video to trigger metadata loading
          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from blob:", error);
        }
      };

      // Try blob method with multiple delays - FASTER
      const blobTimers = [
        setTimeout(getDurationFromBlob, 20),
        setTimeout(getDurationFromBlob, 80),
        setTimeout(getDurationFromBlob, 150),
      ];

      // Additional method: try to get duration from the video element directly
      const getDurationFromVideoElement = () => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.addEventListener(
            "loadedmetadata",
            () => {
              if (
                videoRef.current &&
                videoRef.current.duration &&
                isFinite(videoRef.current.duration) &&
                videoRef.current.duration > 0
              ) {
                setDuration(videoRef.current.duration);
              }
            },
            { once: true }
          );
        }
      };

      const videoElementTimers = [
        setTimeout(getDurationFromVideoElement, 30),
        setTimeout(getDurationFromVideoElement, 90),
        setTimeout(getDurationFromVideoElement, 180),
      ];

      // Force metadata loading immediately
      const forceMetadataLoad = () => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.preload = "metadata";
        }
      };

      // Try to force metadata loading immediately - FASTER
      forceMetadataLoad();
      const metadataTimers = [
        setTimeout(forceMetadataLoad, 15),
        setTimeout(forceMetadataLoad, 60),
        setTimeout(forceMetadataLoad, 120),
      ];

      // Force metadata loading for ReactPlayer
      const forceReactPlayerMetadata = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            player.preload = "metadata";
            player.load();
          }
        }
      };

      const reactPlayerTimers = [
        setTimeout(forceReactPlayerMetadata, 25),
        setTimeout(forceReactPlayerMetadata, 70),
        setTimeout(forceReactPlayerMetadata, 140),
      ];

      // Try to get duration by playing a small portion (this often triggers metadata loading)
      const getDurationByPlaying = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            const wasPlaying = !player.paused;
            player.currentTime = 0.1; // Seek to 0.1 seconds
            player
              .play()
              .then(() => {
                setTimeout(() => {
                  if (
                    player.duration &&
                    isFinite(player.duration) &&
                    player.duration > 0
                  ) {
                    setDuration(player.duration);
                  }
                  if (!wasPlaying) {
                    player.pause();
                    player.currentTime = 0;
                  }
                }, 50);
              })
              .catch(() => {
                // If play fails, just try to get duration anyway
                if (
                  player.duration &&
                  isFinite(player.duration) &&
                  player.duration > 0
                ) {
                  setDuration(player.duration);
                }
              });
          }
        }
      };

      const playTimers = [
        setTimeout(getDurationByPlaying, 100),
        setTimeout(getDurationByPlaying, 200),
      ];

      // Create a hidden video element to force metadata loading
      const createHiddenVideo = () => {
        const hiddenVideo = document.createElement("video");
        hiddenVideo.style.display = "none";
        hiddenVideo.preload = "metadata";
        hiddenVideo.muted = true;
        hiddenVideo.src = videoUrl;

        hiddenVideo.onloadedmetadata = () => {
          if (
            hiddenVideo.duration &&
            isFinite(hiddenVideo.duration) &&
            hiddenVideo.duration > 0
          ) {
            setDuration(hiddenVideo.duration);
          }
          document.body.removeChild(hiddenVideo);
        };

        hiddenVideo.onerror = () => {
          document.body.removeChild(hiddenVideo);
        };

        document.body.appendChild(hiddenVideo);
        hiddenVideo.load();
      };

      const hiddenVideoTimers = [
        setTimeout(createHiddenVideo, 5),
        setTimeout(createHiddenVideo, 40),
        setTimeout(createHiddenVideo, 100),
      ];

      // Try to get duration by seeking to end of video
      const getDurationBySeeking = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            const wasPlaying = !player.paused;
            const wasTime = player.currentTime;

            // Try to seek to a large number to trigger duration detection
            player.currentTime = 999999;

            setTimeout(() => {
              if (
                player.duration &&
                isFinite(player.duration) &&
                player.duration > 0
              ) {
                setDuration(player.duration);
              }
              // Restore original state
              player.currentTime = wasTime;
              if (wasPlaying) {
                player.play();
              }
            }, 100);
          }
        }
      };

      const seekTimers = [
        setTimeout(getDurationBySeeking, 80),
        setTimeout(getDurationBySeeking, 160),
      ];

      // Try to get duration with different MIME types
      const getDurationWithMimeTypes = async () => {
        try {
          const response = await fetch(videoUrl);
          const blob = await response.blob();

          const mimeTypes = [
            "video/webm",
            "video/mp4",
            "video/ogg",
            "video/quicktime",
            "video/x-msvideo",
          ];

          for (const mimeType of mimeTypes) {
            const tempVideo = document.createElement("video");
            tempVideo.preload = "metadata";
            tempVideo.muted = true;

            const newBlob = new Blob([blob], { type: mimeType });
            tempVideo.src = URL.createObjectURL(newBlob);

            tempVideo.onloadedmetadata = () => {
              if (
                tempVideo.duration &&
                isFinite(tempVideo.duration) &&
                tempVideo.duration > 0
              ) {
                setDuration(tempVideo.duration);
                URL.revokeObjectURL(tempVideo.src);
                return;
              }
              URL.revokeObjectURL(tempVideo.src);
            };

            tempVideo.onerror = () => {
              URL.revokeObjectURL(tempVideo.src);
            };

            tempVideo.load();

            // Wait a bit before trying next MIME type - FASTER
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        } catch (error) {
          console.error("Error getting duration with MIME types:", error);
        }
      };

      const mimeTypeTimers = [
        setTimeout(getDurationWithMimeTypes, 120),
        setTimeout(getDurationWithMimeTypes, 250),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        blobTimers.forEach((timer) => clearTimeout(timer));
        videoElementTimers.forEach((timer) => clearTimeout(timer));
        metadataTimers.forEach((timer) => clearTimeout(timer));
        reactPlayerTimers.forEach((timer) => clearTimeout(timer));
        playTimers.forEach((timer) => clearTimeout(timer));
        hiddenVideoTimers.forEach((timer) => clearTimeout(timer));
        seekTimers.forEach((timer) => clearTimeout(timer));
        mimeTypeTimers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, screenStream]);

  return (
    <div
      className={`relative w-full max-w-[400px] h-[260px] sm:w-full sm:max-w-[900px] sm:h-auto sm:aspect-video bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300 ${className}`}
      style={{
        minHeight: "160px",
        padding: 0,
        boxShadow: "0 4px 24px 0 #E6E1FA",
      }}
    >
      {/* Browser Bar */}
      <div
        className="flex items-center justify-between w-full px-2 sm:px-6 py-1 sm:py-2 bg-[#F6F3FF] rounded-t-2xl border-b border-[#E6E1FA]"
        style={{ minHeight: 32 }}
      >
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
        {/* Play/Pause Button Overlay - Only show when not recording and video is paused */}
        {!isRecording && !playing && (
          <button
            onClick={handlePlayPause}
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 hover:bg-black/70 text-white p-4 transition-all duration-200"
            style={{
              backdropFilter: "blur(4px)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M8 5V19L19 12L8 5Z" fill="currentColor" />
            </svg>
          </button>
        )}
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
              if (
                videoRef.current &&
                videoRef.current.duration &&
                isFinite(videoRef.current.duration) &&
                videoRef.current.duration > 0
              ) {
                setDuration(videoRef.current.duration);
              }
            }}
            onCanPlay={() => {
              if (
                videoRef.current &&
                videoRef.current.duration &&
                isFinite(videoRef.current.duration) &&
                videoRef.current.duration > 0
              ) {
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
            onStart={() => {
              // Ensure currentTime starts from 0 when video starts
              setCurrentTime(0);
              onTimeChange?.(0);
            }}
            onPlay={() => {
              // Ensure currentTime is 0 when video starts playing
              setCurrentTime(0);
              onTimeChange?.(0);
            }}
            onDuration={(dur) => {
              if (isFinite(dur) && !isNaN(dur) && dur > 0) {
                setDuration(dur);
              }
            }}
            onReady={() => {
              console.log("Video loaded");
              // Try to get duration again when video is ready - FASTER
              setTimeout(() => {
                if (playerRef.current) {
                  const player = playerRef.current.getInternalPlayer();
                  if (
                    player &&
                    player.duration &&
                    isFinite(player.duration) &&
                    player.duration > 0
                  ) {
                    setDuration(player.duration);
                  }
                }
              }, 10);

              // Additional attempt after a longer delay - FASTER
              setTimeout(() => {
                if (playerRef.current) {
                  const player = playerRef.current.getInternalPlayer();
                  if (
                    player &&
                    player.duration &&
                    isFinite(player.duration) &&
                    player.duration > 0
                  ) {
                    setDuration(player.duration);
                  }
                }
              }, 100);
            }}
            progressInterval={50}
            onProgress={({ playedSeconds }) => {
              // Ensure currentTime starts from 0 immediately
              if (playedSeconds === 0) {
                setCurrentTime(0);
                onTimeChange?.(0);
              } else {
                setCurrentTime(playedSeconds);
                onTimeChange?.(playedSeconds);
              }

              // Try to get duration when video starts playing (this often triggers metadata loading) - FASTER
              if (playedSeconds > 0 && duration === 0) {
                setTimeout(() => {
                  if (playerRef.current) {
                    const player = playerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setDuration(player.duration);
                    }
                  }
                }, 10);
              }
            }}
            config={{
              file: {
                attributes: {
                  preload: "metadata",
                },
              },
            }}
          />
        )}
      </div>

      {/* Custom Video Controls */}
      {showControls && (
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
              className="flex-1 accent-[#A594F9] h-2 rounded-lg bg-linear-to-r from-[#A594F9] to-[#7C5CFC] disabled:opacity-50"
              style={{
                background: "linear-gradient(90deg, #A594F9 0%, #7C5CFC 100%)",
                height: 8,
                borderRadius: 8,
              }}
            />
            <span className="text-xs text-[#A594F9] font-mono min-w-[60px] text-right">
              {formatTime(currentTime)} /{" "}
              {duration > 0 ? formatTime(duration) : "0:00"}
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
                className="rounded-full bg-[#7C5CFC] text-white hover:bg-[#6356D7] p-1.5 transition disabled:opacity-50 shadow-sm"
                title="Back 5 seconds"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 20 20">
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
                className="rounded-full bg-[#7C5CFC] text-white hover:bg-[#6356D7] p-1.5 transition disabled:opacity-50 shadow-sm"
                title="Forward 5 seconds"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 20 20">
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
      )}
    </div>
  );
}
