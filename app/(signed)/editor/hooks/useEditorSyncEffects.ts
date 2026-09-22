import { useEffect } from "react";

import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { useBlobStore } from "@/app/store/blobStore";
import type { EditorState } from "../apiTypes";

interface UseEditorSyncEffectsProps {
  editorState: EditorState;
  blob: Blob | null;
  recordedVideoUrl: string | null;
  formatTimeForInput: (seconds: number) => string;
  segments: { start: number; end: number }[];
  setSegments: (segments: { start: number; end: number }[]) => void;
  zoomSegments: ZoomEffect[];
  setZoomSegments: (segments: ZoomEffect[]) => void;
}

/**
 * Detect whether the current editor navigation provided an explicit `video` source.
 *
 * Checks both the Zustand store's parsed `params` and `window.location.search` directly
 * so that precedence is guaranteed even on the initial mount tick before effects populate
 * the store's `params`.
 */
export function hasExplicitVideoParam(
  params?: URLSearchParams | null,
  locationSearch?: string
): boolean {
  if (params?.get("video")) {
    return true;
  }
  if (locationSearch) {
    try {
      return Boolean(new URLSearchParams(locationSearch).get("video"));
    } catch {
      return false;
    }
  }
  if (typeof window !== "undefined" && window.location?.search) {
    try {
      return Boolean(new URLSearchParams(window.location.search).get("video"));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Pure helper to decide whether the editor should initialize videoUrl from a cached local blob.
 *
 * Precedence Rule:
 * Explicit ?video= URL > Cached / local blob
 *
 * When an explicit video URL is present in params or window.location, a cached blob must NEVER
 * overwrite or preempt the video source.
 */
export function shouldInitializeFromBlob({
  currentVideoUrl,
  hasBlob,
  params,
  locationSearch,
}: {
  currentVideoUrl: string | null;
  hasBlob: boolean;
  params?: URLSearchParams | null;
  locationSearch?: string;
}): boolean {
  if (currentVideoUrl) {
    return false;
  }
  if (!hasBlob) {
    return false;
  }
  if (hasExplicitVideoParam(params, locationSearch)) {
    return false;
  }
  return true;
}

export function useEditorSyncEffects({
  editorState,
  blob,
  recordedVideoUrl,
  formatTimeForInput,
  segments,
  setSegments,
  zoomSegments,
  setZoomSegments,
}: UseEditorSyncEffectsProps) {
  const {
    videoUrl,
    setVideoUrl,
    params,
    savedDemoId,
    setDemoSaved,
    currentSegments,
    zoomEffects,
    duration,
    timelineEndTime,
    setTimelineStartTime,
    setTimelineEndTime,
    setInputStartTime,
    setInputEndTime,
  } = editorState;

  const resolvedDuration = Math.max(0, duration || 0);

  useEffect(() => {
    if (
      shouldInitializeFromBlob({
        currentVideoUrl: videoUrl,
        hasBlob: Boolean(blob),
        params,
      })
    ) {
      const canonical = useBlobStore.getState().canonicalVideoUrl;
      if (canonical && (canonical.startsWith("http://") || canonical.startsWith("https://"))) {
        setVideoUrl(canonical);
      } else {
        setVideoUrl(URL.createObjectURL(blob!));
      }
    }
  }, [videoUrl, blob, params, setVideoUrl]);

  useEffect(() => {
    if (hasExplicitVideoParam(params)) {
      return;
    }
    // A cached/recorded blob URL must never overwrite an already-valid HTTPS video URL (e.g. from upload or param)
    if (videoUrl && !videoUrl.startsWith("blob:")) {
      return;
    }
    const canonical = useBlobStore.getState().canonicalVideoUrl;
    if (canonical && (canonical.startsWith("http://") || canonical.startsWith("https://"))) {
      return;
    }
    if (recordedVideoUrl) {
      setVideoUrl(recordedVideoUrl);
    }
  }, [recordedVideoUrl, videoUrl, params, setVideoUrl]);

  useEffect(() => {
    if (videoUrl && !savedDemoId) {
      setDemoSaved(false);
    }
  }, [videoUrl, savedDemoId, setDemoSaved]);

  useEffect(() => {
    if (savedDemoId) {
      setDemoSaved(true);
    }
  }, [savedDemoId, setDemoSaved]);

  // Seed the local timeline from loaded demo data once. The empty-length guards
  // keep these one-shot, so listing every dependency does not re-seed on edits.
  useEffect(() => {
    if (currentSegments.length === 0 || segments.length > 0) {
      return;
    }
    const numeric = currentSegments
      .map((s) => ({
        start: typeof s.start === "string" ? parseFloat(s.start) : Number(s.start),
        end: typeof s.end === "string" ? parseFloat(s.end) : Number(s.end),
      }))
      .filter((s) => !isNaN(s.start) && !isNaN(s.end));
    if (numeric.length > 0) {
      setSegments(numeric);
    }
  }, [currentSegments, segments.length, setSegments]);

  useEffect(() => {
    if (zoomEffects.length > 0 && zoomSegments.length === 0) {
      setZoomSegments(zoomEffects);
    }
  }, [zoomEffects, zoomSegments.length, setZoomSegments]);

  useEffect(() => {
    if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
      return;
    }
    if (timelineEndTime <= 0 || Math.abs(timelineEndTime - resolvedDuration) > 0.5) {
      setTimelineStartTime(0);
      setTimelineEndTime(resolvedDuration);
      setInputStartTime(formatTimeForInput(0));
      setInputEndTime(formatTimeForInput(resolvedDuration));
    }
  }, [
    resolvedDuration,
    timelineEndTime,
    setTimelineStartTime,
    setTimelineEndTime,
    setInputStartTime,
    setInputEndTime,
    formatTimeForInput,
  ]);
}
