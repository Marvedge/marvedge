import { useState, useRef } from "react";
import ReactPlayer from "react-player";
import { ZoomEffect } from "@/app/interfaces/editor/IZoomEffect";

export interface Segment {
  start: string;
  end: string;
}

export function useEditorState() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [timelineStartTime, setTimelineStartTime] = useState<number>(0);
  const [timelineEndTime, setTimelineEndTime] = useState(0);

  // Segments state
  const [loadedSegments, setLoadedSegments] = useState<Segment[] | null>(null);
  const [currentSegments, setCurrentSegments] = useState<Segment[]>([]);

  // Tool state
  const [tool, setTool] = useState<"none" | "blur" | "rect" | "arrow" | "text">(
    "none",
  );
  const [textColor, setTextColor] = useState("#000000");
  const [textFont, setTextFont] = useState("16px sans-serif");

  // Sidebar state
  const [sidebarTitle, setSidebarTitle] = useState("");
  const [sidebarDescription, setSidebarDescription] = useState("");

  // Modal state
  const [showSaveDemoModal, setShowSaveDemoModal] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);

  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDashboardMenuOpen, setIsDashboardMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Video state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  // Zoom effects state
  const [zoomEffects, setZoomEffects] = useState<ZoomEffect[]>([]);
  const [isZoomPopupOpen, setIsZoomPopupOpen] = useState(false);

  // Timeline input state
  const [inputStartTime, setInputStartTime] = useState("00:00:00");
  const [inputEndTime, setInputEndTime] = useState("00:00:00");

  // Background state
  const [selectedBackground, setSelectedBackground] = useState<string | null>(
    null,
  );
  const [backgroundType, setBackgroundType] = useState<string>("");
  const [customBackground, setCustomBackground] = useState<File | null>(null);

  // Refs
  const playerRef = useRef<ReactPlayer>(null!);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  return {
    // State
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
    loadedSegments,
    setLoadedSegments,
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
    // Refs
    playerRef,
    canvasRef,
    videoContainerRef,
  };
}
