import { useEffect } from "react";

import { ZoomEffect } from "@/app/types/editor/zoom-effect";
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
    if (!videoUrl && blob) {
      setVideoUrl(URL.createObjectURL(blob));
    }
  }, [videoUrl, blob, setVideoUrl]);

  useEffect(() => {
    if (!params) {
      return;
    }
    if (!videoUrl && recordedVideoUrl && !params.get("video")) {
      setVideoUrl(recordedVideoUrl);
    }
  }, [videoUrl, recordedVideoUrl, params, setVideoUrl]);

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
