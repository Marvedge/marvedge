"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
// import { FaBars } from "react-icons/fa6";
//import { FaExpand, FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { X } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
// import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ReactPlayer from "react-player";
import axios from "axios";
//import { videoTrimmer } from "@/app/lib/ffmpeg"; // Moved to export handler
//import Image from "next/image";

// Components
import SidemenuDashboard from "@/app/components/SidemenuDashboard";
import EditorSidebar from "@/app/components/EditorSidebar";
// EditorTopbar removed to keep editor viewport scroll-free
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
import { handleSaveDemo, exportVideo } from "./utils/videoHandlers";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import ZoomModal from "@/app/components/ZoomModal";
import ExportSettingsModal, { ExportSettings } from "@/app/components/ExportSettingsModal";
import ExportResultModal from "@/app/components/ExportResultModal";
import { uploadBlobToGcs } from "@/app/lib/gcsUploadClient";

type TextOverlayItem = {
  id: string;
  text: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // px
  h: number; // px
  startTime: number;
  endTime: number;
  fontFamily: string;
  fontSize: number;
  color: string;
};

type SubtitleCue = { start: number; end: number; text: string };

function resolveOverlayFontFamily(value: string): string {
  const v = (value || "").trim();
  switch (v) {
    case "Inter":
      return "var(--font-inter), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    case "Roboto":
      return "var(--font-roboto), ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial";
    case "Poppins":
      return "var(--font-poppins), ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial";
    case "Caveat":
      return "var(--font-caveat), ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial";
    case "Georgia":
      return "Georgia, ui-serif, serif";
    case "Arial":
    default:
      return "Arial, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  }
}

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
  const { videoUrl: recordedVideoUrl, thumbnailUrl, processing, resetVideo } = useEditor();

  const blob = useBlobStore((state) => state.blob);
  const { recordingDuration } = useScreenRecorder();
  // const { data: session } = useSession();

  // Format time helper
  const { formatTimeForInput } = useFormatTime();

  // Text overlays need to be initialized before useURLParams() so URL restores don't hit TDZ.
  const [textOverlays, setTextOverlays] = useState<TextOverlayItem[]>([]);
  const setTextOverlaysFromUrl = React.useCallback((overlays: unknown) => {
    if (!overlays) {
      setTextOverlays([]);
      return;
    }
    if (Array.isArray(overlays)) {
      setTextOverlays(overlays as TextOverlayItem[]);
    }
  }, []);

  // Initialize params
  useEffect(() => {
    const nextParams = new URLSearchParams(window.location.search);
    setParams(nextParams);
    // Ensure existing demos opened from `/demos` immediately have an id for Save/Autosave,
    // even before other URL restoration effects run.
    const urlDemoId = nextParams.get("demoId");
    if (urlDemoId) {
      setSavedDemoId(urlDemoId);
    }
  }, [setParams, setSavedDemoId]);

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
    setSelectedBackground,
    setBackgroundType,
    setTextOverlays: setTextOverlaysFromUrl,
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
  const { handleMouseDown, handleMouseUp } = useOverlays({
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
    // For existing demos (opened from /demos), keep "saved" state.
    // For fresh recorder sessions, allow saving.
    if (videoUrl && !editorState.savedDemoId) {
      setDemoSaved(false);
    }
  }, [videoUrl, editorState.savedDemoId, setDemoSaved]);

  useEffect(() => {
    if (editorState.savedDemoId) {
      setDemoSaved(true);
    }
  }, [editorState.savedDemoId, setDemoSaved]);

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

  // User initials were previously used in the topbar (now removed).

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
    const effectiveDemoId = editorState.savedDemoId || params?.get("demoId") || null;
    const isExistingDemo = !!effectiveDemoId;
    if (demoSaved && !isExistingDemo) {
      return;
    }

    // Create a unique key for this demo to prevent duplicates in this session
    const demoKey = `${data.title}|${videoUrl}|${data.description}`;

    // Check if this exact demo was already saved in this session
    if (!isExistingDemo && savedDemosRef.current.has(demoKey)) {
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
      subtitles: subtitleCues,
      selectedBackground,
      backgroundType,
      aspectRatio,
      browserFrame: {
        mode: browserFrameMode,
        drawShadow: browserFrameDrawShadow,
        drawBorder: browserFrameDrawBorder,
      },
      textOverlays,
      savedDemoId: effectiveDemoId,
      setSavingDemo,
      setSidebarTitle,
      setSidebarDescription,
      setShowSaveDemoModal,
      setDemoSaved,
      setSavedDemoId,
      onSaveSuccess: () => {
        // Track this demo as saved
        if (!isExistingDemo) {
          savedDemosRef.current.add(demoKey);
        }
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
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  useEffect(() => {
    if (!params) {
      return;
    }
    const urlSubtitles = params.get("subtitles");
    if (!urlSubtitles) {
      return;
    }
    try {
      const parsed = JSON.parse(urlSubtitles) as unknown;
      // Accept either an array of cues or a { cues: [...] } payload.
      let cues: unknown = null;
      if (Array.isArray(parsed)) {
        cues = parsed;
      } else if (typeof parsed === "object" && parsed && "cues" in parsed) {
        cues = (parsed as { cues?: unknown }).cues ?? null;
      }
      if (Array.isArray(cues)) {
        setSubtitleCues(
          cues
            .map((c) => {
              if (typeof c !== "object" || !c) {
                return null;
              }
              const rec = c as Record<string, unknown>;
              const start = Number(rec.start);
              const end = Number(rec.end);
              const text = String(rec.text ?? "").trim();
              if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
                return null;
              }
              return { start, end, text } satisfies SubtitleCue;
            })
            .filter(
              (c): c is SubtitleCue =>
                !!c && Number.isFinite(c.start) && Number.isFinite(c.end) && c.text.length > 0
            )
        );
      }
    } catch (e) {
      console.error("Failed to parse subtitles from URL:", e);
    }
  }, [params]);

  const activeSubtitleText = React.useMemo(() => {
    if (!subtitleCues.length) {
      return "";
    }
    const t = currentTime;
    // Binary search over sorted cues by start time.
    let lo = 0;
    let hi = subtitleCues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = subtitleCues[mid];
      if (t < c.start) {
        hi = mid - 1;
      } else if (t > c.end) {
        lo = mid + 1;
      } else {
        return c.text;
      }
    }
    // Might be between cues; no caption.
    return "";
  }, [subtitleCues, currentTime]);

  const handleAddSubtitles = async () => {
    if (!videoUrl) {
      toast.error("No video available for subtitles");
      return;
    }
    if (subtitlesLoading) {
      return;
    }

    const toastId = toast.loading("Generating subtitles...");
    setSubtitlesLoading(true);
    try {
      let subtitleSourceUrl = videoUrl;
      if (videoUrl.startsWith("blob:")) {
        toast.loading("Uploading audio source...", { id: toastId });
        const resp = await fetch(videoUrl);
        if (!resp.ok) {
          throw new Error("Failed to read recorded video blob");
        }
        const blob = await resp.blob();
        const upload = await uploadBlobToGcs({
          blob,
          filename: "subtitle_source.webm",
          kind: "subtitle-source",
        });
        subtitleSourceUrl = upload.url;
      }

      const createRes = await axios.post("/api/subtitles/create", {
        videoUrl: subtitleSourceUrl,
        demoId: editorState.savedDemoId || null,
        language: "multi",
      });
      const jobId = createRes.data?.jobId as string | undefined;
      if (!jobId) {
        throw new Error("No subtitle job ID returned");
      }

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const MAX_POLLS = 180; // 6 minutes (180 × 2s)
      for (let pollCount = 0; pollCount < MAX_POLLS; pollCount++) {
        const statusRes = await axios.get(`/api/jobs/${jobId}`);
        const state = statusRes.data?.state as string | undefined;
        if (state === "completed") {
          const cues = (statusRes.data?.subtitles || []) as SubtitleCue[];
          setSubtitleCues(Array.isArray(cues) ? cues : []);
          toast.success("Subtitles ready", { id: toastId });
          return;
        }
        if (state === "failed") {
          throw new Error(statusRes.data?.error || "Subtitle generation failed");
        }
        await sleep(2000);
      }
      throw new Error("Subtitle generation timed out");
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to generate subtitles";
      toast.error(message, { id: toastId });
    } finally {
      setSubtitlesLoading(false);
    }
  };

  const handleSkipSubtitles = React.useCallback(() => {
    setSubtitleCues([]);
    toast.success("Subtitles skipped for export");
  }, []);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [showExportResultModal, setShowExportResultModal] = useState(false);
  const [resultActionLoading, setResultActionLoading] = useState(false);
  const [shareLinkSaved, setShareLinkSaved] = useState(false);
  const [textOverlayInput, setTextOverlayInput] = useState("Add text");
  const [textOverlayFontFamily, setTextOverlayFontFamily] = useState("Arial");
  const [textOverlayFontSize, setTextOverlayFontSize] = useState(24);
  const [textOverlayColor, setTextOverlayColor] = useState("#ffffff");
  const [selectedTextOverlayId, setSelectedTextOverlayId] = useState<string | null>(null);
  const [draggingTextOverlayId, setDraggingTextOverlayId] = useState<string | null>(null);
  const [resizingTextOverlayId, setResizingTextOverlayId] = useState<string | null>(null);
  const textDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const textResizeStartRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  }>({
    startX: 0,
    startY: 0,
    startW: 240,
    startH: 80,
  });

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
  // Browser frame UI modes are removed; keep only cheap border/shadow styling.
  // Slightly thinner + less visible than before (requested).
  const browserFrameBorder = browserFrameDrawBorder ? "4px solid rgba(255,255,255,0.55)" : "none";
  const browserFrameShadow = browserFrameDrawShadow ? "0 14px 34px rgba(0,0,0,0.32)" : "none";
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
  const stageMaxWidth = selectedBackground ? (isPortraitPreview ? "95%" : "92%") : "100%";
  const stageContainerPadY = isPortraitPreview ? (isFullscreen ? 14 : 18) : isFullscreen ? 18 : 24;

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

    // If user uploaded a custom background image, create a temporary object URL for the compositor.
    // For preset image backgrounds (solid/gradient/default), we convert them to a worker-downloadable URL.
    const localObjectUrl = customBackground ? URL.createObjectURL(customBackground) : null;
    let resolvedSelectedBackground = selectedBackground || "none";
    let resolvedCustomBackgroundUrl: string | null = localObjectUrl;

    if (
      !resolvedCustomBackgroundUrl &&
      resolvedSelectedBackground &&
      resolvedSelectedBackground !== "none" &&
      resolvedSelectedBackground !== "hidden" &&
      resolvedSelectedBackground !== "custom" &&
      !resolvedSelectedBackground.startsWith("color:") &&
      !resolvedSelectedBackground.startsWith("gradient:") &&
      imageMap[resolvedSelectedBackground]
    ) {
      // Worker can only download an actual image URL. Public assets are served from the app origin.
      const src = imageMap[resolvedSelectedBackground];
      resolvedSelectedBackground = "custom";
      resolvedCustomBackgroundUrl = src.startsWith("http")
        ? src
        : `${window.location.origin}${src.startsWith("/") ? src : `/${src}`}`;
    }

    const result = await exportVideo({
      videoUrl: videoUrl!,
      selectedBackground: resolvedSelectedBackground,
      customBackgroundUrl: resolvedCustomBackgroundUrl,
      imageMap,
      sidebarTitle,
      sidebarDescription,
      segments,
      zoomSegments,
      subtitles: subtitleCues,
      textOverlays,
      setProgress,
      aspectRatio,
      browserFrame: {
        mode: browserFrameMode,
        drawShadow: browserFrameDrawShadow,
        drawBorder: browserFrameDrawBorder,
      },
      duration,
      savedDemoId: editorState.savedDemoId,
      settings: {
        ...settings,
        // Keep export default at 24fps for faster render throughput.
        fps: "24 FPS",
        // Speed is controlled from the main editor controls (not export modal).
        speed:
          playbackSpeed === 1
            ? "Default"
            : String(playbackSpeed) === "0.75"
              ? "0.75"
              : String(playbackSpeed) === "1.25"
                ? "1.25"
                : String(playbackSpeed) === "1.5"
                  ? "1.5"
                  : String(playbackSpeed) === "1.75"
                    ? "1.75"
                    : "2",
      },
    });

    if (result) {
      setPendingExport({
        ...result,
        settings,
        demoId: editorState.savedDemoId ?? null,
      });
      setShareLinkSaved(false);
      setShowExportResultModal(true);
    }

    // Clean up the object URL after export
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
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
      setShareLinkSaved(true);
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
  const [mode, setMode] = useState<"main" | "trim" | "zoom" | "text">("main");
  const [childHandleProgress, setChildHandleProgress] = useState<
    null | ((data: { playedSeconds: number }) => void)
  >(null);

  const [activeZoomIdx, setActiveZoomIdx] = useState<number>(-1);
  const [zoomSegments, setZoomSegments] = useState<ZoomEffect[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDraggingZoomTarget, setIsDraggingZoomTarget] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);

  // Autosave editing state for already-saved demos.
  // This keeps edits persisted when the user navigates away without clicking "Save Demo".
  const autosaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosavePayloadRef = React.useRef<string>("");
  const autosaveInFlightRef = React.useRef(false);

  const buildEditingPayload = React.useCallback(() => {
    return {
      segments: segments.map((s) => ({
        start: String(s.start),
        end: String(s.end),
      })),
      zoom: zoomSegments,
      background: selectedBackground ?? null,
      backgroundType: backgroundType || "",
      subtitles: subtitleCues || [],
      textOverlays: textOverlays || [],
      aspectRatio: aspectRatio || "native",
      browserFrame: {
        mode: browserFrameMode,
        drawShadow: browserFrameDrawShadow,
        drawBorder: browserFrameDrawBorder,
      },
    };
  }, [
    segments,
    zoomSegments,
    selectedBackground,
    backgroundType,
    subtitleCues,
    textOverlays,
    aspectRatio,
    browserFrameMode,
    browserFrameDrawShadow,
    browserFrameDrawBorder,
  ]);

  const flushAutosave = React.useCallback(async () => {
    const demoId = editorState.savedDemoId;
    if (!demoId) {
      return;
    }
    if (autosaveInFlightRef.current) {
      return;
    }

    const payload = {
      id: demoId,
      title: sidebarTitle || "",
      description: sidebarDescription || "",
      editing: buildEditingPayload(),
    };
    const serialized = JSON.stringify(payload);
    if (serialized === lastAutosavePayloadRef.current) {
      return;
    }
    lastAutosavePayloadRef.current = serialized;

    autosaveInFlightRef.current = true;
    try {
      await axios.patch("/api/demo", payload);
    } catch (e) {
      // Don't toast here; autosave should be silent.
      console.warn("Autosave failed:", e);
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [buildEditingPayload, editorState.savedDemoId, sidebarTitle, sidebarDescription]);

  React.useEffect(() => {
    if (!editorState.savedDemoId) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    autosaveTimerRef.current = setTimeout(() => {
      void flushAutosave();
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    editorState.savedDemoId,
    segments,
    zoomSegments,
    selectedBackground,
    backgroundType,
    subtitleCues,
    textOverlays,
    aspectRatio,
    browserFrameMode,
    browserFrameDrawShadow,
    browserFrameDrawBorder,
    sidebarTitle,
    sidebarDescription,
    flushAutosave,
  ]);

  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushAutosave();
      }
    };
    const handleBeforeUnload = () => {
      void flushAutosave();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushAutosave]);

  // Ensure internal Next.js navigations (dashboard button, sidebar links, etc.) still persist edits.
  React.useEffect(() => {
    return () => {
      void flushAutosave();
    };
  }, [flushAutosave]);

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

  const handleAddTextOverlay = useCallback(() => {
    const text = textOverlayInput.trim() || "Add text";
    const start = Math.max(0, currentTime);
    const defaultDuration = 3;
    const end =
      duration > 0 ? Math.min(duration, start + defaultDuration) : start + defaultDuration;
    const newOverlay: TextOverlayItem = {
      id: `text-${Date.now()}`,
      text,
      x: 0.5,
      y: 0.5,
      w: 240,
      h: 80,
      startTime: start,
      endTime: Math.max(end, start + 0.1),
      fontFamily: textOverlayFontFamily,
      fontSize: textOverlayFontSize,
      color: textOverlayColor,
    };

    setTextOverlays((prev) => [...prev, newOverlay]);
    setSelectedTextOverlayId(newOverlay.id);
    setTool("none");
  }, [
    currentTime,
    duration,
    setTool,
    textOverlayColor,
    textOverlayFontFamily,
    textOverlayFontSize,
    textOverlayInput,
  ]);

  const handleTextOverlayInputChange = useCallback(
    (value: string) => {
      setTextOverlayInput(value);
      if (!selectedTextOverlayId) {
        return;
      }
      setTextOverlays((prev) =>
        prev.map((item) => (item.id === selectedTextOverlayId ? { ...item, text: value } : item))
      );
    },
    [selectedTextOverlayId]
  );

  const handleTextOverlayFontFamilyChange = useCallback(
    (value: string) => {
      setTextOverlayFontFamily(value);
      if (!selectedTextOverlayId) {
        return;
      }
      setTextOverlays((prev) =>
        prev.map((item) =>
          item.id === selectedTextOverlayId ? { ...item, fontFamily: value } : item
        )
      );
    },
    [selectedTextOverlayId]
  );

  const handleTextOverlayFontSizeChange = useCallback(
    (value: number) => {
      setTextOverlayFontSize(value);
      if (!selectedTextOverlayId) {
        return;
      }
      setTextOverlays((prev) =>
        prev.map((item) =>
          item.id === selectedTextOverlayId ? { ...item, fontSize: value } : item
        )
      );
    },
    [selectedTextOverlayId]
  );

  const handleTextOverlayColorChange = useCallback(
    (value: string) => {
      setTextOverlayColor(value);
      if (!selectedTextOverlayId) {
        return;
      }
      setTextOverlays((prev) =>
        prev.map((item) => (item.id === selectedTextOverlayId ? { ...item, color: value } : item))
      );
    },
    [selectedTextOverlayId]
  );

  const handleTextOverlayMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, overlayId: string) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      const stage = zoomFocusStageRef.current;
      if (!stage) {
        return;
      }

      const currentOverlay = textOverlays.find((item) => item.id === overlayId);
      if (!currentOverlay) {
        return;
      }

      const rect = stage.getBoundingClientRect();
      textDragOffsetRef.current = {
        x: event.clientX - rect.left - currentOverlay.x * rect.width,
        y: event.clientY - rect.top - currentOverlay.y * rect.height,
      };

      event.preventDefault();
      event.stopPropagation();
      setSelectedTextOverlayId(overlayId);
      setTextOverlayInput(currentOverlay.text);
      setTextOverlayFontFamily(currentOverlay.fontFamily);
      setTextOverlayFontSize(currentOverlay.fontSize);
      setTextOverlayColor(currentOverlay.color);
      setDraggingTextOverlayId(overlayId);
    },
    [textOverlays]
  );

  const handleTextOverlayResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, overlayId: string) => {
      const currentOverlay = textOverlays.find((item) => item.id === overlayId);
      if (!currentOverlay) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedTextOverlayId(overlayId);
      setTextOverlayInput(currentOverlay.text);
      setTextOverlayFontFamily(currentOverlay.fontFamily);
      setTextOverlayFontSize(currentOverlay.fontSize);
      setTextOverlayColor(currentOverlay.color);
      textResizeStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startW: currentOverlay.w,
        startH: currentOverlay.h,
      };
      setResizingTextOverlayId(overlayId);
    },
    [textOverlays]
  );

  useEffect(() => {
    if (!draggingTextOverlayId) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const stage = zoomFocusStageRef.current;
      if (!stage) {
        return;
      }
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const x = clamp((event.clientX - rect.left - textDragOffsetRef.current.x) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top - textDragOffsetRef.current.y) / rect.height, 0, 1);

      setTextOverlays((prev) =>
        prev.map((item) => (item.id === draggingTextOverlayId ? { ...item, x, y } : item))
      );
    };

    const onUp = () => {
      setDraggingTextOverlayId(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingTextOverlayId]);

  useEffect(() => {
    if (!resizingTextOverlayId) {
      return;
    }

    const onMove = (event: MouseEvent) => {
      const deltaX = event.clientX - textResizeStartRef.current.startX;
      const deltaY = event.clientY - textResizeStartRef.current.startY;
      const nextW = clamp(Math.round(textResizeStartRef.current.startW + deltaX), 120, 900);
      const nextH = clamp(Math.round(textResizeStartRef.current.startH + deltaY), 40, 600);
      setTextOverlays((prev) =>
        prev.map((item) =>
          item.id === resizingTextOverlayId ? { ...item, w: nextW, h: nextH } : item
        )
      );
    };

    const onUp = () => {
      setResizingTextOverlayId(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingTextOverlayId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.isContentEditable;
      if (isTyping) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedTextOverlayId) {
          setTextOverlays((prev) => prev.filter((item) => item.id !== selectedTextOverlayId));
          setSelectedTextOverlayId(null);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTextOverlayId]);

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
          // If user closes without saving a share link, cleanup the temporary Cloudinary export.
          if (pendingExport && !shareLinkSaved) {
            axios
              .post("/api/exported-videos/cleanup", {
                exportedUrl: pendingExport.exportedUrl,
                sourceVideoUrl: pendingExport.uploadedSourceVideo
                  ? pendingExport.sourceVideoUrl
                  : null,
                demoId: pendingExport.demoId,
              })
              .catch((e) => console.error("Cleanup on close failed:", e));
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

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Sidebar for Desktop */}
        <div className="hidden md:block w-80 bg-white shadow-lg z-40">
          <div className="w-full h-full relative">
            <EditorSidebar
              title={sidebarTitle}
              onExportWebM={() => setShowExportSettings(true)}
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
              textOverlayInput={textOverlayInput}
              setTextOverlayInput={handleTextOverlayInputChange}
              textOverlayFontFamily={textOverlayFontFamily}
              setTextOverlayFontFamily={handleTextOverlayFontFamilyChange}
              textOverlayFontSize={textOverlayFontSize}
              setTextOverlayFontSize={handleTextOverlayFontSizeChange}
              textOverlayColor={textOverlayColor}
              setTextOverlayColor={handleTextOverlayColorChange}
              onAddTextOverlay={handleAddTextOverlay}
              onAddSubtitles={handleAddSubtitles}
              onClearSubtitles={handleSkipSubtitles}
              subtitlesLoading={subtitlesLoading}
              hasSubtitles={subtitleCues.length > 0}
              onOpenSaveDemo={() => setShowSaveDemoModal(true)}
              savingDemo={savingDemo}
              demoSaved={demoSaved}
              onToggleDashboardMenu={toggleDashboardMenu}
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
                onExportWebM={() => setShowExportSettings(true)}
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
                textOverlayInput={textOverlayInput}
                setTextOverlayInput={handleTextOverlayInputChange}
                textOverlayFontFamily={textOverlayFontFamily}
                setTextOverlayFontFamily={handleTextOverlayFontFamilyChange}
                textOverlayFontSize={textOverlayFontSize}
                setTextOverlayFontSize={handleTextOverlayFontSizeChange}
                textOverlayColor={textOverlayColor}
                setTextOverlayColor={handleTextOverlayColorChange}
                onAddTextOverlay={handleAddTextOverlay}
                onAddSubtitles={handleAddSubtitles}
                onClearSubtitles={handleSkipSubtitles}
                subtitlesLoading={subtitlesLoading}
                hasSubtitles={subtitleCues.length > 0}
                onOpenSaveDemo={() => setShowSaveDemoModal(true)}
                savingDemo={savingDemo}
                demoSaved={demoSaved}
                onToggleDashboardMenu={toggleDashboardMenu}
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Dashboard menu drawer (all sizes) */}
        {isDashboardMenuOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/10"
              onClick={closeDashboardMenu}
              aria-label="Close dashboard menu"
            />
            <SidemenuDashboard />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="mt-3" />
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
                // Add symmetric vertical inset so the stage isn't stuck to the top when backgrounds are enabled.
                padding: `${stageContainerPadY}px ${selectedBackground ? "0px" : "5px"}`,
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
                <div
                  ref={zoomFocusStageRef}
                  className="relative w-full flex-1 min-h-0"
                  style={{
                    borderRadius: "1.25rem",
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
                          playbackRate={playbackSpeed}
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
                          onError={(e) => {
                            const errStr = String(e);
                            if (errStr.includes("play() request was interrupted") || errStr.includes("AbortError")) {
                              return;
                            }
                            console.error("Video failed to load", e);
                          }}
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

                  {activeSubtitleText && (
                    <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-6 pointer-events-none">
                      <div
                        className="max-w-[92%] rounded-md bg-black/70 px-3 py-2 text-center text-white"
                        style={{
                          fontSize: "16px",
                          lineHeight: "1.25",
                          textShadow: "0 1px 2px rgba(0,0,0,0.65)",
                        }}
                      >
                        {activeSubtitleText}
                      </div>
                    </div>
                  )}

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
                      borderRadius: "1.25rem",
                    }}
                  />

                  <div
                    className="absolute inset-0 z-50"
                    style={{
                      pointerEvents:
                        (tool === "none" || tool === "text") && !shouldShowZoomFocusBox
                          ? "auto"
                          : "none",
                    }}
                  >
                    {textOverlays
                      .filter(
                        (overlay) =>
                          currentTime >= overlay.startTime && currentTime <= overlay.endTime
                      )
                      .map((overlay) => {
                        const isSelected = selectedTextOverlayId === overlay.id;
                        return (
                          <div
                            key={overlay.id}
                            className={`absolute rounded-md ${
                              isSelected
                                ? "border border-[#7C5CFC]/80"
                                : "border border-transparent"
                            }`}
                            style={{
                              left: `${overlay.x * 100}%`,
                              top: `${overlay.y * 100}%`,
                              transform: "translate(-50%, -50%)",
                              cursor:
                                resizingTextOverlayId === overlay.id
                                  ? "nwse-resize"
                                  : draggingTextOverlayId === overlay.id
                                    ? "grabbing"
                                    : "grab",
                              userSelect: "none",
                              padding: "2px 4px",
                              width: `${overlay.w}px`,
                              height: `${overlay.h}px`,
                            }}
                            onMouseDown={(event) => handleTextOverlayMouseDown(event, overlay.id)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedTextOverlayId(overlay.id);
                              setTextOverlayInput(overlay.text);
                              setTextOverlayFontFamily(overlay.fontFamily);
                              setTextOverlayFontSize(overlay.fontSize);
                              setTextOverlayColor(overlay.color);
                              setMode("text");
                            }}
                          >
                            {isSelected && (
                              <div
                                className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#7C5CFC] text-white p-1 rounded cursor-grab shadow-md"
                                onMouseDown={(e) => {
                                  // Trigger standard drag logic, but prevent default so it doesn't blur textarea
                                  handleTextOverlayMouseDown(e, overlay.id);
                                }}
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 8h16M4 16h16"
                                  />
                                </svg>
                              </div>
                            )}
                            {isSelected ? (
                              <textarea
                                value={overlay.text}
                                rows={Math.max(1, overlay.text.split("\n").length)}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setTextOverlays((prev) =>
                                    prev.map((item) =>
                                      item.id === overlay.id ? { ...item, text: value } : item
                                    )
                                  );
                                  setTextOverlayInput(value);
                                }}
                                className="w-full h-full bg-transparent outline-none border border-dashed border-[#A594F9] text-white resize-none"
                                style={{
                                  fontFamily: resolveOverlayFontFamily(overlay.fontFamily),
                                  fontSize: `${overlay.fontSize}px`,
                                  color: overlay.color,
                                  lineHeight: 1.2,
                                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                                  overflow: "auto",
                                  padding: "2px 4px",
                                }}
                              />
                            ) : (
                              <div
                                className="whitespace-pre-wrap break-words w-full h-full"
                                style={{
                                  fontFamily: resolveOverlayFontFamily(overlay.fontFamily),
                                  fontSize: `${overlay.fontSize}px`,
                                  color: overlay.color,
                                  lineHeight: 1.2,
                                  textShadow: "0 1px 2px rgba(0,0,0,0.55)",
                                  overflow: "hidden",
                                  padding: "2px 4px",
                                }}
                              >
                                {overlay.text}
                              </div>
                            )}
                            {isSelected && (
                              <button
                                type="button"
                                aria-label="Delete text"
                                className="absolute -top-7 right-0 bg-red-500 text-white px-2 py-1 rounded shadow hover:bg-red-600"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setTextOverlays((prev) =>
                                    prev.filter((item) => item.id !== overlay.id)
                                  );
                                  setSelectedTextOverlayId(null);
                                }}
                              >
                                Delete
                              </button>
                            )}
                            {isSelected && (
                              <button
                                type="button"
                                aria-label="Resize text"
                                className="absolute -right-2 -bottom-2 h-4 w-4 rounded-full border border-white bg-[#7C5CFC] shadow"
                                onMouseDown={(event) =>
                                  handleTextOverlayResizeMouseDown(event, overlay.id)
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
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
                    playbackSpeed={playbackSpeed}
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
                  playbackSpeed={playbackSpeed}
                  setPlaybackSpeed={setPlaybackSpeed}
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
                  textOverlays={textOverlays}
                  setTextOverlays={setTextOverlays}
                  selectedTextOverlayId={selectedTextOverlayId}
                  setSelectedTextOverlayId={setSelectedTextOverlayId}
                  setTextOverlayInspectorValues={(overlay) => {
                    setTextOverlayInput(overlay.text);
                    setTextOverlayFontFamily(overlay.fontFamily);
                    setTextOverlayFontSize(overlay.fontSize);
                    setTextOverlayColor(overlay.color);
                  }}
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
