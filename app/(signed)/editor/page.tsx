"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useEditor } from "@/app/hooks/useEditor";
import EditorSidebar from "@/app/components/EditorSidebar";
import EditorTopbar from "@/app/components/EditorTopbar";
import Image from "next/image";
import { useSession } from "next-auth/react";
import TimelineRuler from "@/app/components/TimeLine";
import { FaExpand, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { X } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import ReactPlayer from "react-player";
import { useRouter } from "next/navigation";
import { sanitizeFilename } from "@/app/lib/constants";
import ZoomEffectsPopup from "@/app/components/ZoomEffectsPopup";
import SaveDemoModal from "@/app/components/SaveDemoModal";
import { formatTime } from "@/app/lib/dateTimeUtils";
import { useBlobStore } from "@/app/store/blobStore";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { ZoomEffect } from "@/app/interfaces/editor/IZoomEffect";

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

export default function EditorPage() {
  const router = useRouter();
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSegments, setCurrentSegments] = useState<
    { start: string; end: string }[]
  >([{ start: "00:00:00", end: "00:00:00" }]);
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
  const [sidebarTitle, setSidebarTitle] = useState("");
  const [sidebarDescription, setSidebarDescription] = useState("");
  const [showSaveDemoModal, setShowSaveDemoModal] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [isZoomPopupOpen, setIsZoomPopupOpen] = useState(false);
  const [currentZoomEffect, setCurrentZoomEffect] = useState<ZoomEffect | null>(
    null
  );
  const [inputStartTime, setInputStartTime] = useState("00:00:00");
  const [inputEndTime, setInputEndTime] = useState("00:00:00");
  const [timelineStartTime, setTimelineStartTime] = useState(0);
  const [timelineEndTime, setTimelineEndTime] = useState(0);
  const {
    videoUrl: recordedVideoUrl,
    mp4Url,
    thumbnailUrl,
    processing,
    trimApplier,
    resetVideo,
    downloadBlob,
  } = useEditor();
  const blob = useBlobStore((state) => state.blob);
  const { recordingDuration } = useScreenRecorder();
  const playerRef = useRef<ReactPlayer>(null!);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const formatTimeForInput = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, []);

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
          setCurrentSegments(convertedSegments);
        } catch (error) {
          console.error("Error parsing segments from URL:", error);
        }
      }

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
  }, [params]);

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

  const displayDuration = recordingDuration > 0 ? recordingDuration : duration;

  useEffect(() => {
    if (duration > 0 && timelineEndTime === 0) {
      const initialEndTime = duration;
      setTimelineStartTime(0);
      setTimelineEndTime(initialEndTime);
      setInputStartTime(formatTimeForInput(0));
      setInputEndTime(formatTimeForInput(initialEndTime));
      console.log("Initialized timeline pointers:", {
        start: 0,
        end: initialEndTime,
      });
    }
  }, [duration, timelineEndTime]);

  const handleTimelineChange = useCallback((start: number, end: number) => {
    setInputStartTime(formatTimeForInput(start));
    setInputEndTime(formatTimeForInput(end));
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    console.log("Fullscreen button clicked", { el });
    if (!el) {
      alert("Video container not found.");
      return;
    }
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

    if (recordedVideoUrl && !params.get("video")) {
      setVideoUrl(recordedVideoUrl);
    }
  }, [recordedVideoUrl, params]);

  useEffect(() => {
    if (recordingDuration > 0 && videoUrl) {
      setDuration(recordingDuration);
    }
  }, [recordingDuration, videoUrl]);

  useEffect(() => {
    if (duration > 0 || recordingDuration > 0) return;

    const tryGetDuration = async () => {
      // Try ReactPlayer duration
      if (playerRef.current) {
        const player = playerRef.current.getInternalPlayer();
        if (
          player?.duration &&
          isFinite(player.duration) &&
          player.duration > 0
        ) {
          setDuration(Math.floor(player.duration));
          return;
        }
      }
      // Try blob
      if (blob) {
        const tempVideo = document.createElement("video");
        tempVideo.src = URL.createObjectURL(blob);
        tempVideo.preload = "metadata";
        await new Promise<void>((resolve) => {
          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(Math.floor(tempVideo.duration));
            }
            URL.revokeObjectURL(tempVideo.src);
            resolve();
          };
          tempVideo.onerror = () => {
            URL.revokeObjectURL(tempVideo.src);
            resolve();
          };
          tempVideo.load();
        });
        if (duration > 0) return;
      }
      // Try video URL
      if (videoUrl) {
        const tempVideo = document.createElement("video");
        tempVideo.src = videoUrl;
        tempVideo.preload = "metadata";
        await new Promise<void>((resolve) => {
          tempVideo.onloadedmetadata = () => {
            if (
              tempVideo.duration &&
              isFinite(tempVideo.duration) &&
              tempVideo.duration > 0
            ) {
              setDuration(Math.floor(tempVideo.duration));
            }
            resolve();
          };
          tempVideo.onerror = () => resolve();
          tempVideo.load();
        });
      }
    };

    tryGetDuration();
  }, [videoUrl, blob, recordingDuration, duration]);

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

  const handleMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement, MouseEvent>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawing(true);
  };

  const handleMouseUp = (
    e: React.MouseEvent<HTMLCanvasElement, MouseEvent>
  ) => {
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

      let cloudinaryVideoUrl = videoUrl;
      if (videoUrl.startsWith("blob:")) {
        try {
          const response = await fetch(videoUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch video blob");
          }
          const videoBlob = await response.blob();

          const cloudFormData = new FormData();
          cloudFormData.append("file", videoBlob, "video.webm");
          cloudFormData.append("upload_preset", "upload_preset_1");

          console.log("Uploading to Cloudinary...");

          const cloudRes = await fetch(
            "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
            {
              method: "POST",
              body: cloudFormData,
            }
          );

          if (!cloudRes.ok) {
            const cloudError = await cloudRes.text();
            throw new Error(
              `Cloudinary upload failed: ${cloudRes.status} - ${cloudError}`
            );
          }

          const cloudData = await cloudRes.json();
          console.log("Cloudinary response:", cloudData);

          if (!cloudData.secure_url) {
            throw new Error(
              "Cloudinary upload failed - no secure_url returned"
            );
          }

          cloudinaryVideoUrl = cloudData.secure_url;
          console.log("Cloudinary URL:", cloudinaryVideoUrl);
        } catch (cloudError) {
          console.error("Error uploading to Cloudinary:", cloudError);
          toast.dismiss();
          toast.error("Failed to upload video to Cloudinary");
          return;
        }
      }

      const segmentsToSave =
        currentSegments.length > 0
          ? currentSegments
          : [
              {
                start: startTime,
                end: endTime,
              },
            ];

      const editingToSave = {
        segments: segmentsToSave,
        zoom: zoomEffects,
      };

      const response = await fetch("/api/demo", {
        method: "POST",
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          videoUrl: cloudinaryVideoUrl,
          startTime,
          endTime,
          editing: editingToSave,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to save demo");
      }

      const responseData = await response.json();

      setSidebarTitle(data.title);
      setSidebarDescription(data.description);

      toast.dismiss();
      toast.success("Demo saved successfully!");
      console.log("Demo saved:", responseData);

      setShowSaveDemoModal(false);
    } catch (error) {
      console.error("Error saving demo:", error);
      toast.dismiss();
      toast.error("Failed to save demo");
    } finally {
      setSavingDemo(false);
    }
  };

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

  const onZoomEffectsChange = (effects: ZoomEffect[]) => {
    setZoomEffects(effects);
  };

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

            if (!sidebarTitle?.trim()) {
              toast.error("Please enter a title for the video");
              return;
            }

            try {
              toast.loading("Exporting video to Cloudinary...");

              let cloudinaryVideoUrl = videoUrl;
              if (videoUrl.startsWith("blob:")) {
                try {
                  const response = await fetch(videoUrl);
                  if (!response.ok) {
                    throw new Error("Failed to fetch video blob");
                  }
                  const videoBlob = await response.blob();

                  const cloudFormData = new FormData();
                  cloudFormData.append("file", videoBlob, "video.webm");
                  cloudFormData.append("upload_preset", "upload_preset_1");

                  console.log("Uploading to Cloudinary...");

                  const cloudRes = await fetch(
                    "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
                    {
                      method: "POST",
                      body: cloudFormData,
                    }
                  );

                  if (!cloudRes.ok) {
                    const cloudError = await cloudRes.text();
                    throw new Error(
                      `Cloudinary upload failed: ${cloudRes.status} - ${cloudError}`
                    );
                  }

                  const cloudData = await cloudRes.json();
                  console.log("Cloudinary response:", cloudData);

                  if (!cloudData.secure_url) {
                    throw new Error(
                      "Cloudinary upload failed - no secure_url returned"
                    );
                  }

                  cloudinaryVideoUrl = cloudData.secure_url;
                  console.log("Cloudinary URL:", cloudinaryVideoUrl);
                } catch (cloudError) {
                  console.error("Error uploading to Cloudinary:", cloudError);
                  toast.dismiss();
                  toast.error("Failed to upload video to Cloudinary");
                  return;
                }
              }

              const previewUrl = `/preview?video=${encodeURIComponent(cloudinaryVideoUrl)}&title=${encodeURIComponent(sidebarTitle)}&description=${encodeURIComponent(sidebarDescription || "")}`;

              toast.dismiss();
              toast.success("Video exported successfully!");
              router.push(previewUrl);
            } catch (error) {
              console.error("Export error:", error);
              toast.dismiss();
              toast.error("Failed to export video");
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

                  if (!sidebarTitle?.trim()) {
                    toast.error("Please enter a title for the video");
                    return;
                  }

                  try {
                    toast.loading("Exporting video to Cloudinary...");

                    let cloudinaryVideoUrl = videoUrl;
                    if (videoUrl.startsWith("blob:")) {
                      try {
                        const response = await fetch(videoUrl);
                        if (!response.ok) {
                          throw new Error("Failed to fetch video blob");
                        }
                        const videoBlob = await response.blob();

                        const cloudFormData = new FormData();
                        cloudFormData.append("file", videoBlob, "video.webm");
                        cloudFormData.append(
                          "upload_preset",
                          "upload_preset_1"
                        );

                        console.log("Uploading to Cloudinary...");

                        const cloudRes = await fetch(
                          "https://api.cloudinary.com/v1_1/dh2skqoub/video/upload",
                          {
                            method: "POST",
                            body: cloudFormData,
                          }
                        );

                        if (!cloudRes.ok) {
                          const cloudError = await cloudRes.text();
                          throw new Error(
                            `Cloudinary upload failed: ${cloudRes.status} - ${cloudError}`
                          );
                        }

                        const cloudData = await cloudRes.json();
                        console.log("Cloudinary response:", cloudData);

                        if (!cloudData.secure_url) {
                          throw new Error(
                            "Cloudinary upload failed - no secure_url returned"
                          );
                        }

                        cloudinaryVideoUrl = cloudData.secure_url;
                        console.log("Cloudinary URL:", cloudinaryVideoUrl);
                      } catch (cloudError) {
                        console.error(
                          "Error uploading to Cloudinary:",
                          cloudError
                        );
                        toast.dismiss();
                        toast.error("Failed to upload video to Cloudinary");
                        return;
                      }
                    }

                    const previewUrl = `/preview?video=${encodeURIComponent(cloudinaryVideoUrl)}&title=${encodeURIComponent(sidebarTitle)}&description=${encodeURIComponent(sidebarDescription || "")}`;

                    toast.dismiss();
                    toast.success("Video exported successfully!");
                    router.push(previewUrl);
                  } catch (error) {
                    console.error("Export error:", error);
                    toast.dismiss();
                    toast.error("Failed to export video");
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 sm:gap-4 mb-6 sm:mb-6">
            <div className="flex justify-end gap-2 sm:gap-4 mt-2 sm:mt-0">
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
          <div
            ref={videoContainerRef}
            className={`relative ml-2 w-full max-w-[400px] h-[260px] sm:ml-32 sm:w-full sm:max-w-[900px] sm:h-auto sm:aspect-video bg-white rounded-2xl shadow-md border ${isFullscreen ? "border-[#7C5CFC] shadow-lg" : "border-[#E6E1FA]"} flex flex-col items-center justify-center transition-all duration-300 mb-6 sm:mb-0`}
            style={{
              minHeight: "160px",
              padding: 0,
              boxShadow: "0 4px 24px 0 #E6E1FA",
            }}
          >
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
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  transform: currentZoomEffect
                    ? `scale(${currentZoomEffect.zoomLevel}) translate(${(currentZoomEffect.x - 0.5) * 100}%, ${(currentZoomEffect.y - 0.5) * 100}%)`
                    : "scale(1) translate(0%, 0%)",
                  transformOrigin: "center center",
                  transition: currentZoomEffect
                    ? "transform 0.5s ease-in-out"
                    : "transform 0.3s ease-out",
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
                  onDuration={(dur) => {
                    if (
                      recordingDuration === 0 &&
                      isFinite(dur) &&
                      !isNaN(dur)
                    ) {
                      setDuration(dur);
                    }
                  }}
                  onReady={() => {
                    console.log("Video loaded");
                    if (recordingDuration === 0) {
                      setTimeout(() => {
                        if (playerRef.current) {
                          const player = playerRef.current.getInternalPlayer();
                          if (
                            player &&
                            player.duration &&
                            isFinite(player.duration) &&
                            player.duration > 0
                          ) {
                            setDuration(Math.floor(player.duration));
                          }
                        }
                      }, 10);
                      setTimeout(() => {
                        if (playerRef.current) {
                          const player = playerRef.current.getInternalPlayer();
                          if (
                            player &&
                            player.duration &&
                            isFinite(player.duration) &&
                            player.duration > 0
                          ) {
                            setDuration(Math.floor(player.duration));
                          }
                        }
                      }, 100);
                    }
                  }}
                  onPlay={() => {
                    setPlaying(true);
                  }}
                  onPause={() => {
                    setPlaying(false);
                  }}
                  progressInterval={100}
                  onProgress={({ playedSeconds }) =>
                    setCurrentTime(playedSeconds)
                  }
                  config={{
                    file: {
                      attributes: {
                        preload: "metadata",
                      },
                    },
                  }}
                />
              </div>
            </div>
            <CustomVideoControls
              playerRef={playerRef}
              duration={duration}
              currentTime={currentTime}
              setCurrentTime={(t: number) => {
                setCurrentTime(t);
                playerRef.current?.seekTo(t, "seconds");
              }}
              recordingDuration={recordingDuration}
              setPlaying={setPlaying}
              playing={playing}
            />
            <div className="flex items-center justify-between mt-2 px-2 w-full">
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
                    alt="Notifications"
                    width={16}
                    height={16}
                    className="w-4 h-4"
                  />
                </button>
                <button
                  onClick={() => {
                    const newTime = Math.min(displayDuration, currentTime + 5);
                    setCurrentTime(newTime);
                    playerRef.current?.seekTo(newTime, "seconds");
                  }}
                  className="rounded-full bg-[#7C5CFC] text-white hover:bg-[#6356D7] p-1.5 transition shadow-sm"
                  title="Forward 5 seconds"
                >
                  <Image
                    src="/icons/forward.svg"
                    alt="Notifications"
                    width={16}
                    height={16}
                    className="w-4 h-4"
                  />
                </button>
              </div>
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
                onTrim={async (segments) => {
                  toast.loading("Trimming and merging segments...");
                  await trimApplier(
                    segments,
                    undefined,
                    (success: boolean) => {
                      toast.dismiss();
                      if (success) {
                        toast.success("Video trimmed and merged successfully!");
                        setCurrentSegments(segments);
                      } else {
                        toast.error("Failed to trim/merge video.");
                      }
                    },
                    undefined,
                    zoomEffects
                  );
                }}
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
          if (playerRef.current) {
            playerRef.current.seekTo(time);
          }
        }}
      />
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

  useEffect(() => {
    setPlaying(playing);
  }, [playing, setPlaying]);

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
    setDragValue(Number(e.target.value));
  };
  const handleSeekEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    const value = Number((e.target as HTMLInputElement).value);
    setCurrentTime(value);
    playerRef.current?.seekTo(value, "seconds");
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
