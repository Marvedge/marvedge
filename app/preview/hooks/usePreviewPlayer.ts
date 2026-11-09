import React, { useState, useEffect } from "react";
import ReactPlayer from "react-player";
import { toast } from "sonner";
import { downloadVideoAs, isSafePreviewUrl } from "../utils/previewHelpers";

/**
 * Resolve the `?video=` query param to a renderable URL. Only http(s) URLs
 * of sane length pass; `javascript:`, `data:`, protocol-relative and
 * short/garbage inputs resolve to `null` so the page renders NoVideoFound
 * instead of feeding an attacker-controlled URL to the player.
 */
export function resolvePreviewVideoUrl(raw: string | null | undefined): string | null {
  if (!isSafePreviewUrl(raw)) {
    return null;
  }
  return raw.trim();
}

export function usePreviewPlayer() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Video Preview");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVideoUrl(resolvePreviewVideoUrl(params.get("video")));
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
    const nextPlaying = !playing;
    if (nextPlaying) {
      const isAtEnd = currentTime >= duration - 0.1;
      if (isAtEnd && playerRef.current) {
        playerRef.current.seekTo(0, "seconds");
        setCurrentTime(0);
      }
    }
    setPlaying(nextPlaying);
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

  const handleDownload = async () => {
    if (videoUrl) {
      try {
        await downloadVideoAs(videoUrl, `${title || "video"}.webm`);
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
    if (!videoUrl) {
      return;
    }

    try {
      await downloadVideoAs(videoUrl, `${title}.${format}`);
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

  const handleProgress = (state: { playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds);
    if (duration > 0 && state.playedSeconds >= duration - 0.05) {
      setPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = parseFloat(e.target.value);
    setCurrentTime(seekTime);
    playerRef.current?.seekTo(seekTime, "seconds");
  };

  return {
    videoUrl,
    title,
    description,
    playing,
    volume,
    muted,
    duration,
    currentTime,
    isLoading,
    exportMenuOpen,
    downloadOpen,
    playerRef,
    setDuration,
    setIsLoading,
    setExportMenuOpen,
    setDownloadOpen,
    handlePlayPause,
    handleVolumeChange,
    handleMuteToggle,
    handleFullscreen,
    handleDownload,
    handleDownloadFile,
    handleShare,
    handleProgress,
    handleSeek,
    onEnded: () => setPlaying(false),
  };
}
