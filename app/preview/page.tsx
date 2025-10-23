"use client";
import React, { useState, useEffect } from "react";
import ReactPlayer from "react-player";
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaVolumeMute,
  FaExpand,
  FaDownload,
} from "react-icons/fa";
import { ArrowLeft, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import DownloadModal from "../components/DownloadModal";

export default function PreviewPage() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Video Preview");
  const [description, setDescription] = useState("");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVideoUrl(params.get("video"));
    setTitle(params.get("title") || "Video Preview");
    setDescription(params.get("description") || "");
  }, []);

  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const playerRef = React.useRef<ReactPlayer>(null);

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    setMuted(newVolume === 0);
  };

  const handleMuteToggle = () => {
    setMuted(!muted);
  };

  const handleFullscreen = () => {
    const videoContainer = document.getElementById("video-container");
    if (videoContainer) {
      if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  // const handleDownload = () => {
  //   if (videoUrl) {
  //     const a = document.createElement("a");
  //     a.href = videoUrl;
  //     a.download = `${title || "video"}.webm`;
  //     document.body.appendChild(a);
  //     a.click();
  //     document.body.removeChild(a);
  //     toast.success("Download started!");
  //   }
  // };
  const handleDownload = async () => {
    if (videoUrl) {
      try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || "video"}.webm`; // forces a download name
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        window.URL.revokeObjectURL(url);
        toast.success("Download Completed!");
      } catch (error) {
        console.error("Download failed:", error);
        toast.error("Error downloading video");
      }
    }
  };

  const handleDownloadFile = async ({
    title,
    format,
  }: {
    title: string;
    format: "webm" | "mp4";
  }) => {
    if (!videoUrl) return;

    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      window.URL.revokeObjectURL(url);
      toast.success("Download Completed!");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Error downloading video");
    } finally {
      setDownloadOpen(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: description,
          url: shareUrl,
        });
        toast.success("Shared successfully!");
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard!");
      } catch (error) {
        console.error("Error copying to clipboard:", error);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    playerRef.current?.seekTo(seekTime, "seconds");
  };

  if (!videoUrl) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            No Video Found
          </h1>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 to-indigo-100">
      {/* <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#2D2A3A",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "1.1rem",
            boxShadow: "0 4px 24px 0 #0008",
            borderRadius: "10px",
            zIndex: 99999,
          },
          success: { iconTheme: { primary: "#7C5CFC", secondary: "#fff" } },
          error: { iconTheme: { primary: "#f87171", secondary: "#fff" } },
        }}
      /> */}

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Video Preview
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleShare}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setDownloadOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <FaDownload className="w-4 h-4" />
                  <span>Download</span>
                </button>
                {/* Download Modal */}
                <DownloadModal
                  isOpen={downloadOpen}
                  onClose={() => setDownloadOpen(false)}
                  onDownload={handleDownloadFile}
                  defaultTitle={title}
                />

                {exportMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-[#ede7fa] rounded-lg shadow z-10">
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-t-lg"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleDownload(); // ✅ actually download
                      }}
                    >
                      Download WebM
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-t-lg"
                      onClick={() => {
                        setExportMenuOpen(false);
                        handleDownload(); // ✅ actually download
                      }}
                    >
                      Download Mp4
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title and Description Display */}
        {/* {(title !== "Video Preview" || description) && (
          <div className="bg-white rounded-lg p-6 mb-6 shadow-sm border border-gray-200">
            {title !== "Video Preview" && (
              <div className="mb-3">
                <span className="text-sm font-medium text-gray-500">
                  Title:{" "}
                </span>
                <span className="text-2xl font-bold text-gray-800">
                  {title}
                </span>
              </div>
            )}
            {description && (
              <div>
                <span className="text-sm font-medium text-gray-500">
                  Description:{" "}
                </span>
                <span className="text-gray-600 text-base leading-relaxed">
                  {description}
                </span>
              </div>
            )}
          </div>
        )} */}

        <div
          id="video-container"
          className="relative bg-black rounded-2xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: "16/9" }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          )}

          <ReactPlayer
            ref={playerRef}
            url={videoUrl}
            playing={playing}
            volume={muted ? 0 : volume}
            width="100%"
            height="100%"
            onReady={() => setIsLoading(false)}
            onDuration={setDuration}
            onProgress={handleProgress}
            onError={(e) => {
              console.error("Video error:", e);
              toast.error("Error loading video");
            }}
            style={{ objectFit: "contain" }}
          />

          {/* Video Controls Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-6">
            <div className="flex items-center space-x-4">
              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                className="flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
              >
                {playing ? (
                  <FaPause className="w-5 h-5 text-white" />
                ) : (
                  <FaPlay className="w-5 h-5 text-white ml-1" />
                )}
              </button>

              {/* Progress Bar */}
              <div className="flex-1">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #7C5CFC 0%, #7C5CFC ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.3) 100%)`,
                  }}
                />
              </div>

              {/* Time Display */}
              <div className="text-white text-sm font-mono min-w-[100px] text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              {/* Volume Control */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleMuteToggle}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  {muted || volume === 0 ? (
                    <FaVolumeMute className="w-5 h-5" />
                  ) : (
                    <FaVolumeUp className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) =>
                    handleVolumeChange(parseFloat(e.target.value))
                  }
                  className="w-20 h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={handleFullscreen}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <FaExpand className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Video Info */}
        <div className="mt-8 bg-white rounded-2xl p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{title}</h2>
          {description && (
            <p className="text-gray-600 leading-relaxed">{description}</p>
          )}
          <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
            <span>Duration: {formatTime(duration)}</span>
            <span>Format: WebM</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #7c5cfc;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #7c5cfc;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}
