import React from "react";
import { useShallow } from "zustand/react/shallow";

import CustomVideoControls from "@/app/components/CustomVideoControls";
import { useEditorStore } from "@/app/store/editor/editorStore";
import EditorTimelineSection from "./EditorTimelineSection";
import EditorVideoStage from "./EditorVideoStage";
import TextColorToolbar from "./TextColorToolbar";
import WtmPreviewOverlay from "./WtmPreviewOverlay";
import { computePreviewLayout } from "../utils/previewLayout";
import type { EditorState, SubtitlesApi, TextOverlaysApi, ZoomEditorApi } from "../apiTypes";

type EditorMode = "main" | "trim" | "zoom" | "text";

interface EditorPreviewRegionProps {
  text: TextOverlaysApi;
  zoom: ZoomEditorApi;
  subtitles: SubtitlesApi;
  playerRef: EditorState["playerRef"];
  canvasRef: EditorState["canvasRef"];
  videoContainerRef: EditorState["videoContainerRef"];
  isDark: boolean;
  processing: boolean;
  nativeAspectRatio: string;
  resolvedDuration: number;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  mode: EditorMode;
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  segments: { start: number; end: number }[];
  setSegments: React.Dispatch<React.SetStateAction<{ start: number; end: number }[]>>;
  childHandleProgress: null | ((data: { playedSeconds: number }) => void);
  setChildHandleProgress: (handler: null | ((data: { playedSeconds: number }) => void)) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleFullscreen: () => void;
  getBackgroundStyle: () => React.CSSProperties;
  handleTimelineChange: (start: number, end: number) => void;
  handleResetTimeline: () => void;
  zoomFocusStageRef: React.RefObject<HTMLDivElement | null>;
  lastInteractionRef: React.RefObject<number>;
  isDraggingTimelineRef: React.RefObject<boolean>;
}

type PreviewLayout = ReturnType<typeof computePreviewLayout>;

// The export-framed video card. Dark mode paints a gradient border; light mode
// uses the configured browser-frame border/shadow.
function buildVideoCardStyle(layout: PreviewLayout, isDark: boolean): React.CSSProperties {
  const { previewFrameAspectRatio, stageHeight, stageMaxWidth, hasCanvasBackground } = layout;
  const { browserFrameBorder, browserFrameShadow } = layout;

  // computePreviewLayout collapses both toggles to "none" when off; dark mode
  // mirrors the same toggles (gradient border + purple glow).
  const drawBorder = browserFrameBorder !== "none";
  const drawShadow = browserFrameShadow !== "none";

  const darkCardFill = hasCanvasBackground
    ? "linear-gradient(#F6F3FF, #F6F3FF)"
    : "linear-gradient(#000000, #000000)";

  return {
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
    background: isDark
      ? drawBorder
        ? `${darkCardFill} padding-box, linear-gradient(135deg, #6c4cff, #8b73ff) border-box`
        : darkCardFill
      : hasCanvasBackground
        ? "#F6F3FF"
        : "#000000",
    border: isDark ? (drawBorder ? "1px solid transparent" : "none") : browserFrameBorder,
    boxShadow: isDark
      ? drawShadow
        ? "0 14px 34px rgba(255, 255, 255, 0.22), 0 0 22px rgba(139, 115, 255, 0.28)"
        : "none"
      : browserFrameShadow,
    transition: "width 0.3s ease, height 0.3s ease",
  };
}

// Prompts the user to turn recorded click events into zoom effects. Renders
// nothing once there are no suggestions left, or after they have been applied.
function AutoZoomSuggestionBanner({ zoom }: { zoom: ZoomEditorApi }) {
  if (!zoom.extensionEvents || zoom.extensionEvents.length === 0 || zoom.hasAppliedAutoZoom) {
    return null;
  }

  return (
    <div className="w-full max-w-[1120px] mx-auto mb-4 p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-purple-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="text-xl">🔍</span>
        <div>
          <h4 className="text-sm font-semibold text-purple-950">
            Auto-Zoom suggestions available!
          </h4>
          <p className="text-xs text-purple-800">
            We detected {zoom.extensionEvents.length} click event(s) in your recording. Apply them
            to automatically zoom in on your clicks.
          </p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={zoom.applyAutoZoomSuggestions}
          className="px-4 py-2 bg-[#8A76FC] hover:bg-[#7c66f5] text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-200 cursor-pointer"
        >
          Apply Zoom Highlights
        </button>
        <button
          onClick={() => zoom.setExtensionEvents([])}
          className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Every editor-store value the preview region reads, in a single shallow subscription.
function usePreviewStoreState() {
  return useEditorStore(
    useShallow((s) => ({
      videoUrl: s.videoUrl,
      selectedBackground: s.selectedBackground,
      isFullscreen: s.isFullscreen,
      tool: s.tool,
      aspectRatio: s.aspectRatio,
      browserFrameDrawBorder: s.browserFrameDrawBorder,
      browserFrameDrawShadow: s.browserFrameDrawShadow,
      currentTime: s.currentTime,
      setCurrentTime: s.setCurrentTime,
      playing: s.playing,
      setPlaying: s.setPlaying,
      volume: s.volume,
      setVolume: s.setVolume,
      textColor: s.textColor,
      setTextColor: s.setTextColor,
      textFont: s.textFont,
      setTextFont: s.setTextFont,
    }))
  );
}

export default function EditorPreviewRegion(props: EditorPreviewRegionProps) {
  const { text, zoom, subtitles, isDark, processing, nativeAspectRatio } = props;
  const { playerRef, canvasRef, videoContainerRef } = props;
  const { resolvedDuration, playbackSpeed, setPlaybackSpeed, mode, setMode } = props;
  const { segments, setSegments, childHandleProgress, setChildHandleProgress } = props;
  const { handleMouseDown, handleMouseUp, handleFullscreen, getBackgroundStyle } = props;
  const { handleTimelineChange, handleResetTimeline } = props;
  const { zoomFocusStageRef, lastInteractionRef, isDraggingTimelineRef } = props;

  const {
    videoUrl,
    selectedBackground,
    isFullscreen,
    tool,
    aspectRatio,
    browserFrameDrawBorder,
    browserFrameDrawShadow,
    currentTime,
    setCurrentTime,
    playing,
    setPlaying,
    volume,
    setVolume,
    textColor,
    setTextColor,
    textFont,
    setTextFont,
  } = usePreviewStoreState();

  const layout = computePreviewLayout({
    selectedBackground,
    aspectRatio,
    nativeAspectRatio,
    browserFrameDrawBorder,
    browserFrameDrawShadow,
    isFullscreen,
  });
  const { hasCanvasBackground, previewObjectFit } = layout;

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div className="mt-3" />

      <AutoZoomSuggestionBanner zoom={zoom} />

      <div className="flex flex-col items-center w-full max-w-[1200px] mx-auto rounded-2xl bg-transparent">
        <div
          ref={videoContainerRef}
          className={`monitor-viewport relative w-full max-w-[1120px] sm:h-auto rounded-2xl border ${
            isFullscreen ? "border-[#7C5CFC] shadow-lg" : "border-[#E6E1FA]"
          } flex flex-col items-center justify-center mb-1 transition-all duration-300`}
          style={{
            aspectRatio: "16 / 9",
            minHeight: "160px",
            padding: `${layout.stageContainerPadY}px ${selectedBackground ? "0px" : "5px"}`,
            boxShadow: "0 4px 24px 0 #E6E1FA",
            ...getBackgroundStyle(),
          }}
        >
          <div className="editor-video-card" style={buildVideoCardStyle(layout, isDark)}>
            <EditorVideoStage
              text={text}
              zoom={zoom}
              subtitles={subtitles}
              canvasRef={canvasRef}
              playerRef={playerRef}
              hasCanvasBackground={hasCanvasBackground}
              previewObjectFit={previewObjectFit}
              playbackSpeed={playbackSpeed}
              handleMouseDown={handleMouseDown}
              handleMouseUp={handleMouseUp}
              setMode={setMode}
              childHandleProgress={childHandleProgress}
              zoomFocusStageRef={zoomFocusStageRef}
              lastInteractionRef={lastInteractionRef}
              isDraggingTimelineRef={isDraggingTimelineRef}
            />

            {/* WTM: the watermark + camera bubble the export will bake in,
                drawn over the card — which carries the export's aspect ratio,
                so the shared corner math lands where ffmpeg will put it.
                Renders nothing unless NEXT_PUBLIC_WTM_ENABLED is on. */}
            <WtmPreviewOverlay playbackSpeed={playbackSpeed} />
          </div>

          {videoUrl && (
            <div className="w-full flex flex-col gap-3 mt-5">
              <CustomVideoControls
                playerRef={playerRef}
                duration={resolvedDuration}
                currentTime={currentTime}
                setCurrentTime={(t) => {
                  lastInteractionRef.current = Date.now();
                  setCurrentTime(t);
                  playerRef.current?.seekTo(t, "seconds");
                }}
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
        <TextColorToolbar
          textColor={textColor}
          setTextColor={setTextColor}
          textFont={textFont}
          setTextFont={setTextFont}
        />
      )}

      {videoUrl && (
        <div className="mr-2 mt-8 mb-5 pr-8 sm:mr-0 mx-4 sm:mx-8">
          <EditorTimelineSection
            zoom={zoom}
            text={text}
            playerRef={playerRef}
            resolvedDuration={resolvedDuration}
            playbackSpeed={playbackSpeed}
            setPlaybackSpeed={setPlaybackSpeed}
            mode={mode}
            setMode={setMode}
            segments={segments}
            setSegments={setSegments}
            processing={processing}
            handleResetTimeline={handleResetTimeline}
            handleTimelineChange={handleTimelineChange}
            setChildHandleProgress={setChildHandleProgress}
            lastInteractionRef={lastInteractionRef}
            isDraggingTimelineRef={isDraggingTimelineRef}
          />
        </div>
      )}
    </div>
  );
}
