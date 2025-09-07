"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  MouseEvent,
} from "react";

import { useEditor } from "@/app/hooks/useEditor";
import EditorSidebar from "@/app/components/EditorSidebar";
import EditorTopbar from "@/app/components/EditorTopbar";
import Image from "next/image";
import TimelineRuler from "@/app/components/TimeLine";
import { FaExpand, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { X } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { useSession } from "next-auth/react";
// import { TimelineSlider } from "@/app/components/MytimeLine";
// import { useCallback } from "react";
import { toast } from "sonner";
import ReactPlayer from "react-player";
import { useRouter } from "next/navigation";
import { sanitizeFilename } from "@/app/lib/constants";
import ZoomEffectsPopup from "@/app/components/ZoomEffectsPopup";
import SaveDemoModal from "@/app/components/SaveDemoModal";
import { formatTime } from "@/app/lib/dateTimeUtils";
import { useBlobStore } from "@/app/store/blobStore";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { ZoomEffect } from "@/app/interfaces/editor/IZoomEffect";
import axios from "axios";
import { ErrorResponse } from "resend";
// import { ErrorResponse } from "resend";

interface RectOverlay {
  type: "blur" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArrowOverlay {
  type: "arrow";
  x: number;
  y: number;
  x2: number;
  y2: number;
}

interface TextOverlay {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
}

type Overlay = RectOverlay | ArrowOverlay | TextOverlay;
const imageMap: Record<string, string> = {
  bg1: "/icons/bg-mountain-sunset.svg",
  bg2: "/icons/bg-abstract-circles.svg",
  bg3: "/icons/bg-crystalline.svg",
  bg4: "/icons/bg-brushstrokes.svg",
  bg5: "/icons/bg-warm-gradients.svg",
  bg6: "/icons/bg-ethereal.svg",
  bg7: "/icons/bg-fiery.svg",
  bg8: "/icons/bg-ribbons.svg",
};

export default function EditorPage() {
  const router = useRouter();
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timelineStartTime, setTimelineStartTime] = useState<number>(0);

  // State to store loaded segments
  const [, setLoadedSegments] = useState<
    { start: string; end: string }[] | null
  >(null);
  const [currentSegments, setCurrentSegments] = useState<
    { start: string; end: string }[]
  >([{ start: "00:00:00", end: "00:00:00" }]);

  // Update tool state to include 'none' and set as default
  const [tool, setTool] = useState<"none" | "blur" | "rect" | "arrow" | "text">(
    "none"
  );
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [textColor, setTextColor] = useState("#000000");
  const [textFont, setTextFont] = useState("16px sans-serif");

  // Sidebar state
  const [sidebarTitle, setSidebarTitle] = useState("");
  const [sidebarDescription, setSidebarDescription] = useState("");

  // Save Demo Modal state
  const [showSaveDemoModal, setShowSaveDemoModal] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);

  // Hamburger sidebar state for mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Add currentTime and duration state for syncing ---
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Zoom effects state
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [isZoomPopupOpen, setIsZoomPopupOpen] = useState(false);
  const [currenZommEfffect, setCurrentZoomEffect] = useState<ZoomEffect | null>(
    null
  );
  // Simple direct two-way sync
  const [inputStartTime, setInputStartTime] = useState("00:00:00");
  const [inputEndTime, setInputEndTime] = useState("00:00:00");
  const [timelineEndTime, setTimelineEndTime] = useState(0);
  const {
    videoUrl: recordedVideoUrl,
    mp4Url,
    thumbnailUrl,
    processing,
    resetVideo,
    downloadBlob,
  } = useEditor();
  const blob = useBlobStore((state) => state.blob);
  const { recordingDuration } = useScreenRecorder();
  const playerRef = useRef<ReactPlayer>(null!);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // State for browser bar controls
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Helper functions for time conversion
  console.log(currenZommEfffect);
  const formatTimeForInput = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);
  // const [isPlaying, setIsPlaying] = useState(false);
  // const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);

  // Handle URL parameters for editing existing demos
  useEffect(() => {
    if (!params) return;

    const urlVideo = params.get("video");
    const urlStartTime = params.get("startTime");
    const urlEndTime = params.get("endTime");
    const urlSegments = params.get("segments");
    const urlZoom = params.get("zoom");
    const urlTitle = params.get("title");
    const urlDescription = params.get("description");

    if (urlVideo) {
      setVideoUrl(urlVideo);
      // Set timeline values if provided
      if (urlStartTime && urlEndTime) {
        const startSeconds = parseInt(urlStartTime);
        const endSeconds = parseInt(urlEndTime);

        if (!isNaN(startSeconds) && !isNaN(endSeconds)) {
          setInputStartTime(formatTimeForInput(startSeconds));
          setInputEndTime(formatTimeForInput(endSeconds));
          setTimelineEndTime(endSeconds);
        }
      }

      if (urlTitle) {
        setSidebarTitle(urlTitle);
      }

      if (urlDescription) {
        setSidebarDescription(urlDescription);
      }

      // Load segments if provided
      if (urlSegments) {
        try {
          const segments = JSON.parse(urlSegments);
          console.log("Loaded segments from URL:", segments);
          const convertedSegments = segments.map(
            (seg: { start: string; end: string }) => ({
              start: seg.start,
              end: seg.end,
            })
          );
          setLoadedSegments(convertedSegments);
          setCurrentSegments(convertedSegments);
        } catch (error) {
          console.error("Error parsing segments from URL:", error);
        }
      }
      // Load zoom effects if provided
      if (urlZoom) {
        try {
          const zoom = JSON.parse(urlZoom);
          console.log("Loaded zoom effects from URL:", zoom);
          setZoomEffects(zoom);
        } catch (error) {
          console.error("Error parsing zoom from URL:", error);
        }
      }
    }
  }, [
    params,
    setVideoUrl,
    setInputStartTime,
    setInputEndTime,
    setTimelineEndTime,
    setSidebarTitle,
    setSidebarDescription,
    setLoadedSegments,
    setCurrentSegments,
    setZoomEffects,
    formatTimeForInput,
  ]);

  // User initials logic (copied from recorder page)
  const { data: session } = useSession();
  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";

  const [selectedBackground, setSelectedBackground] = useState<string | null>(
    null
  );
  const [backgroundType, setBackgroundType] = useState<string>("");
  const [customBackground, setCustomBackground] = useState<File | null>(null);

  // No-op setProgress to satisfy required callback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setProgress = (_value?: number) => {};

  // Use recording duration if available, otherwise use detected duration
  const displayDuration = recordingDuration > 0 ? recordingDuration : duration;

  // Initialize timeline pointers when video duration is loaded (only once)
  useEffect(() => {
    if (duration > 0 && timelineEndTime === 0) {
      setTimelineStartTime(0);
      setInputStartTime(formatTimeForInput(0));
      // Only initialize if not already set
      const initialEndTime = duration; // Use the full video duration
      setTimelineEndTime(initialEndTime);
      setInputEndTime(formatTimeForInput(initialEndTime));
      console.log("Initialized timeline pointers:", {
        start: 0,
        end: initialEndTime,
      });
    }
  }, [
    duration,
    timelineEndTime,
    setTimelineStartTime,
    setInputStartTime,
    setTimelineEndTime,
    setInputEndTime,
    formatTimeForInput,
  ]);

  // Simple timeline change handler
  const handleTimelineChange = useCallback(
    (start: number, end: number) => {
      setInputStartTime(formatTimeForInput(start));
      setInputEndTime(formatTimeForInput(end));
    },
    [formatTimeForInput]
  );

  // Fullscreen logic
  const handleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    console.log("Fullscreen button clicked", { el });
    if (!el) {
      alert("Video container not found.");
      return;
    }
    // Enter fullscreen
    if (
      !document.fullscreenElement &&
      !(
        "webkitFullscreenElement" in document &&
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement
      ) &&
      !(
        "msFullscreenElement" in document &&
        (document as Document & { msFullscreenElement?: Element })
          .msFullscreenElement
      )
    ) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch((err) => {
          alert("Failed to enter fullscreen: " + err.message);
          console.error("Fullscreen error:", err);
        });
      } else if ("webkitRequestFullscreen" in el) {
        (
          el as HTMLElement & { webkitRequestFullscreen?: () => void }
        ).webkitRequestFullscreen?.();
      } else if ("msRequestFullscreen" in el) {
        (
          el as HTMLElement & { msRequestFullscreen?: () => void }
        ).msRequestFullscreen?.();
      } else {
        alert("Fullscreen API is not supported in this browser.");
        console.error("Fullscreen API not supported");
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ("webkitExitFullscreen" in document) {
        (
          document as Document & { webkitExitFullscreen?: () => void }
        ).webkitExitFullscreen?.();
      } else if ("msExitFullscreen" in document) {
        (
          document as Document & { msExitFullscreen?: () => void }
        ).msExitFullscreen?.();
      } else {
        alert("Cannot exit fullscreen: API not supported.");
        console.error("Exit Fullscreen API not supported");
      }
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!params) return;

    // Only set recorded video URL if no URL parameter is provided
    if (recordedVideoUrl && !params.get("video")) {
      setVideoUrl(recordedVideoUrl);
    }
  }, [recordedVideoUrl, params]);

  // Use recording duration when available
  useEffect(() => {
    if (recordingDuration > 0 && videoUrl) {
      setDuration(recordingDuration);
    }
  }, [recordingDuration, videoUrl]);

  // useEffect(() => {
  //   if (duration > 0 || recordingDuration > 0) return;

  //   const tryGetDuration = async () => {
  //     // Try ReactPlayer duration
  //     if (playerRef.current) {
  //       const player = playerRef.current.getInternalPlayer();
  //       if (
  //         player?.duration &&
  //         isFinite(player.duration) &&
  //         player.duration > 0
  //       ) {
  //         setDuration(Math.floor(player.duration));
  //         return;
  //       }
  //     }
  //     // Try blob
  //     if (blob) {
  //       const tempVideo = document.createElement("video");
  //       tempVideo.src = URL.createObjectURL(blob);
  //       tempVideo.preload = "metadata";
  //       await new Promise<void>((resolve) => {});
  //     }
  //   };
  // }, []);
  // Try to get duration from blob store when video is first loaded

  const getBackgroundStyle = useCallback(() => {
    if (!selectedBackground) return {};

    if (selectedBackground === "hidden") {
      return { background: "transparent" };
    }

    if (selectedBackground === "custom" && customBackground) {
      return {
        backgroundImage: `url(${URL.createObjectURL(customBackground)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    if (selectedBackground.startsWith("gradient:")) {
      const gradientId = selectedBackground.replace("gradient:", "");
      const gradientMap: Record<string, string> = {
        sunset:
          "linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)",
        ocean: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        mint: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
        royal: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        steel: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)",
        candy: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
      };
      return { background: gradientMap[gradientId] || "" };
    }

    if (selectedBackground.startsWith("color:")) {
      const color = selectedBackground.replace("color:", "");
      return { backgroundColor: color };
    }

    if (imageMap[selectedBackground]) {
      return {
        backgroundImage: `url(${imageMap[selectedBackground]})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    return {};
  }, [selectedBackground, customBackground]);

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

      // Try immediately and with delays - FASTER
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
  }, [videoUrl, duration, blob, recordingDuration]);

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

      // Try to force metadata loading immediately - FASTER
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
  }, [videoUrl, duration, recordingDuration]);

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

      // Try multiple times with different delays - FASTER
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
  }, [videoUrl, duration, recordingDuration]);

  // Try to get duration by seeking to end
  useEffect(() => {
    if (videoUrl && duration === 0 && recordingDuration === 0) {
      const getDurationBySeeking = () => {
        if (playerRef.current) {
          const player = playerRef.current.getInternalPlayer();
          if (player) {
            // Try to seek to a large time to trigger duration detection
            player.currentTime = 999999;
            setTimeout(() => {
              if (
                player.duration &&
                isFinite(player.duration) &&
                player.duration > 0
              ) {
                setDuration(player.duration);
              }
              // Reset to beginning
              player.currentTime = 0;
            }, 100);
          }
        }
      };

      // Try with delays - FASTER
      const timers = [
        setTimeout(getDurationBySeeking, 70),
        setTimeout(getDurationBySeeking, 140),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration]);

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
  }, [videoUrl, duration, recordingDuration]);

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
  }, [videoUrl, duration, recordingDuration]);

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

          // Load the video to trigger metadata loading
          tempVideo.load();
        } catch (error) {
          console.error("Error getting duration from video:", error);
        }
      };

      // Try multiple times with different delays
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
  }, [videoUrl, duration, recordingDuration]);

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
            { once: true }
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
  }, [videoUrl, duration, recordingDuration]);

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

      // Try multiple times with different delays
      getDurationFromVideo();
      const timers = [
        setTimeout(getDurationFromVideo, 50),
        setTimeout(getDurationFromVideo, 150),
        setTimeout(getDurationFromVideo, 300),
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
                setDuration(Math.floor(player.duration));
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
        setTimeout(getDurationBySeeking, 70),
        setTimeout(getDurationBySeeking, 140),
      ];

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        seekTimers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [videoUrl, duration, recordingDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = playerRef.current?.getInternalPlayer();
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const item of overlays) {
        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 2;
        switch (item.type) {
          case "blur":
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(item.x, item.y, item.w, item.h);
            break;
          case "rect":
            ctx.strokeRect(item.x, item.y, item.w, item.h);
            break;
          case "arrow":
            ctx.beginPath();
            ctx.moveTo(item.x, item.y);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();
            break;
          case "text":
            ctx.font = item.font;
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, item.x, item.y);
            break;
        }
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, [overlays]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawing(true);
  };

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    let newOverlay: Overlay;

    if (tool === "arrow") {
      newOverlay = {
        type: "arrow",
        x: startPos.x,
        y: startPos.y,
        x2: endX,
        y2: endY,
      };
    } else if (tool === "text") {
      const text = prompt("Enter text:", "Sample text") || "";
      newOverlay = {
        type: "text",
        x: endX,
        y: endY,
        text,
        color: textColor,
        font: textFont,
      };
    } else if (tool === "blur" || tool === "rect") {
      newOverlay = {
        type: tool,
        x: Math.min(startPos.x, endX),
        y: Math.min(startPos.y, endY),
        w: Math.abs(endX - startPos.x),
        h: Math.abs(endY - startPos.y),
      };
    } else {
      setDrawing(false);
      setStartPos(null);
      return;
    }

    setOverlays((prev) => [...prev, newOverlay]);
    setDrawing(false);
    setStartPos(null);
  };

  const handleUndo = () => setOverlays((prev) => prev.slice(0, -1));
  const handleClear = () => setOverlays([]);
  const handleSaveOverlays = () =>
    localStorage.setItem("videoOverlays", JSON.stringify(overlays));
  const handleLoadOverlays = () => {
    const saved = localStorage.getItem("videoOverlays");
    if (saved) setOverlays(JSON.parse(saved));
  };

  // Save Demo handler
  const handleSaveDemo = async (data: {
    title: string;
    description: string;
  }) => {
    if (!videoUrl) {
      toast.error("No video available to save");
      return;
    }

    try {
      setSavingDemo(true);
      toast.loading("Saving demo...");

      const startTime = inputStartTime;
      const endTime = inputEndTime;

      // First, upload video to Cloudinary if it's a blob URL
      let cloudinaryVideoUrl = videoUrl;
      if (videoUrl.startsWith("blob:")) {
        try {
          // Get the video blob
          const response = await fetch(videoUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch video blob");
          }
          const videoBlob = await response.blob();
          // Create FormData for Cloudinary upload
          const CLOUDINARY_CLOUD_NAME =
            process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
          const CLOUDINARY_UPLOAD_PRESET =
            process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
          // const CLOUDINARY_API_BASE =
          //   process.env.NEXT_PUBLIC_CLOUDINARY_API_BASE!;

          // const CLOUDINARY_API_URL = `/v1_1https://api.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload`;
          // const CLOUDINARY_API_URL = `${CLOUDINARY_API_BASE}/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
          const cloudFormData = new FormData();
          cloudFormData.append("file", videoBlob, "video.webm");
          cloudFormData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
          const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

          console.log("Uploading to Cloudinary...");

          // Upload to Cloudinary
          // const cloudRes = await fetch(
          //   "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
          //   {
          //     method: "POST",
          //     body: cloudFormData,
          //   }
          // );

          try {
            const cloudRes = await axios.post(
              CLOUDINARY_API_URL,
              cloudFormData
            );
            console.log("Upload success:", cloudRes.data);
            cloudinaryVideoUrl = cloudRes.data.secure_url;
          } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
              console.log("cloudinary failed... ... ");
              console.error("Cloudinary upload failed:");
              console.error("Status:", error.response?.status);
              console.error("Status Text:", error.response?.statusText);
              console.error("Response Data:", error.response?.data);
              console.error("Headers:", error.response?.headers);
            } else {
              console.error("Unexpected error:", error);
            }
          }
        } catch (cloudError) {
          console.error("Error uploading to Cloudinary:", cloudError);
          toast.dismiss();
          toast.error("Failed to upload video to Cloudinary");
          return;
        }
      }

      // Use current segments from the timeline
      const segmentsToSave =
        currentSegments.length > 0
          ? currentSegments
          : [
              {
                start: startTime,
                end: endTime,
              },
            ];

      // Call the API to save demo with editing object
      const editingToSave = {
        segments: segmentsToSave,
        zoom: zoomEffects,
      };
      try {
        const response = await axios.post("/api/demo", {
          title: data.title,
          description: data.description,
          videoUrl: cloudinaryVideoUrl,
          // startTime,
          // endTime,
          editing: editingToSave,
        });
        console.log("Demo saved:", response.data);
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          if (error.response) {
            console.error(
              `Failed to save demo: ${error.response.status} - ${JSON.stringify(error.response.data)}`
            );
          } else {
            console.error("Axios error:", error.message);
          }
        } else if (error instanceof Error) {
          console.error("Unexpected error:", error.message);
        } else {
          console.error("Unknown error:", error);
        }
      }

      // Update the sidebar state with the saved data
      setSidebarTitle(data.title);
      setSidebarDescription(data.description);
      toast.dismiss();
      toast.success("Demo saved successfully!");
      // Close the modal
      setShowSaveDemoModal(false);
    } catch (error) {
      console.error("Error saving demo:", error);
      toast.dismiss();
      toast.error("Failed to save demo");
    } finally {
      setSavingDemo(false);
    }
  };

  const videoTrimHandler = async (
    segments: { start: string; end: string }[]
  ) => {
    try {
      setProgress(1);
      toast.loading("Uploading and trimming video...");

      // Check if videoUrl exists
      if (!videoUrl) {
        toast.error("No video available to trim");
        return;
      }

      console.log("Starting trim process...");
      console.log("Video URL:", videoUrl);
      console.log("Segments:", segments);

      // Get the current video blob
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }
      const videoBlob = await response.blob();
      console.log("Video blob size:", videoBlob.size);
      // 1. Validate segments
      if (!segments || segments.length === 0) {
        throw new Error("No segments provided");
      }

      // 2. Prepare multipart form data and send to backend
      console.log("Sending video blob to backend");
      const formData = new FormData();
      formData.append("video", videoBlob, "video.mp4");
      formData.append("segments", JSON.stringify(segments));
      console.log(formData);
      const trimRes = await axios.post(
        `${process.env.NEXT_PUBLIC_VIDEO_PROCESSING_BACKEND_URL}/api/trim`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          responseType: "blob",
        }
      );

      const trimmedBlob = new Blob([trimRes.data], { type: "video/mp4" });
      const trimmedVideoUrl = URL.createObjectURL(trimmedBlob);

      if (trimmedVideoUrl) {
        toast.dismiss();
        console.log(trimmedVideoUrl);
        toast.success("Video trimmed successfully!");
        setVideoUrl(trimmedVideoUrl);
      } else {
        toast.error("Failed to trim video - no trimmedUrl returned");
      }
    } catch (err: unknown) {
      if (axios.isAxiosError<ErrorResponse>(err)) {
        const message = err.response?.data?.message || "Unexpected error";
        toast.dismiss();
        toast.error(`Error processing video: ${message}`);
      } else {
        toast.dismiss();
        toast.error("Something went wrong");
      }
    } finally {
      setProgress(0);
    }
  };

  // Zoom effects handlers
  const onZoomEffectCreate = (effect: ZoomEffect) => {
    console.log("Creating zoom effect:", effect);
    console.log("Zoom level:", effect.zoomLevel, "Expected: > 1.0");
    console.log(
      "Coordinates:",
      { x: effect.x, y: effect.y },
      "Expected: 0-1 range"
    );

    if (effect.zoomLevel <= 1.0) {
      console.warn("⚠ Zoom level is too low, forcing to 2.0");
      effect.zoomLevel = 2.0;
    }

    setZoomEffects((prev) => [...prev, effect]);
    console.log("Total zoom effects:", [...zoomEffects, effect].length);
  };

  // const onZoomEffectRemove = (id: string) => {
  //   setZoomEffects((prev) => prev.filter((effect) => effect.id !== id));
  // };

  const onZoomEffectsChange = (effects: ZoomEffect[]) => {
    setZoomEffects(effects);
  };

  // Check for active zoom effects based on current time
  useEffect(() => {
    const activeEffect = zoomEffects.find(
      (effect) =>
        currentTime >= effect.startTime && currentTime <= effect.endTime
    );
    setCurrentZoomEffect(activeEffect || null);
  }, [currentTime, zoomEffects]);

  const [volume, setVolume] = useState(1);

  return (
    <main className="flex flex-col h-screen w-full bg-gray-50">
      <Toaster
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
      />
      <EditorTopbar onBack={() => router.back()} userInitials={initials} />
      <div className="flex flex-1 min-h-0">
        <EditorSidebar
          title={sidebarTitle}
          setTitle={setSidebarTitle}
          description={sidebarDescription}
          setDescription={setSidebarDescription}
          onDownloadWebM={() => {
            const filename = sanitizeFilename(sidebarTitle) || "clip";
            if (videoUrl) {
              const a = document.createElement("a");
              a.href = videoUrl;
              a.download = `${filename}.webm`;
              a.click();
            }
          }}
          onDownloadMP4={() => {
            const filename = sanitizeFilename(sidebarTitle) || "clip";
            if (mp4Url) {
              downloadBlob(mp4Url, `${filename}.mp4`);
            }
          }}
          onExportWebM={async () => {
            if (!videoUrl) {
              toast.error("No video available to export");
              return;
            }

            try {
              console.log("sending from here #linex 1228");
              toast.loading("Processing video...");
              console.log(selectedBackground);

              // Fetch blob from ReactPlayer video
              const res = await fetch(videoUrl);
              const videoBlob = await res.blob();

              const formData = new FormData();
              formData.append("video", videoBlob, "video.webm");

              // Handle background
              if (selectedBackground) {
                const backgroundPath = imageMap[selectedBackground];
                console.log(backgroundPath);
                if (backgroundPath) {
                  const bgUrl = `${window.location.origin}${backgroundPath}`;
                  console.log("Fetching background from:", bgUrl);

                  const bgRes = await fetch(bgUrl);
                  if (!bgRes.ok) {
                    throw new Error(`Failed to fetch background: ${bgUrl}`);
                  }

                  const bgBlob = await bgRes.blob();
                  console.log("Background blob:", bgBlob);

                  formData.append("background", bgBlob, "background.svg");
                }
              }

              // Call backend FFmpeg server with axios
              const serverRes = await axios.post(
                `${process.env.NEXT_PUBLIC_VIDEO_PROCESSING_BACKEND_URL}/process-video`,
                formData,
                {
                  headers: { "Content-Type": "multipart/form-data" },
                }
              );

              const { url } = serverRes.data; // backend returns { url }

              // Fetch processed video (mp4) from backend
              const processedRes = await axios.get(
                `http://localhost:4000${url}`,
                {
                  responseType: "blob", // important
                }
              );
              const processedBlob = processedRes.data;

              // Upload processed video to Cloudinary with axios
              const cloudFormData = new FormData();
              cloudFormData.append("file", processedBlob, "final.mp4");
              cloudFormData.append("upload_preset", "upload_preset_1");

              const cloudRes = await axios.post(
                "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
                cloudFormData,
                {
                  headers: { "Content-Type": "multipart/form-data" },
                }
              );

              const cloudData = cloudRes.data;

              console.log("backend url is ", cloudData.secure_url);
              toast.dismiss();
              toast.success("Video exported with background!");

              // Navigate to preview page
              router.push(
                `/preview?video=${encodeURIComponent(
                  cloudData.secure_url
                )}&title=${encodeURIComponent(
                  sidebarTitle
                )}&description=${encodeURIComponent(sidebarDescription || "")}`
              );
            } catch (err) {
              console.error(err);
              toast.dismiss();
              toast.error("Export failed");
            }
          }}
          tool={tool}
          setTool={(t: string) =>
            setTool(t as "none" | "blur" | "rect" | "arrow" | "text")
          }
          handleUndo={handleUndo}
          handleClear={handleClear}
          handleSaveOverlays={handleSaveOverlays}
          handleLoadOverlays={handleLoadOverlays}
          thumbnailUrl={thumbnailUrl || undefined}
          selectedBackground={selectedBackground}
          setSelectedBackground={setSelectedBackground}
          backgroundType={backgroundType}
          setBackgroundType={setBackgroundType}
          customBackground={customBackground}
          setCustomBackground={setCustomBackground}
        />
        {isSidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black bg-opacity-40"
              onClick={() => setIsSidebarOpen(false)}
            />
            {/* Sidebar Drawer */}
            <div className="relative w-4/5 max-w-xs h-full bg-white shadow-lg z-50 animate-slide-in-left">
              <button
                className="absolute top-4 right-4 text-[#7C5CFC]"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <X size={28} />
              </button>
              <EditorSidebar
                title={sidebarTitle}
                setTitle={setSidebarTitle}
                description={sidebarDescription}
                setDescription={setSidebarDescription}
                onDownloadWebM={() => {
                  const filename = sanitizeFilename(sidebarTitle) || "clip";
                  if (videoUrl) {
                    const a = document.createElement("a");
                    a.href = videoUrl;
                    a.download = `${filename}.webm`;
                    a.click();
                  }
                }}
                onDownloadMP4={() => {
                  const filename = sanitizeFilename(sidebarTitle) || "clip";
                  if (mp4Url) {
                    downloadBlob(mp4Url, `${filename}.mp4`);
                  }
                }}
                onExportWebM={async () => {
                  if (!videoUrl) {
                    toast.error("No video available to export");
                    return;
                  }

                  try {
                    console.log("sending from here #linex 1228");
                    toast.loading("Processing video...");
                    console.log(selectedBackground);

                    // Fetch blob from ReactPlayer video
                    const res = await fetch(videoUrl);
                    const videoBlob = await res.blob();

                    const formData = new FormData();
                    formData.append("video", videoBlob, "video.webm");

                    // Handle background
                    if (selectedBackground) {
                      const backgroundPath = imageMap[selectedBackground];
                      console.log(backgroundPath);
                      if (backgroundPath) {
                        const bgUrl = `${window.location.origin}${backgroundPath}`;
                        console.log("Fetching background from:", bgUrl);

                        const bgRes = await fetch(bgUrl);
                        if (!bgRes.ok) {
                          throw new Error(
                            `Failed to fetch background: ${bgUrl}`
                          );
                        }

                        const bgBlob = await bgRes.blob();
                        console.log("Background blob:", bgBlob);

                        formData.append("background", bgBlob, "background.svg");
                      }
                    }

                    // Call backend FFmpeg server with axios
                    const serverRes = await axios.post(
                      "http://localhost:4000/process-video",
                      formData,
                      {
                        headers: { "Content-Type": "multipart/form-data" },
                      }
                    );

                    const { url } = serverRes.data; // backend returns { url }

                    // Fetch processed video (mp4) from backend
                    const processedRes = await axios.get(
                      `http://localhost:4000${url}`,
                      {
                        responseType: "blob", // important
                      }
                    );
                    const processedBlob = processedRes.data;

                    // Upload processed video to Cloudinary with axios
                    const cloudFormData = new FormData();
                    cloudFormData.append("file", processedBlob, "final.mp4");
                    cloudFormData.append("upload_preset", "upload_preset_1");

                    const cloudRes = await axios.post(
                      "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
                      cloudFormData,
                      {
                        headers: { "Content-Type": "multipart/form-data" },
                      }
                    );

                    const cloudData = cloudRes.data;

                    console.log("backend url is ", cloudData.secure_url);
                    toast.dismiss();
                    toast.success("Video exported with background!");

                    // Navigate to preview page
                    router.push(
                      `/preview?video=${encodeURIComponent(
                        cloudData.secure_url
                      )}&title=${encodeURIComponent(
                        sidebarTitle
                      )}&description=${encodeURIComponent(sidebarDescription || "")}`
                    );
                  } catch (err) {
                    console.error(err);
                    toast.dismiss();
                    toast.error("Export failed");
                  }
                }}
                tool={tool}
                setTool={(t: string) =>
                  setTool(t as "none" | "blur" | "rect" | "arrow" | "text")
                }
                handleUndo={handleUndo}
                handleClear={handleClear}
                handleSaveOverlays={handleSaveOverlays}
                handleLoadOverlays={handleLoadOverlays}
                forceShowMobile={true}
                thumbnailUrl={thumbnailUrl || undefined}
                selectedBackground={selectedBackground}
                setSelectedBackground={setSelectedBackground}
                backgroundType={backgroundType}
                setBackgroundType={setBackgroundType}
                customBackground={customBackground}
                setCustomBackground={setCustomBackground}
              />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
          {/* Restore action buttons row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-4 mb-6 sm:mb-6">
            {/* 
  <button
    onClick={() => router.push("/recorder")}
    className="flex items-center gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow-sm hover:bg-[#5B43C6] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit"
  >
    <span className="text-xl"></span> Back to Recorder
  </button>
  */}
            <div className="flex gap-2 sm:gap-4 mt-2 sm:mt-0 ml-auto">
              <button
                className="flex items-center gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit whitespace-nowrap"
                onClick={() => {
                  setShowSaveDemoModal(true);
                }}
              >
                <span className="text-xl"></span> Save Demo
              </button>
            </div>
          </div>

          {/* Title and Description Display */}
          {(sidebarTitle || sidebarDescription) && (
            <div className="bg-white rounded-lg p-4 mb-6 shadow-sm border border-gray-200">
              {sidebarTitle && (
                <div className="mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Title:{" "}
                  </span>
                  <span className="text-xl font-semibold text-gray-800">
                    {sidebarTitle}
                  </span>
                </div>
              )}
              {sidebarDescription && (
                <div>
                  <span className="text-sm font-medium text-gray-500">
                    Description:{" "}
                  </span>
                  <span className="text-gray-600 text-sm">
                    {sidebarDescription}
                  </span>
                </div>
              )}
            </div>
          )}
          <span className="flex items-center gap-2 px-4 sm:px-6 h-10 sm:h-12 lg:text-2xl text-[#7C5CFC] font-semibold text-base select-none cursor-default mb-4 w-max">
            <span className="text-xl"></span> Preview
          </span>

          {/* WRAPPER */}
          <div
            className={`flex flex-col items-center w-full max-w-[900px] mx-auto rounded-2xl shadow-lg bg-white`}
            style={{ boxShadow: "0 8px 24px rgba(124, 92, 252, 0.3)" }}
          >
            {/* Video container */}
            <div
              ref={videoContainerRef}
              className={`relative w-full h-[260px] sm:h-auto sm:aspect-video rounded-2xl border ${
                isFullscreen ? "border-[#7C5CFC] shadow-lg" : "border-[#E6E1FA]"
              } flex items-center justify-center transition-all duration-300 mb-4`}
              style={{
                minHeight: "160px",
                padding: selectedBackground ? "20px" : "0px",
                boxShadow: "0 4px 24px 0 #E6E1FA",
                ...getBackgroundStyle(),
              }}
            >
              <div
                style={{
                  width: selectedBackground ? "90%" : "100%",
                  height: selectedBackground ? "80%" : "100%",
                  position: "relative",
                  zIndex: 1,
                  borderRadius: "1.25rem",
                  overflow: "hidden",
                  background: "#F6F3FF",
                  transition: "width 0.3s ease, height 0.3s ease",
                }}
              >
                <ReactPlayer
                  ref={playerRef}
                  url={videoUrl || undefined}
                  playing={playing}
                  controls={false}
                  muted={false}
                  volume={volume}
                  width="100%"
                  height="100%"
                  style={{
                    objectFit: "contain",
                    borderRadius: "1.25rem",
                    background: "#F6F3FF",
                  }}
                  onError={(e) => console.error("Video failed to load", e)}
                  onProgress={({ playedSeconds }) =>
                    setCurrentTime(playedSeconds)
                  }
                />
              </div>

              {/* Canvas stays on top of video */}
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full z-10 cursor-crosshair rounded-2xl"
                onMouseDown={tool !== "none" ? handleMouseDown : undefined}
                onMouseUp={tool !== "none" ? handleMouseUp : undefined}
                style={{
                  pointerEvents: tool !== "none" ? "auto" : "none",
                  borderRadius: "1.25rem",
                }}
              />
            </div>

            {/* Controls container */}
            <div className="w-full flex flex-col gap-3">
              <CustomVideoControls
                playerRef={playerRef}
                duration={duration}
                currentTime={currentTime}
                setCurrentTime={(t) => {
                  setCurrentTime(t);
                  playerRef.current?.seekTo(t, "seconds");
                }}
                recordingDuration={recordingDuration}
                setPlaying={setPlaying}
                playing={playing}
              />

              <div className="flex items-center justify-between px-2">
                {/* Skip buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newTime = Math.max(0, currentTime - 5);
                      setCurrentTime(newTime);
                      playerRef.current?.seekTo(newTime, "seconds");
                    }}
                    className="rounded-full bg-[#7C5CFC] text-white hover:bg-[#6356D7] p-1.5 transition shadow-sm"
                    title="Back 5 seconds"
                  >
                    <Image
                      src="/icons/replay.svg"
                      alt="Replay"
                      width={16}
                      height={16}
                    />
                  </button>
                  <button
                    onClick={() => {
                      const newTime = Math.min(
                        displayDuration,
                        currentTime + 5
                      );
                      setCurrentTime(newTime);
                      playerRef.current?.seekTo(newTime, "seconds");
                    }}
                    className="rounded-full bg-[#7C5CFC] text-white hover:bg-[#6356D7] p-1.5 transition shadow-sm"
                    title="Forward 5 seconds"
                  >
                    <Image
                      src="/icons/forward.svg"
                      alt="Forward"
                      width={16}
                      height={16}
                    />
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-2 flex-1 justify-center">
                  <button
                    onClick={() => setVolume(volume === 0 ? 1 : 0)}
                    className="focus:outline-none"
                    title={volume === 0 ? "Unmute" : "Mute"}
                  >
                    {volume === 0 ? (
                      <FaVolumeMute className="text-[#7C5CFC] text-2xl" />
                    ) : (
                      <FaVolumeUp className="text-[#7C5CFC] text-2xl" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="accent-[#7C5CFC] w-40 h-2 rounded-lg"
                  />
                  <span className="text-xs text-[#7C5CFC] font-mono min-w-[40px]">
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* Fullscreen */}
                <div
                  className="flex items-center justify-end"
                  style={{ minWidth: 40 }}
                >
                  <button
                    className="text-[#A594F9] hover:text-[#7C5CFC] p-2"
                    title="Fullscreen"
                    onClick={handleFullscreen}
                  >
                    <FaExpand size={22} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {tool === "text" && (
            <div className="flex gap-3 items-center mb-6 sm:mb-0">
              <label className="text-sm">Text Color:</label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="border rounded"
              />
              <label className="text-sm ml-4">Font:</label>
              <select
                value={textFont}
                onChange={(e) => setTextFont(e.target.value)}
                className="border p-1 rounded"
              >
                <option value="16px sans-serif">Default</option>
                <option value="20px serif">Serif</option>
                <option value="20px monospace">Monospace</option>
                <option value="18px Arial">Arial</option>
                <option value="18px Georgia">Georgia</option>
              </select>
            </div>
          )}
          <div className="mt-8 mb-16 mr-2 sm:mr-0">
            {duration > 0 ? (
              <TimelineRuler
                minValue={0}
                maxValue={duration}
                currentValue={Math.max(0, currentTime)}
                onValueChange={(value) => {
                  const clampedValue = Math.max(0, Math.min(duration, value));
                  setCurrentTime(clampedValue);
                  playerRef.current?.seekTo(clampedValue, "seconds");
                }}
                step={0.1}
                majorStep={20}
                minorStep={5}
                microStep={1}
                startTime={timelineStartTime}
                endTime={timelineEndTime}
                onStartTimeChange={(value) => {
                  setTimelineStartTime(value);
                  handleTimelineChange(value, timelineEndTime);
                }}
                onEndTimeChange={(value) => {
                  setTimelineEndTime(value);
                  handleTimelineChange(timelineStartTime, value);
                }}
                // onTrim={async (segments) => {
                //   toast.loading("Trimming and merging segments...");
                //   await trimApplier(
                //     segments,
                //     undefined,
                //     (success: boolean) => {
                //       toast.dismiss();
                //       if (success) {
                //         toast.success("Video trimmed and merged successfully!");
                //         setCurrentSegments(segments);
                //       } else {
                //         toast.error("Failed to trim/merge video.");
                //       }
                //     },
                //     undefined,
                //     zoomEffects
                //   );
                // }}
                onTrim={videoTrimHandler}
                processing={processing}
                onResetVideo={resetVideo}
                onZoomEffectCreate={onZoomEffectCreate}
                initialSegments={currentSegments}
              />
            ) : (
              <div className="w-full max-w-6xl mx-auto p-8">
                <div className="relative h-32 bg-white border-2 border-[#A594F9] rounded-lg mt-12 flex items-center justify-center">
                  <span className="text-[#A594F9] font-medium">
                    Loading timeline...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ZoomEffectsPopup
        isOpen={isZoomPopupOpen}
        onClose={() => setIsZoomPopupOpen(false)}
        zoomEffects={zoomEffects}
        onZoomEffectsChange={onZoomEffectsChange}
        currentTime={currentTime}
        duration={duration}
        onSeek={(time) => {
          // Force immediate video frame update
          if (playerRef.current) {
            const player = playerRef.current.getInternalPlayer();
            if (player) {
              // Set time directly and force a frame update
              player.currentTime = time;
              // Force the video to update by triggering a seek event
              player.dispatchEvent(new Event("seeking"));
              playerRef.current.seekTo(time, "seconds");
            }
          }
        }}
      />

      {/* Save Demo Modal */}
      <SaveDemoModal
        isOpen={showSaveDemoModal}
        onClose={() => setShowSaveDemoModal(false)}
        onSave={handleSaveDemo}
        initialTitle={sidebarTitle}
        initialDescription={sidebarDescription}
        processing={savingDemo}
      />
    </main>
  );
}
// Custom video controls component
function CustomVideoControls({
  playerRef,
  duration,
  currentTime,
  setCurrentTime,
  recordingDuration,
  setPlaying,
  playing,
}: {
  playerRef: React.RefObject<ReactPlayer>;
  duration: number;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  recordingDuration: number;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playing: boolean;
}) {
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
        {/* ✅ Controlled Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className="rounded-full bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#7C5CFC] hover:text-white p-2 transition"
        >
          {playing ? (
            <Image
              src="/icons/pause.png"
              alt="Notifications"
              width={24}
              height={24}
              className="w-6 h-6"
            />
          ) : (
            <Image
              src="/icons/play.png"
              alt="Notifications"
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
