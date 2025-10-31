import { useEffect } from "react";
import ReactPlayer from "react-player";

interface UseVideoDurationProps {
  videoUrl: string | null;
  uploadedFileUrl: string | null;
  videoDuration: number;
  recordingDuration: number;
  setVideoDuration: (duration: number) => void;
  videoPlayerRef: React.RefObject<ReactPlayer | null>;
}

export function useVideoDuration({
  videoUrl,
  uploadedFileUrl,
  videoDuration,
  recordingDuration,
  setVideoDuration,
  videoPlayerRef,
}: UseVideoDurationProps) {
  // Use recording duration when available
  useEffect(() => {
    if (recordingDuration > 0 && videoUrl) {
      setVideoDuration(recordingDuration);
    }
  }, [recordingDuration, videoUrl, setVideoDuration]);

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
  }, [videoUrl, videoDuration, setVideoDuration]);

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
  }, [uploadedFileUrl, videoDuration, setVideoDuration]);

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
  }, [
    videoUrl,
    uploadedFileUrl,
    videoDuration,
    setVideoDuration,
    videoPlayerRef,
  ]);
}
