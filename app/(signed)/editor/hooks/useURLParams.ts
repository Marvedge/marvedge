import { useEffect, useCallback } from "react";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { Segment, BrowserFrameMode } from "./useEditorState";

interface UseURLParamsProps {
  params: URLSearchParams | null;
  setVideoUrl: (url: string | null) => void;
  setInputStartTime: (time: string) => void;
  setInputEndTime: (time: string) => void;
  setTimelineEndTime: (time: number) => void;
  setSidebarTitle: (title: string) => void;
  setSidebarDescription: (description: string) => void;
  setLoadedSegments: (segments: Segment[] | null) => void;
  setCurrentSegments: (segments: Segment[]) => void;
  setZoomEffects: (effects: ZoomEffect[]) => void;
  setSavedDemoId: (id: string | null) => void;
  setAspectRatio: (ratio: string) => void;
  setBrowserFrameMode: (mode: BrowserFrameMode) => void;
  setBrowserFrameDrawShadow: (enabled: boolean) => void;
  setBrowserFrameDrawBorder: (enabled: boolean) => void;
  formatTimeForInput: (seconds: number) => string;
}

const ALLOWED_ASPECT_RATIOS = new Set(["native", "16:9", "1:1", "4:5", "2:3", "9:16"]);

function normalizeAspectRatio(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (ALLOWED_ASPECT_RATIOS.has(trimmed)) {
    return trimmed;
  }
  const converted = trimmed.replace("/", ":");
  return ALLOWED_ASPECT_RATIOS.has(converted) ? converted : null;
}

function normalizeBrowserFrameMode(value: string | null): BrowserFrameMode | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "default" || normalized === "minimal" || normalized === "hidden") {
    return normalized;
  }
  return null;
}

export function useURLParams({
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
}: UseURLParamsProps) {
  useEffect(() => {
    if (!params) {
      return;
    }

    const urlVideo = params.get("video");
    const urlStartTime = params.get("startTime");
    const urlEndTime = params.get("endTime");
    const urlSegments = params.get("segments");
    const urlZoom = params.get("zoom");
    const urlTitle = params.get("title");
    const urlDescription = params.get("description");
    const urlDemoId = params.get("demoId");
    const urlAspectRatio = params.get("aspectRatio");
    const urlBrowserFrame = params.get("browserFrame");

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

      if (urlDemoId) {
        setSavedDemoId(urlDemoId);
      }
      const normalizedAspectRatio = normalizeAspectRatio(urlAspectRatio);
      if (normalizedAspectRatio) {
        setAspectRatio(normalizedAspectRatio);
      }
      if (urlBrowserFrame) {
        try {
          const parsed = JSON.parse(urlBrowserFrame) as {
            mode?: string;
            drawShadow?: boolean;
            drawBorder?: boolean;
          };
          const mode = normalizeBrowserFrameMode(parsed.mode ?? null);
          if (mode) {
            setBrowserFrameMode(mode);
          }
          if (typeof parsed.drawShadow === "boolean") {
            setBrowserFrameDrawShadow(parsed.drawShadow);
          }
          if (typeof parsed.drawBorder === "boolean") {
            setBrowserFrameDrawBorder(parsed.drawBorder);
          }
        } catch {
          const mode = normalizeBrowserFrameMode(urlBrowserFrame);
          if (mode) {
            setBrowserFrameMode(mode);
          }
        }
      }

      // Load segments if provided
      if (urlSegments) {
        try {
          const segments = JSON.parse(urlSegments);
          console.log("Loaded segments from URL:", segments);
          const convertedSegments = segments.map((seg: { start: string; end: string }) => ({
            start: seg.start,
            end: seg.end,
          }));
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
    setSavedDemoId,
    setAspectRatio,
    setBrowserFrameMode,
    setBrowserFrameDrawShadow,
    setBrowserFrameDrawBorder,
    formatTimeForInput,
  ]);
}

export function useFormatTime() {
  const formatTimeForInput = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return { formatTimeForInput };
}
