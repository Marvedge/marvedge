"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useBlobStore } from "@/app/store/blobStore";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { videoToMP4 } from "@/app/lib/ffmpeg";
import Image from "next/image";
import { formatTime } from "@/app/lib/dateTimeUtils";

import VideoPreview from "@/app/components/VideoPreview";
import { sanitizeFilename } from "@/app/lib/constants";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { Dialog } from "@headlessui/react";
import { Menu } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import SavePopupForm from "@/app/components/SavePopupForm";
import ReactPlayer from "react-player";

type RecorderTopbarProps = {
  onBack: () => void;
  userInitials: string;
};

function RecorderTopbar({ onBack, userInitials }: RecorderTopbarProps) {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Get first name or fallback
  const username =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")?.[0] ||
    "User";
  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="w-full flex items-center justify-between px-4 sm:px-8 py-2 sm:py-4 bg-white border-b border-[#ede7fa] shadow-sm">
      <div className="flex items-center gap-2 sm:gap-6">
        {/* Mobile: left arrow at the left edge */}
        <button
          onClick={onBack}
          className="text-[#7C5CFC] text-xl sm:text-2xl hover:bg-[#ede7fa] rounded-full p-1 mr-2 sm:ml-4 sm:order-2 order-1"
          style={{ order: 1 }}
        >
          <Image
            src="/icons/arrow_left_icon.png"
            alt="Back"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
        {/* Logo and title */}
        <span className="ml-2 sm:ml-0 text-lg sm:text-2xl font-extrabold text-[#7C5CFC] tracking-widest flex items-center gap-2 sm:order-1 order-2">
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={32}
            height={32}
            className="h-6 w-6 sm:h-8 sm:w-8 object-contain"
            priority
          />
          MARVEDGE
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="hidden sm:block text-[#7C5CFC] font-medium text-base mr-2 flex items-center gap-1">
          Welcome, {username}
          <span role="img" aria-label="waving hand" className="ml-1">
            👋
          </span>
        </span>

        <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-2 hidden sm:block">
          <Image
            src="/icons/bell.png"
            alt="Notifications"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
        <div className="relative" ref={dropdownRef}>
          <button
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#6356D7] text-white flex items-center justify-center text-lg md:text-xl font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
            onClick={() => setShowDropdown((v) => !v)}
            title={session?.user?.name || session?.user?.email || undefined}
          >
            {userInitials}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 md:w-64 bg-white rounded-lg shadow-lg p-3 md:p-4 z-50 border border-gray-200 animate-fade-in">
              <div className="mb-2 text-base md:text-lg font-bold text-[#6356D7]">
                {session?.user?.name || "User"}
              </div>
              <div className="mb-1 text-gray-700 text-xs md:text-sm font-semibold">
                {session?.user?.email}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-3 md:mt-4 w-full px-3 md:px-4 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm md:text-base"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecorderPage() {
  // const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [enableCamera, setEnableCamera] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [saveMessage] = useState<string>("");
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [showSavePopup, setShowSavePopup] = useState(false);
  const [processingDownload, setProcessingDownload] = useState(false);

  // Video controls state
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // const videoPreview = useRef<HTMLVideoElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPlayerRef = useRef<ReactPlayer>(null);

  const { setBlob, blob, title, setTitle } = useBlobStore();

  const {
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
    screenStream,
    startScreenShare,
    recordingDuration,
    reset,
  } = useScreenRecorder();

  const router = useRouter();
  // const fileInputRef = useRef<HTMLInputElement>(null);

  const videoPreview = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  // const [enableCamera, setEnableCamera] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setCameraStream(stream);
      if (videoPreview.current) {
        videoPreview.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access denied or not available:", error);
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    if (videoPreview.current) videoPreview.current.srcObject = null;
  };

  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";

  // Simple timeline component for recorder

  // Recording timeline component for active recording

  const handleSaveAndPublish = () => {
    if (!blob) return;
    setShowSavePopup(true);
  };

  const handlePopupDownload = async (data: {
    title: string;
    format: string;
  }) => {
    if (!blob) return;

    setProcessingDownload(true);
    try {
      if (data.format === "mp4") {
        const outputBlob = await videoToMP4(blob);
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.mp4`;
        a.click();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.webm`;
        a.click();
      }
      toast.success("Video downloaded successfully!");
      setShowSavePopup(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download video.");
    } finally {
      setProcessingDownload(false);
    }
  };

  // Use recording duration when available
  useEffect(() => {
    if (recordingDuration > 0 && videoUrl) {
      setVideoDuration(recordingDuration);
    }
  }, [recordingDuration, videoUrl]);

  // Force duration detection for recorded videos
  useEffect(() => {
    if (videoUrl && videoDuration === 0) {
      const getDurationFromVideo = async () => {
        try {
          const response = await fetch(videoUrl);
          const blob = await response.blob();
          const tempVideo = document.createElement("video");
          tempVideo.preload = "metadata";
          tempVideo.muted = true;
          tempVideo.src = URL.createObjectURL(blob);

          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setVideoDuration(tempVideo.duration);
            }
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from video:", error);
        }
      };

      // Try multiple times with different delays
      getDurationFromVideo();
      const timers = [
        setTimeout(getDurationFromVideo, 50),
        setTimeout(getDurationFromVideo, 150),
        setTimeout(getDurationFromVideo, 300),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, videoDuration]);

  // Force duration detection for uploaded videos
  useEffect(() => {
    if (uploadedFileUrl && videoDuration === 0) {
      const getDurationFromUploadedVideo = async () => {
        try {
          const response = await fetch(uploadedFileUrl);
          const blob = await response.blob();
          const tempVideo = document.createElement("video");
          tempVideo.preload = "metadata";
          tempVideo.muted = true;
          tempVideo.src = URL.createObjectURL(blob);

          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setVideoDuration(tempVideo.duration);
            }
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from uploaded video:", error);
        }
      };

      // Try multiple times with different delays
      getDurationFromUploadedVideo();
      const timers = [
        setTimeout(getDurationFromUploadedVideo, 50),
        setTimeout(getDurationFromUploadedVideo, 150),
        setTimeout(getDurationFromUploadedVideo, 300),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [uploadedFileUrl, videoDuration]);

  // Create hidden video element to force metadata loading immediately
  useEffect(() => {
    if ((videoUrl || uploadedFileUrl) && videoDuration === 0) {
      const createHiddenVideo = () => {
        const hiddenVideo = document.createElement("video");
        hiddenVideo.style.display = "none";
        hiddenVideo.preload = "metadata";
        hiddenVideo.muted = true;
        hiddenVideo.src = videoUrl || uploadedFileUrl || "";

        hiddenVideo.onloadedmetadata = () => {
          if (
            hiddenVideo.duration &&
            isFinite(hiddenVideo.duration) &&
            hiddenVideo.duration > 0
          ) {
            setVideoDuration(hiddenVideo.duration);
          }
          document.body.removeChild(hiddenVideo);
        };

        hiddenVideo.onerror = () => {
          document.body.removeChild(hiddenVideo);
        };

        document.body.appendChild(hiddenVideo);
        hiddenVideo.load();
      };

      const timers = [
        setTimeout(createHiddenVideo, 5),
        setTimeout(createHiddenVideo, 30),
        setTimeout(createHiddenVideo, 80),
      ];

      // Try to get duration by playing a tiny portion
      const getDurationByPlaying = () => {
        if (videoPlayerRef.current) {
          const player = videoPlayerRef.current.getInternalPlayer();
          if (player) {
            const wasPlaying = !player.paused;
            const wasTime = player.currentTime;

            // Seek to 0.1 seconds and play briefly
            player.currentTime = 0.1;
            player
              .play()
              .then(() => {
                setTimeout(() => {
                  if (
                    player.duration &&
                    isFinite(player.duration) &&
                    player.duration > 0
                  ) {
                    setVideoDuration(player.duration);
                  }
                  // Restore original state
                  player.currentTime = wasTime;
                  if (!wasPlaying) {
                    player.pause();
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
                  setVideoDuration(player.duration);
                }
              });
          }
        }
      };

      const playTimers = [
        setTimeout(getDurationByPlaying, 100),
        setTimeout(getDurationByPlaying, 200),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        playTimers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, uploadedFileUrl, videoDuration]);

  // const { data: session } = useSession();
  // const [sidebarOpen, setSidebarOpen] = useState(false);

  // Simple timeline component for recorder
  const SimpleTimeline = () => {
    const [dragging, setDragging] = useState(false);
    const [dragValue, setDragValue] = useState(0);

    // Use recording duration if available, otherwise use detected duration
    const displayDuration =
      recordingDuration > 0 ? recordingDuration : videoDuration;

    const handlePlayPause = () => {
      setVideoPlaying(!videoPlaying);
    };

    const handleSeekStart = () => {
      setDragging(true);
      setDragValue(videoCurrentTime);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      setDragValue(Number(e.target.value));
    };

    const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
      const value = Number((e.target as HTMLInputElement).value);
      setVideoCurrentTime(value);
      videoPlayerRef.current?.seekTo(value, "seconds");
      setDragging(false);
    };

    return (
      <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayPause}
            className="rounded-full bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
          >
            {videoPlaying ? (
              <Image
                src="/icons/pause.png"
                alt="Pause"
                width={18}
                height={18}
                className="w-4 h-4"
              />
            ) : (
              <Image
                src="/icons/play.png"
                alt="Play"
                width={18}
                height={18}
                className="w-4 h-4"
              />
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
            className="flex-1 accent-[#A594F9] h-2 rounded-lg bg-gradient-to-r from-[#A594F9] to-[#7C5CFC]"
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
              onClick={() => {
                const newTime = Math.max(0, videoCurrentTime - 5);
                setVideoCurrentTime(newTime);
                videoPlayerRef.current?.seekTo(newTime, "seconds");
              }}
              className="rounded-full  bg-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
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
              onClick={() => {
                const newTime = Math.min(displayDuration, videoCurrentTime + 5);
                setVideoCurrentTime(newTime);
                videoPlayerRef.current?.seekTo(newTime, "seconds");
              }}
              className="rounded-full bg-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
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
  };

  // Recording timeline component for active recording
  const RecordingTimeline = () => {
    return (
      <div className="w-full px-6 pb-4 pt-2 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-red-500 text-white p-2 animate-pulse">
            <div className="w-4 h-4 bg-white rounded-full"></div>
          </div>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${Math.min((recordingTimer / 3600) * 100, 100)}%`, // Max 1 hour
              }}
            ></div>
          </div>
          <span className="text-xs text-red-500 font-mono min-w-[60px] text-right font-bold">
            {formatTime(recordingTimer)}
          </span>
        </div>

        {/* Recording status */}
        <div className="flex items-center justify-between mt-2 px-2 w-full">
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500 font-semibold animate-pulse">
              ⏺ Recording in progress...
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">
              Live Preview
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Enhanced initialization
  useEffect(() => {
    setRecordingTimer(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  // Improved recording timer logic
  useEffect(() => {
    if (recording) {
      setRecordingTimer(0); // Reset to 0 when recording starts

      // Clear existing interval first
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      // Start new interval after delay to ensure recording is active
      const timer = setTimeout(() => {
        recordingIntervalRef.current = setInterval(() => {
          setRecordingTimer((prev) => prev + 1);
        }, 1000);
      }, 100);

      return () => {
        clearTimeout(timer);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
      };
    } else {
      // Stop and reset timer
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingTimer(0);
    }
  }, [recording]);

  // UI after user selects a screen/tab (screenStream is set) or uploads a video file
  if (screenStream || uploadedFileUrl) {
    const isUploaded = uploadedFileUrl && !screenStream;
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden">
        <Toaster position="top-right" />
        <RecorderTopbar onBack={() => router.back()} userInitials={initials} />
        <div className="flex flex-1 overflow-hidden">
          {/* Right Panel */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* New Recording Header Bar */}
            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
              <div>
                <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">
                  New Recording
                </div>
                <div className="text-xs sm:text-sm text-gray-400">
                  Last saved 2 minutes ago
                </div>
              </div>
              {!isUploaded && !recording && videoUrl && (
                <button
                  onClick={handleSaveAndPublish}
                  className="mt-2 sm:mt-0 px-4 sm:px-5 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition flex items-center gap-2 text-sm sm:text-base"
                >
                  <Image
                    src="/icons/1.png"
                    alt="Save"
                    width={20}
                    height={20}
                    className="md:w-6 md:h-6"
                  />
                  Save & Publish
                </button>
              )}
            </div>
            <div className="flex-1 px-2 sm:px-4 pb-2 sm:pb-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow p-4 sm:p-8">
                <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4 text-[#6C63FF]">
                  Preview
                </h2>
                <div className="flex justify-center mb-4 sm:mb-8">
                  {uploadedFileType?.startsWith("image/") ? (
                    <div
                      className="border-2 border-[#6C63FF] rounded-2xl mx-auto"
                      style={{ maxWidth: 900, background: "#000" }}
                    >
                      <Image
                        src={uploadedFileUrl!}
                        alt="Uploaded preview"
                        style={{
                          width: "100%",
                          height: "auto",
                          objectFit: "contain",
                          background: "#000",
                        }}
                        width={900}
                        height={500}
                      />
                    </div>
                  ) : uploadedFileUrl &&
                    uploadedFileType?.startsWith("video/") ? (
                    <div className="w-full max-w-[900px] mx-auto">
                      <div className="bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300">
                        <div className="w-full h-auto aspect-video bg-[#F6F3FF] rounded-b-2xl overflow-hidden">
                          <ReactPlayer
                            ref={videoPlayerRef}
                            url={uploadedFileUrl}
                            playing={videoPlaying}
                            controls={false}
                            muted={false}
                            width="100%"
                            height="100%"
                            style={{
                              objectFit: "contain",
                              borderRadius: "1.25rem",
                              background: "#F6F3FF",
                            }}
                            progressInterval={50}
                            onProgress={({ playedSeconds }) => {
                              // Ensure currentTime starts from 0 immediately
                              if (playedSeconds === 0) {
                                setVideoCurrentTime(0);
                              } else {
                                setVideoCurrentTime(playedSeconds);
                              }
                            }}
                            onDuration={(dur) => {
                              // Only set videoDuration if recordingDuration is not available
                              if (
                                recordingDuration === 0 &&
                                isFinite(dur) &&
                                !isNaN(dur) &&
                                dur > 0
                              ) {
                                setVideoDuration(dur);
                              }
                            }}
                            onStart={() => {
                              // Ensure currentTime starts from 0 when video starts
                              setVideoCurrentTime(0);
                            }}
                            onPlay={() => {
                              // Ensure currentTime is 0 when video starts playing
                              setVideoCurrentTime(0);
                            }}
                            onEnded={() => setVideoPlaying(false)}
                            onReady={() => {
                              console.log("Video loaded in recorder");
                              // Only try to get duration if recordingDuration is not available
                              if (recordingDuration === 0) {
                                // Try to get duration immediately when video is ready
                                setTimeout(() => {
                                  if (videoPlayerRef.current) {
                                    const player =
                                      videoPlayerRef.current.getInternalPlayer();
                                    if (
                                      player &&
                                      player.duration &&
                                      isFinite(player.duration) &&
                                      player.duration > 0
                                    ) {
                                      setVideoDuration(player.duration);
                                    }
                                  }
                                }, 10);

                                // Additional attempts with delays
                                setTimeout(() => {
                                  if (videoPlayerRef.current) {
                                    const player =
                                      videoPlayerRef.current.getInternalPlayer();
                                    if (
                                      player &&
                                      player.duration &&
                                      isFinite(player.duration) &&
                                      player.duration > 0
                                    ) {
                                      setVideoDuration(player.duration);
                                    }
                                  }
                                }, 100);

                                setTimeout(() => {
                                  if (videoPlayerRef.current) {
                                    const player =
                                      videoPlayerRef.current.getInternalPlayer();
                                    if (
                                      player &&
                                      player.duration &&
                                      isFinite(player.duration) &&
                                      player.duration > 0
                                    ) {
                                      setVideoDuration(player.duration);
                                    }
                                  }
                                }, 500);
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
                        </div>
                        <SimpleTimeline />
                      </div>
                    </div>
                  ) : videoUrl ? (
                    <div className="w-full max-w-[900px] mx-auto">
                      <div className="bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300">
                        <div className="w-full h-auto aspect-video bg-[#F6F3FF] rounded-b-2xl overflow-hidden">
                          <ReactPlayer
                            ref={videoPlayerRef}
                            url={videoUrl}
                            playing={videoPlaying}
                            controls={false}
                            muted={false}
                            width="100%"
                            height="100%"
                            style={{
                              objectFit: "contain",
                              borderRadius: "1.25rem",
                              background: "#F6F3FF",
                            }}
                            progressInterval={50}
                            onProgress={({ playedSeconds }) => {
                              // Ensure currentTime starts from 0 immediately
                              if (playedSeconds === 0) {
                                setVideoCurrentTime(0);
                              } else {
                                setVideoCurrentTime(playedSeconds);
                              }
                            }}
                            onDuration={(dur) => {
                              if (isFinite(dur) && !isNaN(dur) && dur > 0) {
                                setVideoDuration(dur);
                              }
                            }}
                            onStart={() => {
                              // Ensure currentTime starts from 0 when video starts
                              setVideoCurrentTime(0);
                            }}
                            onPlay={() => {
                              // Ensure currentTime is 0 when video starts playing
                              setVideoCurrentTime(0);
                            }}
                            onEnded={() => setVideoPlaying(false)}
                            onReady={() => {
                              console.log("Video loaded in recorder");
                              // Try to get duration immediately when video is ready
                              setTimeout(() => {
                                if (videoPlayerRef.current) {
                                  const player =
                                    videoPlayerRef.current.getInternalPlayer();
                                  if (
                                    player &&
                                    player.duration &&
                                    isFinite(player.duration) &&
                                    player.duration > 0
                                  ) {
                                    setVideoDuration(player.duration);
                                  }
                                }
                              }, 10);

                              // Additional attempts with delays
                              setTimeout(() => {
                                if (videoPlayerRef.current) {
                                  const player =
                                    videoPlayerRef.current.getInternalPlayer();
                                  if (
                                    player &&
                                    player.duration &&
                                    isFinite(player.duration) &&
                                    player.duration > 0
                                  ) {
                                    setVideoDuration(player.duration);
                                  }
                                }
                              }, 100);

                              setTimeout(() => {
                                if (videoPlayerRef.current) {
                                  const player =
                                    videoPlayerRef.current.getInternalPlayer();
                                  if (
                                    player &&
                                    player.duration &&
                                    isFinite(player.duration) &&
                                    player.duration > 0
                                  ) {
                                    setVideoDuration(player.duration);
                                  }
                                }
                              }, 500);
                            }}
                            config={{
                              file: {
                                attributes: {
                                  preload: "metadata",
                                },
                              },
                            }}
                          />
                        </div>
                        <SimpleTimeline />
                      </div>
                    </div>
                  ) : screenStream ? (
                    <div className="w-full max-w-[900px] mx-auto">
                      <div className="bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300">
                        <div className="w-full h-auto aspect-video bg-[#F6F3FF] rounded-b-2xl overflow-hidden">
                          <VideoPreview
                            videoUrl={null}
                            isRecording={recording}
                            screenStream={screenStream}
                            className="w-full h-full"
                            showControls={false}
                          />
                        </div>
                        {recording && <RecordingTimeline />}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-300 rounded-2xl">
                      No preview available. Start screen sharing or upload a
                      video to see the preview.
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-6 justify-end">
                  {screenStream && !recording && !isUploaded && !videoUrl && (
                    <>
                      <button
                        onClick={() => {
                          screenStream
                            .getTracks()
                            .forEach((track) => track.stop());
                          startScreenShare();
                        }}
                        className="bg-[#7C5CFC] text-white px-4 sm:px-8 py-2 rounded-lg font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base"
                      >
                        Change Tab
                      </button>
                    </>
                  )}
                  {screenStream && recording && !isUploaded && (
                    <>
                      <div className="flex items-center gap-4 justify-start">
                        <div>
                          <button
                            onClick={stopRecording}
                            className=" bg-[#7C5CFC] text-white px-4 py-2 mx-1 rounded text-sm sm:text-base min-w-[150px] transition"
                          >
                            Stop Recording
                          </button>
                        </div>

                        <div className="">
                          <button
                            onClick={() => {
                              setEnableCamera((prev) => !prev);
                              if (cameraStream) {
                                stopCamera();
                              } else {
                                startCamera();
                              }
                            }}
                            className={`${
                              cameraStream ? "bg-red-600" : "bg-[#7C5CFC]"
                            } text-white px-4 py-2 rounded text-sm sm:text-base min-w-[150px] transition mr-30`}
                          >
                            {cameraStream ? "Stop Camera" : "Start Camera"}
                          </button>
                        </div>

                        {/* {cameraStream && (
                          <DraggableCameraPreview videoRef={somethingxx} />
                        )} */}

                        {enableCamera && (
                          <div className="fixed bottom-2 right-5 w-32 h-32 bg-black shadow z-50 rounded-full overflow-hidden">
                            <video
                              ref={videoPreview}
                              autoPlay
                              playsInline
                              className="w-full h-full object-cover rounded-full"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {(videoUrl || isUploaded) && (
                  <div className="flex flex-col gap-2 sm:gap-4 mt-4 sm:mt-6 justify-center items-center">
                    {!isUploaded && (
                      <div className="flex gap-2 items-center mb-2">
                        <label
                          htmlFor="format-select"
                          className="font-medium text-[#6C63FF] text-sm"
                        >
                          Download as:
                        </label>
                        <select
                          id="format-select"
                          value={format}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                            setFormat(e.target.value as "webm" | "mp4")
                          }
                          className="border border-[#ede7fa] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-xs sm:text-sm"
                        >
                          <option value="webm">WebM (Original)</option>
                          <option value="mp4">MP4 (Video)</option>
                        </select>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                      <button
                        onClick={() => {
                          if (isUploaded) {
                            setUploadedFileUrl(null);
                            setUploadedFileType(null);
                            setBlob(null);
                          } else {
                            reset();
                          }
                        }}
                        className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#F44336] text-white shadow-md hover:bg-[#d32f2f] transition flex items-center gap-2 text-base"
                      >
                        Discard Video
                      </button>
                      {!isUploaded && (
                        <button
                          onClick={handleSaveAndPublish}
                          className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#7C5CFC] text-white shadow-md hover:bg-[#8A76FC] transition flex items-center gap-2 text-base"
                        >
                          Download Video
                        </button>
                      )}
                      {isUploaded && (
                        <button
                          onClick={() => router.push("/editor")}
                          className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#A594F9] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
                        >
                          Edit Video
                        </button>
                      )}
                      {!isUploaded && (
                        <>
                          <button
                            onClick={() => router.push("/editor")}
                            className="px-6 py-3 rounded-lg font-semibold bg-[#A594F9] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
                          >
                            Edit Video
                          </button>
                        </>
                      )}
                    </div>
                    {saveMessage && !isUploaded && (
                      <div className="mt-2 text-[#6C63FF] text-xs sm:text-sm">
                        {saveMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        {/* Save Popup Form */}
        <SavePopupForm
          isOpen={showSavePopup}
          onClose={() => setShowSavePopup(false)}
          onDownload={handlePopupDownload}
          initialTitle={title}
          processing={processingDownload}
        />
      </div>
    );
  }

  // UI for when recording is in progress
  if (recording) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-gray-900 text-white overflow-hidden">
        <div className="bg-gray-800 p-8 rounded-xl shadow-lg flex flex-col items-center space-y-6 w-full max-w-xl">
          <h2 className="text-2xl font-bold animate-pulse">⏺ Recording...</h2>
          <div className="flex flex-col items-center mb-4">
            <div className="text-5xl font-mono font-bold text-yellow-300 bg-gray-900 px-6 py-2 rounded-lg border-2 border-yellow-400 shadow-lg">
              {formatTime(recordingTimer)}
            </div>
            <div className="mt-2 text-base text-yellow-200 text-center max-w-xs">
              This timer shows your actual recording duration.
              <br />
              The video preview below is what is being recorded.
            </div>
          </div>
          {/* Show the live preview during recording, but hide controls */}
          <div className="flex justify-center mb-4 sm:mb-8">
            <VideoPreview
              videoUrl={null}
              isRecording={true}
              screenStream={screenStream}
              className="mx-auto"
              showControls={false}
            />
          </div>
          <button
            onClick={stopRecording}
            className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded w-full text-lg font-semibold"
          >
            ⏹ Stop Recording
          </button>
          <div className="flex items-center gap-2">
            <span>🎙️ Mic: {micEnabled ? "On" : "Off"}</span>
            <button
              onClick={toggleMic}
              className={`px-3 py-1 rounded ${micEnabled ? "bg-[#7C5CFC]" : "bg-gray-600"}`}
            >
              {micEnabled ? "Mute" : "Unmute"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Initial UI (no recording or uploaded video)
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <Toaster position="top-right" />
      <RecorderTopbar onBack={() => router.back()} userInitials={initials} />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar button */}
        <div className="flex items-center sm:hidden mb-2">
          <button
            className="md:hidden fixed top-0 left-0 z-50 bg-[#7C5CFC] text-white p-3 shadow-lg focus:outline-none "
            onClick={() => setSidebarOpen(true)}
            aria-label="Open settings"
          >
            <Menu size={28} />
          </button>
        </div>

        {/* Mobile sidebar drawer */}
        <Dialog
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 w-[90vw] max-w-xs bg-white shadow-2xl p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-[#7C5CFC]">
                Recorder Settings
              </h2>
              <button
                className="text-[#7C5CFC] text-2xl p-1 rounded hover:bg-[#ede7fa] focus:outline-none"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
            {/* Title */}
            <div>
              <label className="block text-[#7C5CFC] font-semibold mb-1">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
                placeholder="Enter recording title"
              />
            </div>
            {/* Upload & Screen Share */}
            <div>
              <label className="block text-[#7C5CFC] font-semibold mb-1">
                Recording Source
              </label>
              <div className="border-2 border-dashed border-[#A594F9] rounded-lg p-4 flex flex-col items-center justify-center mb-4 bg-[#F8F6FF]">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 text-[#7C5CFC] font-semibold text-base focus:outline-none"
                >
                  <span className="text-2xl">
                    <Image
                      src="/icons/upload_icon.png"
                      alt="Notifications"
                      width={20}
                      height={20}
                      className="md:w-6 md:h-6"
                    />
                  </span>
                  Upload Screen Recording
                  <span className="text-xs text-gray-400">
                    MP4, MOV up to 100MB
                  </span>
                </button>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const fileUrl = URL.createObjectURL(file);
                      setUploadedFileUrl(fileUrl);
                      setUploadedFileType(file.type);
                      setBlob(file);
                      setUploadMessage("✅ Uploaded successfully!");
                      toast.success("File uploaded successfully!");
                      setTimeout(() => setUploadMessage(""), 3000);
                    } else {
                      toast.error("No file selected or upload failed.");
                    }
                  }}
                />
                {uploadMessage && (
                  <div className="mt-2 text-green-600 text-xs">
                    {uploadMessage}
                  </div>
                )}
              </div>
              <button
                onClick={startScreenShare}
                className="w-full mt-2 px-4 py-3 rounded-lg bg-white text-[#7C5CFC] font-semibold shadow hover:bg-[#8A76FC] hover:text-white transition flex items-center justify-center gap-2 text-base"
              >
                <Image
                  src="/icons/play_button_icon.png"
                  alt="Notifications"
                  width={20}
                  height={20}
                  className="md:w-6 md:h-6"
                />
                Start Screen Sharing
              </button>
            </div>
          </div>
        </Dialog>

        {/* Main Content */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {/* New Recording Header Bar */}
          <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
            <div>
              <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">
                New Recording
              </div>
              <div className="text-xs sm:text-sm text-gray-400">
                Last saved 2 minutes ago
              </div>
            </div>
          </div>
          {/* Main Area */}
          <div className="flex-1 flex flex-col items-center justify-center h-full overflow-hidden">
            <div className="w-full max-w-6xl mx-auto flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-4 sm:p-12 h-[calc(100vh-12rem)]">
              {uploadedFileUrl ? (
                <video
                  src={uploadedFileUrl}
                  controls
                  className="w-full h-[200px] sm:h-[400px] object-contain bg-[#F6F4FF] mb-4 sm:mb-6 rounded-xl border border-[#7C5CFC]"
                  style={{ maxWidth: 900 }}
                />
              ) : (
                <>
                  <span
                    className="mb-10 mt-0"
                    style={{ width: 96, height: 66, display: "inline-block" }}
                  >
                    <Image
                      src="/icons/tabler_video.svg"
                      alt="Preview Icon"
                      width={96}
                      height={66}
                      className="object-contain"
                      priority
                    />
                  </span>
                  <div className="text-lg sm:text-xl font-semibold text-[#1A0033] mb-2">
                    Start Sharing Your Screen
                  </div>
                  <div className="text-gray-400 text-center max-w-md mb-4 sm:mb-6 text-sm sm:text-base">
                    Click the below button or upload a screen share to begin.
                    <br />
                    creating your interactive demo
                  </div>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-6 justify-center items-center w-full">
                <button
                  onClick={startScreenShare}
                  className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base cursor-pointer"
                >
                  Start Screen Recording
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-white border border-[#ede7fa] text-[#7C5CFC] font-semibold shadow hover:bg-[#F3F0FC] transition text-sm sm:text-base cursor-pointer"
                >
                  Upload File
                </button>
                <div className="flex items-center gap-2 sm:gap-3 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full sm:w-auto justify-center">
                  <span className="text-[#888] font-medium text-sm sm:text-base">
                    Microphone
                  </span>
                  <button
                    onClick={toggleMic}
                    className={`w-10 sm:w-12 h-6 rounded-full flex items-center px-1 transition ${micEnabled ? "bg-[#6C63FF]" : "bg-gray-300"} cursor-pointer`}
                  >
                    <span
                      className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${micEnabled ? "translate-x-4 sm:translate-x-6" : ""}`}
                    />
                  </button>
                </div>
              </div>
              {/* Hidden file input for main area upload */}
              <input
                type="file"
                accept="video/mp4,video/webm,video/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const fileUrl = URL.createObjectURL(file);
                    setUploadedFileUrl(fileUrl);
                    setUploadedFileType(file.type);
                    setBlob(file);
                    setUploadMessage("✅ Uploaded successfully!");
                    toast.success("File uploaded successfully!");
                    setTimeout(() => setUploadMessage(""), 3000);
                  } else {
                    toast.error("No file selected or upload failed.");
                  }
                }}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Save Popup Form */}
      <SavePopupForm
        isOpen={showSavePopup}
        onClose={() => setShowSavePopup(false)}
        onDownload={handlePopupDownload}
        initialTitle={title}
        processing={processingDownload}
      />
    </div>
  );
}
