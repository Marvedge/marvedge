"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { FaBars } from "react-icons/fa6";
//import { FaExpand, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { X } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ReactPlayer from "react-player";
import axios from "axios";
//import { videoTrimmer } from "@/app/lib/ffmpeg"; // Moved to export handler
//import Image from "next/image";

// Components
import SidemenuDashboard from "@/app/components/SidemenuDashboard";
import EditorSidebar from "@/app/components/EditorSidebar";
import EditorTopbar from "@/app/components/EditorTopbar";
import TimelineRuler from "@/app/components/TimeLine";
import ZoomEffectsPopup from "@/app/components/ZoomEffectsPopup";
import SaveDemoModal from "@/app/components/SaveDemoModal";
import CustomVideoControls from "@/app/components/CustomVideoControls";
// import CustomVideoControls from "./components/CustomVideoControls";

// Hooks
import { useEditor } from "@/app/hooks/useEditor";
import { useBlobStore } from "@/app/store/blobStore";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useEditorState } from "./hooks/useEditorState";
import { useURLParams, useFormatTime } from "./hooks/useURLParams";
import { useVideoDuration } from "./hooks/useVideoDuration";
import { useFullscreen } from "./hooks/useFullscreen";
import { useOverlays } from "./hooks/useOverlays";
import { useBackgroundStyle } from "./hooks/useBackgroundStyle";
import { useTimelineInit } from "./hooks/useTimelineInit";

// Utils
import { sanitizeFilename } from "@/app/lib/constants";
import { handleSaveDemo, exportVideo } from "./utils/videoHandlers";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import ZoomModal from "@/app/components/ZoomModal";
import ExportSettingsModal, { ExportSettings } from "@/app/components/ExportSettingsModal";
import ExportResultModal from "@/app/components/ExportResultModal";

export default function EditorPage() {
  const router = useRouter();

  // Track saved demos in this session to prevent duplicates
  const savedDemosRef = useRef<Set<string>>(new Set());
  const defaultZoomSeededForVideoRef = useRef<string | null>(null);
  const zoomFocusStageRef = useRef<HTMLDivElement | null>(null);

  // Custom hooks for state management
  const editorState = useEditorState();
  const {
    params,
    setParams,
    videoUrl,
    setVideoUrl,
    playing,
    setPlaying,
    timelineStartTime,
    setTimelineStartTime,
    timelineEndTime,
    setTimelineEndTime,
    currentSegments,
    setCurrentSegments,
    tool,
    setTool,
    textColor,
    setTextColor,
    textFont,
    setTextFont,
    sidebarTitle,
    setSidebarTitle,
    sidebarDescription,
    setSidebarDescription,
    showSaveDemoModal,
    setShowSaveDemoModal,
    savingDemo,
    setSavingDemo,
    demoSaved,
    setDemoSaved,
    setSavedDemoId,
    isSidebarOpen,
    setIsSidebarOpen,
    isDashboardMenuOpen,
    setIsDashboardMenuOpen,
    isFullscreen,
    setIsFullscreen,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    volume,
    setVolume,
    zoomEffects,
    setZoomEffects,
    isZoomPopupOpen,
    setIsZoomPopupOpen,
    inputStartTime,
    setInputStartTime,
    inputEndTime,
    setInputEndTime,
    selectedBackground,
    setSelectedBackground,
    backgroundType,
    setBackgroundType,
    customBackground,
    setCustomBackground,
    playerRef,
    canvasRef,
    videoContainerRef,
    setLoadedSegments,
    aspectRatio,
    setAspectRatio,
    browserFrameMode,
    setBrowserFrameMode,
    browserFrameDrawShadow,
    setBrowserFrameDrawShadow,
    browserFrameDrawBorder,
    setBrowserFrameDrawBorder,
  } = editorState;

  // External hooks
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
  const { data: session } = useSession();

  // Format time helper
  const { formatTimeForInput } = useFormatTime();

  // Initialize params
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search));
  }, [setParams]);

  // URL params handling
  useURLParams({
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
    setSavedDemoId,
    setAspectRatio,
    setBrowserFrameMode,
    setBrowserFrameDrawShadow,
    setBrowserFrameDrawBorder,
    formatTimeForInput,
  });

  // Bridge recorder → editor: if no video URL from URL params, use blob from Zustand
  useEffect(() => {
    if (!videoUrl && blob) {
      setVideoUrl(URL.createObjectURL(blob));
    }
  }, [videoUrl, blob, setVideoUrl]);

  // Video duration detection
  useVideoDuration({
    videoUrl,
    duration,
    recordingDuration,
    blob,
    playerRef,
    setDuration,
  });

  // Fullscreen handling
  const { handleFullscreen } = useFullscreen({
    videoContainerRef,
    setIsFullscreen,
  });

  // Overlays handling
  const {
    handleMouseDown,
    handleMouseUp,
    handleUndo,
    handleClear,
    handleSaveOverlays,
    handleLoadOverlays,
  } = useOverlays({
    canvasRef,
    playerRef,
    tool,
    textColor,
    textFont,
  });

  // Background style
  const { getBackgroundStyle, imageMap } = useBackgroundStyle({
    selectedBackground,
    customBackground,
  });

  // Timeline initialization
  useTimelineInit({
    duration,
    timelineEndTime,
    setTimelineStartTime,
    setInputStartTime,
    setTimelineEndTime,
    setInputEndTime,
    formatTimeForInput,
  });

  // Set recorded video URL if no URL parameter is provided
  useEffect(() => {
    if (!params) {
      return;
    }
    if (recordedVideoUrl && !params.get("video")) {
      setVideoUrl(recordedVideoUrl);
    }
  }, [recordedVideoUrl, params, setVideoUrl]);

  // Reset demoSaved state when video changes (allows saving again with different video)
  useEffect(() => {
    if (videoUrl) {
      setDemoSaved(false);
    }
  }, [videoUrl, setDemoSaved]);

  // Restore editing state (trim/zoom blocks) from saved demo URL params
  useEffect(() => {
    // Restore trim segments from saved editing data
    if (currentSegments.length > 0 && segments.length === 0) {
      const numeric = currentSegments
        .map((s) => ({
          start: typeof s.start === "string" ? parseFloat(s.start) : Number(s.start),
          end: typeof s.end === "string" ? parseFloat(s.end) : Number(s.end),
        }))
        .filter((s) => !isNaN(s.start) && !isNaN(s.end));
      if (numeric.length > 0) {
        setSegments(numeric);
      }
    }
    // Restore zoom segments from saved editing data
    if (zoomEffects.length > 0 && zoomSegments.length === 0) {
      setZoomSegments(zoomEffects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSegments, zoomEffects]);

  // User initials
  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";

  // No-op setProgress to satisfy required callback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setProgress = (_value?: number) => {};

  // Use recording duration if available, otherwise use detected duration
  //const displayDuration = recordingDuration > 0 ? recordingDuration : duration;

  // Timeline change handler
  const handleTimelineChange = useCallback(
    (start: number, end: number) => {
      setInputStartTime(formatTimeForInput(start));
      setInputEndTime(formatTimeForInput(end));
    },
    [formatTimeForInput, setInputStartTime, setInputEndTime]
  );

  function handleResetTimeline() {
    resetVideo();
    setPlaying(false);
    setMode("main");
    setSegments([]);
    setZoomSegments([]);
    setActiveZoomIdx(-1);
    setCurrentTime(0);
    playerRef.current?.seekTo(0, "seconds");
    setTimelineStartTime(0);
    setTimelineEndTime(duration);
    setInputStartTime(formatTimeForInput(0));
    setInputEndTime(formatTimeForInput(duration));
  }

  // Dashboard menu handlers
  const closeDashboardMenu = () => {
    setIsDashboardMenuOpen(false);
  };

  const toggleDashboardMenu = () => {
    setIsDashboardMenuOpen(!isDashboardMenuOpen);
  };

  // Delete handler is now UI-only — handled inside TimeLine.tsx
  // Video trimming happens at export time in videoHandlers.ts

  // Save demo handler
  const onSaveDemo = async (data: { title: string; description: string }) => {
    if (demoSaved) {
      return;
    }

    // Create a unique key for this demo to prevent duplicates in this session
    const demoKey = `${data.title}|${videoUrl}|${data.description}`;

    // Check if this exact demo was already saved in this session
    if (savedDemosRef.current.has(demoKey)) {
      toast.error("This demo has already been saved in this session!");
      return;
    }

    await handleSaveDemo(data, {
      videoUrl: videoUrl!,
      inputStartTime,
      inputEndTime,
      currentSegments: segments.map((s) => ({
        start: String(s.start),
        end: String(s.end),
      })),
      zoomEffects: zoomSegments,
      selectedBackground,
      aspectRatio,
      browserFrame: {
        mode: browserFrameMode,
        drawShadow: browserFrameDrawShadow,
        drawBorder: browserFrameDrawBorder,
      },
      setSavingDemo,
      setSidebarTitle,
      setSidebarDescription,
      setShowSaveDemoModal,
      setDemoSaved,
      setSavedDemoId,
      onSaveSuccess: () => {
        // Track this demo as saved
        savedDemosRef.current.add(demoKey);
      },
    });
  };

  // Video trim handler
  // const onVideoTrim = async (segments: { start: number; end: number }[]) => {
  //   await videoTrimHandler(segments, {
  //     videoUrl: videoUrl!,
  //     setVideoUrl,
  //     setProgress,
  //     duration: 0,
  //   });
  // };

  const [segments, setSegments] = useState<{ start: number; end: number }[]>([]);
  const [nativeAspectRatio, setNativeAspectRatio] = useState("16/9");
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [showExportResultModal, setShowExportResultModal] = useState(false);
  const [resultActionLoading, setResultActionLoading] = useState(false);
  const [pendingExport, setPendingExport] = useState<{
    exportedUrl: string;
    sourceVideoUrl: string;
    downloadAsMp4: (url: string) => Promise<void>;
    uploadedSourceVideo: boolean;
    settings: ExportSettings;
    demoId: string | null;
  } | null>(null);
  const hasCanvasBackground =
    !!selectedBackground &&
    selectedBackground !== "none" &&
    selectedBackground !== "hidden" &&
    selectedBackground !== "transparent";
  const previewObjectFit = "contain";
  const previewFrameAspectRatio =
    aspectRatio === "native" ? nativeAspectRatio : aspectRatio.replace(":", "/");
  const ratioParts = previewFrameAspectRatio.split("/");
  const ratioW = Number(ratioParts[0]);
  const ratioH = Number(ratioParts[1]);
  const previewRatioValue =
    Number.isFinite(ratioW) && Number.isFinite(ratioH) && ratioW > 0 && ratioH > 0
      ? ratioW / ratioH
      : 16 / 9;
  // Temporarily disabled in preview (UI controls remain visible in sidebar).
  const browserFrameEnabled = false;
  const browserFrameTopBarHeight = browserFrameMode === "default" ? 34 : browserFrameMode === "minimal" ? 20 : 0;
  const browserFrameBorder =
    browserFrameEnabled && browserFrameDrawBorder ? "1px solid rgba(124, 92, 252, 0.45)" : "none";
  const browserFrameShadow = browserFrameEnabled && browserFrameDrawShadow
    ? "0 10px 28px rgba(17, 24, 39, 0.28)"
    : "none";
  const isPortraitPreview = previewRatioValue < 1;
  const stageHeight = selectedBackground
    ? isPortraitPreview
      ? isFullscreen
        ? "82%"
        : "92%"
      : isFullscreen
        ? "73%"
        : "84%"
    : "100%";
  const stageMaxWidth = selectedBackground
    ? isPortraitPreview
      ? "95%"
      : "92%"
    : "100%";

  const saveExportedVideoRecord = async (
    exportedUrl: string,
    sourceVideoUrl: string,
    settings: ExportSettings,
    demoId?: string | null
  ) => {
    await axios.post("/api/exported-videos", {
      title: sidebarTitle?.trim() || "Untitled Export",
      description: sidebarDescription?.trim() || "",
      exportedUrl,
      sourceVideoUrl,
      settings,
      demoId: demoId || null,
      upsertByDemo: Boolean(demoId),
    });
  };

  // Called when the user confirms their settings in the new modal
  const onExportVideo = async (settings: ExportSettings) => {
    setShowExportSettings(false);

    // If user uploaded a custom background image, create a temporary object URL for the compositor
    const customBackgroundUrl = customBackground ? URL.createObjectURL(customBackground) : null;

    const result = await exportVideo({
      videoUrl: videoUrl!,
      selectedBackground: selectedBackground || "none",
      customBackgroundUrl,
      imageMap,
      sidebarTitle,
      sidebarDescription,
      segments,
      zoomSegments,
      setProgress,
      aspectRatio,
      browserFrame: {
        mode: browserFrameMode,
        drawShadow: browserFrameDrawShadow,
        drawBorder: browserFrameDrawBorder,
      },
      duration,
      savedDemoId: editorState.savedDemoId,
      settings,
    });

    if (result) {
      setPendingExport({
        ...result,
        settings,
        demoId: editorState.savedDemoId ?? null,
      });
      setShowExportResultModal(true);
    }

    // Clean up the object URL after export
    if (customBackgroundUrl) {
      URL.revokeObjectURL(customBackgroundUrl);
    }
  };

  useEffect(() => {
    if (!videoUrl) {
      setNativeAspectRatio("16/9");
      return;
    }

    const probeVideo = document.createElement("video");
    probeVideo.preload = "metadata";
    probeVideo.src = videoUrl;

    const handleLoaded = () => {
      if (probeVideo.videoWidth > 0 && probeVideo.videoHeight > 0) {
        setNativeAspectRatio(`${probeVideo.videoWidth}/${probeVideo.videoHeight}`);
      }
    };

    probeVideo.addEventListener("loadedmetadata", handleLoaded);
    return () => {
      probeVideo.removeEventListener("loadedmetadata", handleLoaded);
      probeVideo.src = "";
    };
  }, [videoUrl]);

  const handleDownloadMp4Only = async () => {
    if (!pendingExport) {
      return;
    }
    try {
      setResultActionLoading(true);
      await pendingExport.downloadAsMp4(pendingExport.exportedUrl);
      await axios.post("/api/exported-videos/cleanup", {
        exportedUrl: pendingExport.exportedUrl,
        sourceVideoUrl: pendingExport.uploadedSourceVideo ? pendingExport.sourceVideoUrl : null,
        demoId: pendingExport.demoId,
      });
      toast.success("Downloaded MP4 without saving share link");
      setShowExportResultModal(false);
      setPendingExport(null);
    } catch (cleanupError) {
      console.error("Failed during download-only cleanup:", cleanupError);
      toast.error("MP4 downloaded, but cleanup failed");
    } finally {
      setResultActionLoading(false);
    }
  };

  const handleSaveShareLink = async () => {
    if (!pendingExport) {
      return;
    }

    try {
      setResultActionLoading(true);
      await saveExportedVideoRecord(
        pendingExport.exportedUrl,
        pendingExport.sourceVideoUrl,
        pendingExport.settings,
        pendingExport.demoId
      );
      await navigator.clipboard.writeText(pendingExport.exportedUrl);
      toast.success("Share link saved in Exported Videos and copied");
      setShowExportResultModal(false);
      setPendingExport(null);
    } catch (saveError) {
      console.error("Failed to save share link:", saveError);
      toast.error("Failed to save share link");
    } finally {
      setResultActionLoading(false);
    }
  };

  // Zoom effects handlers
  // const onZoomEffectCreate = (effect: ZoomEffect) => {
  //   console.log("Creating zoom effect:", effect);
  //   console.log("Zoom level:", effect.zoomLevel, "Expected: > 1.0");
  //   console.log("Coordinates:", { x: effect.x, y: effect.y }, "Expected: 0-1 range");

  //   if (effect.zoomLevel <= 1.0) {
  //     console.warn("⚠️ Zoom level is too low, forcing to 2.0");
  //     effect.zoomLevel = 2.0;
  //   }

  //   setZoomEffects((prev) => [...prev, effect]);
  //   console.log("Total zoom effects:", [...zoomEffects, effect].length);
  // };

  const onZoomEffectsChange = (effects: ZoomEffect[]) => {
    setZoomEffects(effects);
  };

  // Zoom effects are now applied at export time, not immediately

  //useEffect(() => {}, [videoUrl]);
  const [mode, setMode] = useState<"main" | "trim" | "zoom">("main");
  const [childHandleProgress, setChildHandleProgress] = useState<
    null | ((data: { playedSeconds: number }) => void)
  >(null);

  const [activeZoomIdx, setActiveZoomIdx] = useState<number>(-1);
  const [zoomSegments, setZoomSegments] = useState<ZoomEffect[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDraggingZoomTarget, setIsDraggingZoomTarget] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);

  // Restore a default 3-second zoom block for fresh recorder sessions.
  useEffect(() => {
    if (!params || !videoUrl || duration <= 0) {
      return;
    }

    // Only seed for recorder-origin flow (no `video` query param).
    const isRecorderFlow = !params.get("video");
    if (!isRecorderFlow) {
      return;
    }

    // Do not override loaded/saved zoom edits.
    if (zoomEffects.length > 0 || zoomSegments.length > 0) {
      return;
    }

    if (defaultZoomSeededForVideoRef.current === videoUrl) {
      return;
    }

    const defaultStart = Math.min(2, Math.max(0, duration - 1));
    const defaultEnd = Math.min(duration, defaultStart + 3);
    if (defaultEnd - defaultStart <= 0.1) {
      return;
    }

    setZoomSegments([
      {
        id: `seed-${Date.now()}`,
        startTime: defaultStart,
        endTime: defaultEnd,
        zoomLevel: 2,
        x: 0.5,
        y: 0.5,
      },
    ]);
    defaultZoomSeededForVideoRef.current = videoUrl;
  }, [params, videoUrl, duration, zoomEffects.length, zoomSegments.length]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const resolvedZoomIdx =
    activeZoomIdx >= 0 && activeZoomIdx < zoomSegments.length
      ? activeZoomIdx
      : zoomSegments.length > 0
        ? 0
        : -1;
  const activeEditedZoomSegment = resolvedZoomIdx >= 0 ? zoomSegments[resolvedZoomIdx] : null;
  const activePlaybackZoomSegment = zoomSegments.find(
    (segment) => currentTime >= segment.startTime && currentTime <= segment.endTime
  );
  const activePreviewZoomSegment = activePlaybackZoomSegment ?? activeEditedZoomSegment;
  const isWithinActiveEditedSegment =
    !!activeEditedZoomSegment &&
    currentTime >= activeEditedZoomSegment.startTime &&
    currentTime <= activeEditedZoomSegment.endTime;
  const shouldShowZoomFocusBox = !!activeEditedZoomSegment && isWithinActiveEditedSegment;
  const shouldApplyZoomPreview = !!activePlaybackZoomSegment;

  const previewZoomScale = activePreviewZoomSegment
    ? 1 + (Math.max(1, activePreviewZoomSegment.zoomLevel) - 1) * 0.8
    : 1;
  const zoomFocusSizePct = 15;

  // Correct zoom centering: translate so the selected point is at view center
  const zoomCx = (activePreviewZoomSegment?.x ?? 0.5) * 100;
  const zoomCy = (activePreviewZoomSegment?.y ?? 0.5) * 100;
  const zoomTranslateX = shouldApplyZoomPreview
    ? clamp(zoomCx - 50 / previewZoomScale, 0, 100 - 100 / previewZoomScale)
    : 0;
  const zoomTranslateY = shouldApplyZoomPreview
    ? clamp(zoomCy - 50 / previewZoomScale, 0, 100 - 100 / previewZoomScale)
    : 0;

  const updateZoomTargetFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (resolvedZoomIdx < 0) {
        return;
      }
      if (!shouldShowZoomFocusBox) {
        return;
      }
      const stage = zoomFocusStageRef.current;
      if (!stage) {
        return;
      }

      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const xRaw = (clientX - rect.left) / rect.width;
      const yRaw = (clientY - rect.top) / rect.height;

      const x = clamp(xRaw, 0, 1);
      const y = clamp(yRaw, 0, 1);

      setZoomSegments((prev) =>
        prev.map((segment, index) => (index === resolvedZoomIdx ? { ...segment, x, y } : segment))
      );
    },
    [resolvedZoomIdx, setZoomSegments, shouldShowZoomFocusBox]
  );

  const handleZoomTargetMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!activeEditedZoomSegment) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingZoomTarget(true);
      updateZoomTargetFromPointer(event.clientX, event.clientY);
    },
    [activeEditedZoomSegment, updateZoomTargetFromPointer]
  );

  useEffect(() => {
    if (!isDraggingZoomTarget) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      updateZoomTargetFromPointer(event.clientX, event.clientY);
    };
    const onUp = () => {
      setIsDraggingZoomTarget(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingZoomTarget, updateZoomTargetFromPointer]);

  useEffect(() => {
    if (activeZoomIdx === -1 && zoomSegments.length > 0) {
      setActiveZoomIdx(0);
    }
  }, [activeZoomIdx, zoomSegments.length]);

  useEffect(() => {
    if (!currentTime) {
      return;
    }

    const segment = zoomSegments.find(
      (z) => currentTime >= z.startTime && currentTime <= z.endTime
    );

    // if segment exist
    if (segment) {
      setZoomLevel(segment.zoomLevel);
    } else {
      setZoomLevel(1); // normal zoom
    }
    if (mode === "zoom" && activeZoomIdx != -1) {
      const zoomInfo = zoomSegments[activeZoomIdx];
      if (zoomInfo && currentTime >= zoomInfo.endTime) {
        playerRef.current.seekTo(zoomInfo.startTime, "seconds");
      }
    }
  }, [activeZoomIdx, currentTime, mode, playerRef, zoomSegments]);

  //const [open, setOpen] = useState(true);

  return (
    <main className="flex flex-col min-h-screen w-full bg-gray-50 overflow-hidden">
      <ExportSettingsModal
        isOpen={showExportSettings}
        onClose={() => setShowExportSettings(false)}
        onConfirm={onExportVideo}
        durationInSeconds={duration || 0}
      />
      <ExportResultModal
        isOpen={showExportResultModal}
        exportedUrl={pendingExport?.exportedUrl || ""}
        loading={resultActionLoading}
        onClose={() => {
          if (resultActionLoading) {
            return;
          }
          setShowExportResultModal(false);
          setPendingExport(null);
        }}
        onDownloadMp4={handleDownloadMp4Only}
        onSaveShareLink={handleSaveShareLink}
      />
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

      <EditorTopbar
        onBack={() => router.back()}
        userInitials={initials}
        onToggleMenu={toggleDashboardMenu}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Sidebar for Desktop */}
        <div className="hidden md:block w-80 bg-white shadow-lg z-40">
          <div className="w-full h-full relative">
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
              onExportWebM={() => setShowExportSettings(true)}
              tool={tool}
              setTool={(t: string) => {
                if (t === "none" || t === "text" || t === "blur" || t === "rect" || t === "arrow") {
                  setTool(t);
                }
              }}
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
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              browserFrameMode={browserFrameMode}
              setBrowserFrameMode={setBrowserFrameMode}
              browserFrameDrawShadow={browserFrameDrawShadow}
              setBrowserFrameDrawShadow={setBrowserFrameDrawShadow}
              browserFrameDrawBorder={browserFrameDrawBorder}
              setBrowserFrameDrawBorder={setBrowserFrameDrawBorder}
            />
            {activeZoomIdx != -1 && showZoomModal ? (
              <ZoomModal
                //isOpen={open}
                onClose={() => setShowZoomModal(false)}
                activeZoomIdx={activeZoomIdx}
                setZoomSegments={setZoomSegments}
                zoomSegments={zoomSegments}
                // videourl={videoUrl}
                // playerRef={playerRef}
              />
            ) : (
              <div></div>
            )}
          </div>
        </div>

        {/* Mobile Drawer for EditorSidebar */}
        {isSidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black bg-opacity-40"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="relative w-full max-w-xs h-full bg-white shadow-lg z-50 animate-slide-in-left">
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
                onExportWebM={() => setShowExportSettings(true)}
                tool={tool}
                setTool={(t: string) => {
                  if (
                    t === "none" ||
                    t === "text" ||
                    t === "blur" ||
                    t === "rect" ||
                    t === "arrow"
                  ) {
                    setTool(t);
                  }
                }}
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
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                browserFrameMode={browserFrameMode}
                setBrowserFrameMode={setBrowserFrameMode}
                browserFrameDrawShadow={browserFrameDrawShadow}
                setBrowserFrameDrawShadow={setBrowserFrameDrawShadow}
                browserFrameDrawBorder={browserFrameDrawBorder}
                setBrowserFrameDrawBorder={setBrowserFrameDrawBorder}
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Mobile Drawer for SidemenuDashboard */}
        {isDashboardMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="fixed inset-0 bg-black bg-opacity-40" onClick={closeDashboardMenu} />
            <SidemenuDashboard />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-4 mb-6 sm:mb-6 px-4 sm:px-8">
            <div className="flex gap-2 sm:gap-4 mt-2 sm:mt-0 ml-auto">
              {/* Mobile Hamburger Button for SidemenuDashboard */}
              <div className="relative md:hidden group">
                <button
                  className="flex cursor-pointer items-center gap-2 mt-5 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit whitespace-nowrap"
                  onClick={toggleDashboardMenu}
                  aria-label="Toggle dashboard menu"
                >
                  <FaBars className="text-xl" />
                  Menu
                </button>
                {isDashboardMenuOpen && (
                  <div className="fixed inset-0 z-50 flex md:hidden">
                    <div
                      className="fixed inset-0 bg-black bg-opacity-40"
                      onClick={() => setIsDashboardMenuOpen(false)}
                    />
                    <SidemenuDashboard />
                  </div>
                )}
              </div>

              {/* <button
                className="flex cursor-pointer items-center gap-2 mt-5 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit whitespace-nowrap"
                onClick={() => setShowSaveDemoModal(true)}
              >
                <span className="text-xl"></span> Save Demo
              </button> */}

              {/* Editor Sidebar Toggle for Mobile */}
              <button
                className="md:hidden cursor-pointer flex items-center gap-2 mt-5 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit whitespace-nowrap"
                onClick={() => setIsSidebarOpen(true)}
              >
                <FaBars className="text-xl" />
                Editor
              </button>
            </div>
          </div>

          {(sidebarTitle || sidebarDescription) && !demoSaved && (
            <div className="bg-white p-4 mx-4 flex items-center justify-between">
              <div className="flex flex-col">
                {sidebarTitle && (
                  <div>
                    {/* <span className="text-sm font-medium text-gray-500">Title:</span> */}
                    <span className="text-[32px] font-medium text-[#261753]">{sidebarTitle}</span>
                  </div>
                )}
                {/* {sidebarDescription && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Description:</span>
                    <span className="text-[rgba(0,0,0,0.43)] text-lg">{sidebarDescription}</span>
                  </div>
                )} */}
              </div>
              <button
                className="flex cursor-pointer items-center justify-center gap-2 px-4 sm:px-6 h-10 sm:h-12 rounded-lg bg-[#A594F9] text-white font-semibold shadow-sm hover:bg-[#7C5CFC] focus:ring-2 focus:ring-[#A594F9] transition-all text-base w-32 max-w-xs min-w-fit whitespace-nowrap"
                onClick={() => setShowSaveDemoModal(true)}
                disabled={demoSaved || savingDemo}
              >
                <span className="text-xl"></span>
                {savingDemo ? "Saving..." : demoSaved ? "✓ Saved" : "Save Demo"}
              </button>
            </div>
          )}
          {videoUrl && !demoSaved && !sidebarTitle && (
            <div className="flex justify-center mt-6 mb-6 ml-">
              <button
                onClick={() => setShowSaveDemoModal(true)}
                disabled={demoSaved || savingDemo}
                className={`px-8 py-3 rounded-lg font-semibold shadow transition text-base whitespace-nowrap ${demoSaved || savingDemo ? "bg-[#8A76FC] text-white opacity-70 cursor-not-allowed" : "bg-[#8A76FC] text-white hover:bg-[#7A66EC]"}`}
              >
                {savingDemo ? "Saving..." : demoSaved ? "Saved" : "Save Demo"}
              </button>
            </div>
          )}
          <div className="mt-5"></div>
          {/* Video Wrapper */}
          <div
            className={
              "flex flex-col items-center w-full max-w-[1200px] mx-auto rounded-2xl bg-transparent"
            }
            //style={{ boxShadow: "0 8px 24px rgba(124, 92, 252, 0.3)" }}
          >
            {/* Video container */}
            <div
              ref={videoContainerRef}
              className={`relative w-full max-w-[1120px] sm:h-auto rounded-2xl border ${
                isFullscreen ? "border-[#7C5CFC] shadow-lg" : "border-[#E6E1FA]"
              } flex flex-col items-center justify-center mb-1 transition-all duration-300`}
              style={{
                aspectRatio: "16 / 9",
                minHeight: "160px",
                padding: selectedBackground ? "0px" : "5px",
                boxShadow: "0 4px 24px 0 #E6E1FA",
                ...getBackgroundStyle(),
              }}
            >
              <div
                className=""
                style={{
                  width: "auto",
                  aspectRatio: previewFrameAspectRatio,
                  height: stageHeight,
                  maxWidth: stageMaxWidth,
                  margin: "0 auto",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "1.25rem",
                  overflow: "hidden",
                  background: hasCanvasBackground ? "#F6F3FF" : "#000000",
                  border: browserFrameBorder,
                  boxShadow: browserFrameShadow,
                  transition: "width 0.3s ease, height 0.3s ease",
                }}
              >
                {browserFrameEnabled && (
                  <div
                    className="w-full shrink-0 px-3"
                    style={{
                      height: `${browserFrameTopBarHeight}px`,
                      background:
                        browserFrameMode === "default"
                          ? "linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(17,24,39,0.98) 100%)"
                          : "rgba(17, 24, 39, 0.96)",
                      borderBottom: "1px solid rgba(148,163,184,0.24)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {browserFrameMode === "default" ? (
                      <div className="w-full flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                        </div>
                        <div className="flex-1 h-6 rounded-md bg-white/10 border border-white/10" />
                      </div>
                    ) : (
                      <div className="w-full h-1.5 rounded-full bg-white/15" />
                    )}
                  </div>
                )}

                <div
                  ref={zoomFocusStageRef}
                  className="relative w-full flex-1 min-h-0"
                  style={{
                    borderRadius: browserFrameEnabled ? "0 0 1.25rem 1.25rem" : "1.25rem",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="absolute inset-0 z-10"
                    style={{
                      transform: shouldApplyZoomPreview
                        ? `scale(${previewZoomScale}) translate(-${zoomTranslateX}%, -${zoomTranslateY}%)`
                        : "scale(1)",
                      transformOrigin: "0% 0%",
                      transition: isDraggingZoomTarget ? "none" : "transform 0.4s ease",
                      backgroundColor: hasCanvasBackground ? "#F1ECFF" : "#000000",
                    }}
                  >
                    <div className="w-full h-full">
                      {/*In FullScreen video require one div, so don't remove div */}
                      {videoUrl ? (
                        <ReactPlayer
                          key={videoUrl}
                          ref={playerRef}
                          url={videoUrl}
                          playing={playing}
                          controls={false}
                          muted={false}
                          volume={volume}
                          width="100%"
                          height="100%"
                          config={{
                            file: {
                              attributes: {
                                crossOrigin: "anonymous",
                                style: {
                                  objectFit: previewObjectFit,
                                  objectPosition: "center center",
                                  width: "100%",
                                  height: "100%",
                                  backgroundColor: hasCanvasBackground ? "#F1ECFF" : "#000000",
                                },
                              },
                            },
                          }}
                          onError={(e) => console.error("Video failed to load", e)}
                          onProgress={(data) => {
                            setCurrentTime(data.playedSeconds);
                            childHandleProgress?.(data);
                          }}
                          onEnded={() => setPlaying(false)}
                          progressInterval={50}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                          <div className="w-16 h-16 bg-[#E6E1FA] rounded-full flex items-center justify-center mb-4">
                            <svg
                              className="w-8 h-8 text-[#7C5CFC]"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-[#7C5CFC] mb-2">
                            No Video Selected
                          </h3>
                          <p className="text-sm text-gray-600 mb-4">To start editing, please:</p>
                          <div className="space-y-2 text-sm text-gray-500">
                            <p>
                              • Go to <strong>Dashboard</strong> and edit an existing demo
                            </p>
                            <p>
                              • Or go to <strong>Recorder</strong> to record/upload a new video
                            </p>
                          </div>
                          <div className="mt-6 flex gap-3">
                            <button
                              onClick={() => router.push("/dashboard")}
                              className="px-4 py-2 bg-[#7C5CFC] text-white rounded-lg hover:bg-[#6356D7] transition"
                            >
                              Go to Dashboard
                            </button>
                            <button
                              onClick={() => router.push("/recorder")}
                              className="px-4 py-2 bg-[#E6E1FA] text-[#7C5CFC] rounded-lg hover:bg-[#7C5CFC] hover:text-white transition"
                            >
                              Go to Recorder
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {shouldShowZoomFocusBox && (
                    <div
                      className="absolute inset-0 z-50"
                      onMouseDown={handleZoomTargetMouseDown}
                      style={{
                        cursor: isDraggingZoomTarget ? "grabbing" : "grab",
                        userSelect: "none",
                      }}
                    >
                      <div
                        className="absolute rounded-lg pointer-events-none"
                        style={{
                          width: `${zoomFocusSizePct}%`,
                          height: `${zoomFocusSizePct}%`,
                          left: `${activeEditedZoomSegment.x * 100}%`,
                          top: `${activeEditedZoomSegment.y * 100}%`,
                          transform: "translate(-50%, -50%)",
                          border: "2px solid #ef4444",
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.55) inset",
                          background: "rgba(239,68,68,0.08)",
                          transition: isDraggingZoomTarget
                            ? "none"
                            : "left 0.12s ease, top 0.12s ease",
                        }}
                      />
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium pointer-events-none backdrop-blur-sm">
                        Drag to adjust zoom
                      </div>
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    className={`absolute top-0 left-0 w-full h-full ${
                      tool !== "none" ? "z-40 cursor-crosshair" : "z-0 cursor-default"
                    }`}
                    onMouseDown={tool !== "none" ? handleMouseDown : undefined}
                    onMouseUp={tool !== "none" ? handleMouseUp : undefined}
                    style={{
                      pointerEvents: tool !== "none" ? "auto" : "none",
                      borderRadius: browserFrameEnabled ? "0 0 1.25rem 1.25rem" : "1.25rem",
                    }}
                  />
                </div>
              </div>

              {/* Controls container - only show when video is available */}
              {videoUrl && (
                <div className="w-full flex flex-col gap-3 mt-5">
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
                    volume={volume}
                    setVolume={setVolume}
                    handleFullscreen={handleFullscreen}
                  />
                </div>
              )}
            </div>
          </div>
          {tool === "text" && (
            <div className="flex gap-3 items-center mb-6 sm:mb-0 mx-4 sm:mx-8">
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

          {/* Timeline - only show when video is available */}
          {videoUrl && (
            <div className="mr-2 mt-8 mb-5 pr-8 sm:mr-0 mx-4 sm:mx-8">
              {duration > 0 ? (
                <TimelineRuler
                  minValue={0}
                  maxValue={duration}
                  currentValue={Math.max(0, currentTime)}
                  handleFullscreen={handleFullscreen}
                  isFullscreen={isFullscreen}
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
                  processing={processing}
                  onResetVideo={handleResetTimeline}
                  playing={playing}
                  setPlaying={setPlaying}
                  mode={mode}
                  setMode={setMode}
                  playerRef={playerRef}
                  setChildHandleProgress={setChildHandleProgress}
                  zoomSegments={zoomSegments}
                  setZoomSegments={setZoomSegments}
                  activeZoomIdx={activeZoomIdx}
                  setActiveZoomIdx={setActiveZoomIdx}
                  zoomLevelDepth={zoomLevel}
                  segments={segments}
                  setSegments={setSegments}
                />
              ) : (
                <div className="w-full max-w-6xl mx-auto">
                  <div className="relative h-32 bg-white border-2 border-[#A594F9] rounded-lg flex items-center justify-center">
                    <span className="text-[#A594F9] font-medium">Loading timeline...</span>
                  </div>
                </div>
              )}
            </div>
          )}
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
            const player = playerRef.current.getInternalPlayer();
            if (player) {
              player.currentTime = time;
              player.dispatchEvent(new Event("seeking"));
              playerRef.current.seekTo(time, "seconds");
            }
          }
        }}
      />

      <SaveDemoModal
        isOpen={showSaveDemoModal}
        onClose={() => setShowSaveDemoModal(false)}
        onSave={onSaveDemo}
        initialTitle={sidebarTitle}
        initialDescription={sidebarDescription}
        processing={savingDemo}
        isSaved={demoSaved}
      />
    </main>
  );
}
