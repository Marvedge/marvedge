import { useEffect } from "react";
import ReactPlayer from "react-player";

interface UseVideoDurationProps {
  videoUrl: string | null;
  duration: number;
  recordingDuration: number;
  blob: Blob | null;
  playerRef: React.RefObject<ReactPlayer>;
  setDuration: (duration: number) => void;
}

export function useVideoDuration({
  videoUrl,
  duration,
  recordingDuration,
  blob,
  playerRef,
  setDuration,
}: UseVideoDurationProps) {
  // Use recording duration when available
  useEffect(() => {
    if (recordingDuration > 0 && videoUrl) {
      setDuration(recordingDuration);
    }
  }, [recordingDuration, videoUrl, setDuration]);

  // Try to get duration from blob store when video is first loaded
  useEffect(() => {
    if (videoUrl && duration === 0 && blob && recordingDuration === 0) {
      const getDurationFromBlob = async () => {
        try {
          const tempVideo = document.createElement("video");
          tempVideo.src = URL.createObjectURL(blob);
          tempVideo.preload = "metadata";

          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(Math.floor(tempVideo.duration));
            }
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempVideo.src);
          };

          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from blob:", error);
        }
      };

      // Try immediately and with delays
      getDurationFromBlob();
      const timers = [
        setTimeout(getDurationFromBlob, 10),
        setTimeout(getDurationFromBlob, 50),
        setTimeout(getDurationFromBlob, 100),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, blob, recordingDuration, setDuration]);

  // Force metadata loading for ReactPlayer
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const forceMetadataLoad = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            player.preload = "metadata";
            player.load();
          }
        }
      };

      forceMetadataLoad();
      const timers = [
        setTimeout(forceMetadataLoad, 20),
        setTimeout(forceMetadataLoad, 60),
        setTimeout(forceMetadataLoad, 120),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, playerRef]);

  // Create hidden video element to force metadata loading
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
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

      createHiddenVideo();
      const timers = [
        setTimeout(createHiddenVideo, 5),
        setTimeout(createHiddenVideo, 30),
        setTimeout(createHiddenVideo, 80),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, setDuration]);

  // Try to get duration by seeking to end
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const getDurationBySeeking = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            player.currentTime = 999999;
            setTimeout(() => {
              if (
                player.duration &&
                isFinite(player.duration) &&
                player.duration > 0
              ) {
                setDuration(player.duration);
              }
              player.currentTime = 0;
            }, 100);
          }
        }
      };

      const timers = [
        setTimeout(getDurationBySeeking, 70),
        setTimeout(getDurationBySeeking, 140),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, playerRef, setDuration]);

  // Last resort: try to get duration from the video URL directly
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const getDurationFromUrl = async () => {
        try {
          const tempVideo = document.createElement("video");
          tempVideo.src = videoUrl;

          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(Math.floor(tempVideo.duration));
            }
          };

          tempVideo.onerror = () => {
            console.error("Error loading video from URL");
          };

          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from URL:", error);
        }
      };

      const timers = [
        setTimeout(getDurationFromUrl, 800),
        setTimeout(getDurationFromUrl, 1800),
        setTimeout(getDurationFromUrl, 2800),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, setDuration]);

  // Original duration detection from ReactPlayer
  useEffect(() => {
    if (recordingDuration === 0) {
      const interval = setInterval(() => {
        const video = playerRef.current?.getInternalPlayer();
        if (
          video &&
          !isNaN(video.duration) &&
          video.duration > 0 &&
          duration === 0
        ) {
          setDuration(Math.floor(video.duration));
          clearInterval(interval);
        }
      }, 500);

      return () => clearInterval(interval);
    }
  }, [videoUrl, duration, recordingDuration, playerRef, setDuration]);

  // Additional duration detection for recorded videos
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const getDurationFromVideo = async () => {
        try {
          const response = await fetch(videoUrl);
          const videoBlob = await response.blob();
          const tempVideo = document.createElement("video");
          tempVideo.src = URL.createObjectURL(videoBlob);
          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(Math.floor(tempVideo.duration));
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

      const timers = [
        setTimeout(getDurationFromVideo, 500),
        setTimeout(getDurationFromVideo, 1000),
        setTimeout(getDurationFromVideo, 2000),
        setTimeout(getDurationFromVideo, 3000),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, setDuration]);

  // Additional method: try to get duration from the video element directly
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const getDurationFromVideoElement = () => {
        const video = playerRef.current?.getInternalPlayer();
        if (video) {
          video.load();
          video.addEventListener(
            "loadedmetadata",
            () => {
              if (
                video.duration &&
                isFinite(video.duration) &&
                video.duration > 0
              ) {
                setDuration(Math.floor(video.duration));
              }
            },
            { once: true },
          );
        }
      };

      const timers = [
        setTimeout(getDurationFromVideoElement, 600),
        setTimeout(getDurationFromVideoElement, 1500),
        setTimeout(getDurationFromVideoElement, 2500),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, playerRef, setDuration]);

  // Force duration detection for recorded videos
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
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
              setDuration(Math.floor(tempVideo.duration));
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

      getDurationFromVideo();
      const timers = [
        setTimeout(getDurationFromVideo, 50),
        setTimeout(getDurationFromVideo, 150),
        setTimeout(getDurationFromVideo, 300),
      ];

      const getDurationBySeeking = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            const wasPlaying = !player.paused;
            const wasTime = player.currentTime;

            player.currentTime = 999999;

            setTimeout(() => {
              if (
                player.duration &&
                isFinite(player.duration) &&
                player.duration > 0
              ) {
                setDuration(Math.floor(player.duration));
              }
              player.currentTime = wasTime;
              if (wasPlaying) {
                player.play();
              }
            }, 100);
          }
        }
      };

      const seekTimers = [
        setTimeout(getDurationBySeeking, 70),
        setTimeout(getDurationBySeeking, 140),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        seekTimers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration, playerRef, setDuration]);
}
