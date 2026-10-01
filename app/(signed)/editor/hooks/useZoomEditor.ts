import React, { useCallback, useEffect } from "react";
import { toast } from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";

import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { useZoomStore, type ExtensionClickEvent } from "@/app/store/editor/zoomStore";
import { clamp } from "../utils/clamp";
import { computeZoomPreview } from "../utils/zoomPreview";
import type { EditorState } from "../apiTypes";

type EditorMode = "main" | "trim" | "zoom" | "text";

interface UseZoomEditorProps {
  editorState: EditorState;
  zoomFocusStageRef: React.RefObject<HTMLDivElement | null>;
  lastInteractionRef: React.RefObject<number>;
  mode: EditorMode;
}

// Every zoom-store value and action this hook exposes, in one shallow subscription.
function useZoomStoreBindings() {
  const state = useZoomStore(
    useShallow((s) => ({
      activeZoomIdx: s.activeZoomIdx,
      zoomSegments: s.zoomSegments,
      zoomLevel: s.zoomLevel,
      isDraggingZoomTarget: s.isDraggingZoomTarget,
      showZoomModal: s.showZoomModal,
      extensionEvents: s.extensionEvents,
      hasAppliedAutoZoom: s.hasAppliedAutoZoom,
    }))
  );

  const setActiveZoomIdx = useZoomStore((s) => s.setActiveZoomIdx);
  const setZoomSegments = useZoomStore((s) => s.setZoomSegments);
  const setZoomLevel = useZoomStore((s) => s.setZoomLevel);
  const setIsDraggingZoomTarget = useZoomStore((s) => s.setIsDraggingZoomTarget);
  const setShowZoomModal = useZoomStore((s) => s.setShowZoomModal);
  const setExtensionEvents = useZoomStore((s) => s.setExtensionEvents);
  const setHasAppliedAutoZoom = useZoomStore((s) => s.setHasAppliedAutoZoom);

  return {
    ...state,
    setActiveZoomIdx,
    setZoomSegments,
    setZoomLevel,
    setIsDraggingZoomTarget,
    setShowZoomModal,
    setExtensionEvents,
    setHasAppliedAutoZoom,
  };
}

// Listen for timeline messages from the extension content script.
function useExtensionTimelineListener(
  setExtensionEvents: ReturnType<typeof useZoomStoreBindings>["setExtensionEvents"]
) {
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      // only our own page's content script may feed the editor
      if (event.source !== window) {
        return;
      }
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data && event.data.source === "marvedge-extension") {
        if (event.data.type === "SEND_TIMELINE" && event.data.lastSession) {
          const timeline = event.data.lastSession.eventsTimeline || [];
          console.log("[Marvedge Editor] Received events timeline from extension:", timeline);
          if (timeline.length > 0) {
            setExtensionEvents(timeline);
          }
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage);

    // Prompt extension to send the last session event timeline
    const timer = setTimeout(() => {
      window.postMessage(
        { source: "marvedge-web", action: "GET_LAST_SESSION" },
        window.location.origin
      );
    }, 800);

    return () => {
      window.removeEventListener("message", handleExtensionMessage);
      clearTimeout(timer);
    };
  }, [setExtensionEvents]);
}

// Turn recorded click events into zoom segments, dropping any click landing
// within 250ms of one already kept (guards against double-zoom stutters).
function buildAutoZoomSuggestions(extensionEvents: ExtensionClickEvent[]): ZoomEffect[] {
  const suggestions: ZoomEffect[] = extensionEvents
    .filter((e) => e.event_type === "click" && e.coordinates)
    .map((event, index) => {
      const clickTimeSec = event.timestamp_ms / 1000;
      return {
        id: `auto-zoom-${index}-${Date.now()}`,
        startTime: Math.max(0, clickTimeSec - 0.3), // start 300ms before click
        endTime: clickTimeSec + 2.2, // end 2.2s after click
        zoomLevel: 1.8, // default 1.8x zoom level
        x: event.coordinates.x,
        y: event.coordinates.y,
      };
    });

  const debounced: ZoomEffect[] = [];
  suggestions.forEach((suggest) => {
    const isTooClose = debounced.some(
      (existing) => Math.abs(existing.startTime - suggest.startTime) < 0.25
    );
    if (!isTooClose) {
      debounced.push(suggest);
    }
  });

  return debounced;
}

export function useZoomEditor({
  editorState,
  zoomFocusStageRef,
  lastInteractionRef,
  mode,
}: UseZoomEditorProps) {
  const { currentTime, playerRef } = editorState;

  // Zoom state now lives in the zoom store (issue #150). This hook is a thin shim
  // over it: it keeps the same effects/handlers and returns the same shape so
  // EditorClient and every downstream consumer stay untouched.
  const {
    activeZoomIdx,
    zoomSegments,
    zoomLevel,
    isDraggingZoomTarget,
    showZoomModal,
    extensionEvents,
    hasAppliedAutoZoom,
    setActiveZoomIdx,
    setZoomSegments,
    setZoomLevel,
    setIsDraggingZoomTarget,
    setShowZoomModal,
    setExtensionEvents,
    setHasAppliedAutoZoom,
  } = useZoomStoreBindings();

  useExtensionTimelineListener(setExtensionEvents);

  // Convert click events to ZoomEffect segments
  const applyAutoZoomSuggestions = useCallback(() => {
    if (extensionEvents.length === 0) {
      return;
    }

    const debouncedSuggestions = buildAutoZoomSuggestions(extensionEvents);

    if (debouncedSuggestions.length === 0) {
      toast.error("No valid click zoom events found to apply.");
      return;
    }

    setZoomSegments((prev) => {
      // Merge with existing zoom segments and sort by time
      const merged = [...prev, ...debouncedSuggestions];
      return merged.sort((a, b) => a.startTime - b.startTime);
    });

    setHasAppliedAutoZoom(true);
    toast.success(`Successfully applied ${debouncedSuggestions.length} auto-zoom highlights!`);
  }, [extensionEvents, setZoomSegments, setHasAppliedAutoZoom]);

  const preview = computeZoomPreview({ zoomSegments, activeZoomIdx, currentTime });
  const { resolvedZoomIdx, activeEditedZoomSegment, shouldShowZoomFocusBox } = preview;

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
    [resolvedZoomIdx, shouldShowZoomFocusBox, zoomFocusStageRef, setZoomSegments]
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
    [activeEditedZoomSegment, updateZoomTargetFromPointer, setIsDraggingZoomTarget]
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
  }, [isDraggingZoomTarget, updateZoomTargetFromPointer, setIsDraggingZoomTarget]);

  useEffect(() => {
    if (activeZoomIdx === -1 && zoomSegments.length > 0) {
      setActiveZoomIdx(0);
    }
  }, [activeZoomIdx, zoomSegments.length, setActiveZoomIdx]);

  useEffect(() => {
    if (!currentTime) {
      return;
    }

    const segment = zoomSegments.find(
      (z) => currentTime >= z.startTime && currentTime <= z.endTime
    );

    if (segment) {
      setZoomLevel(segment.zoomLevel);
    } else {
      setZoomLevel(1);
    }
    if (mode === "zoom" && activeZoomIdx != -1) {
      if (Date.now() - lastInteractionRef.current < 500) {
        return;
      }
      const zoomInfo = zoomSegments[activeZoomIdx];
      if (zoomInfo && currentTime >= zoomInfo.endTime) {
        playerRef.current.seekTo(zoomInfo.startTime, "seconds");
      }
    }
  }, [activeZoomIdx, currentTime, mode, playerRef, zoomSegments, lastInteractionRef, setZoomLevel]);

  return {
    activeZoomIdx,
    setActiveZoomIdx,
    zoomSegments,
    setZoomSegments,
    zoomLevel,
    isDraggingZoomTarget,
    showZoomModal,
    setShowZoomModal,
    handleZoomTargetMouseDown,
    preview,
    extensionEvents,
    hasAppliedAutoZoom,
    applyAutoZoomSuggestions,
    setExtensionEvents,
  };
}
