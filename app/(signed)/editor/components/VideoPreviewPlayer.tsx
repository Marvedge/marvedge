import React from "react";
import ReactPlayer from "react-player";

import EmptyVideoState from "./EmptyVideoState";

interface VideoPreviewPlayerProps {
  videoUrl: string | null;
  playerRef: React.RefObject<ReactPlayer>;
  playing: boolean;
  volume: number;
  playbackSpeed: number;
  previewObjectFit: "contain";
  hasCanvasBackground: boolean;
  isDraggingTimelineRef: React.RefObject<boolean>;
  lastInteractionRef: React.RefObject<number>;
  setCurrentTime: (time: number) => void;
  childHandleProgress: null | ((data: { playedSeconds: number }) => void);
  setDuration: (duration: number | ((prev: number) => number)) => void;
  setPlaying: (playing: boolean) => void;
  duration: number;
  onUploadVideo?: (file: File) => Promise<string | null | void>;
  isUploading?: boolean;
}

export default function VideoPreviewPlayer({
  videoUrl,
  playerRef,
  playing,
  volume,
  playbackSpeed,
  previewObjectFit,
  hasCanvasBackground,
  isDraggingTimelineRef,
  lastInteractionRef,
  setCurrentTime,
  childHandleProgress,
  setDuration,
  setPlaying,
  duration,
  onUploadVideo,
  isUploading,
}: VideoPreviewPlayerProps) {
  return (
    <div className="w-full h-full">
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
              forceVideo: true,
              attributes: {
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
          onError={(e, data) => {
            const errStr = String(e);
            if (
              errStr.includes("play() request was interrupted") ||
              errStr.includes("AbortError")
            ) {
              return;
            }
            console.error("Video failed to load", e, "url:", videoUrl, "data:", data);
          }}
          onProgress={(data) => {
            if (isDraggingTimelineRef.current) {
              return;
            }

            if (Date.now() - lastInteractionRef.current < 500) {
              return;
            }

            if (duration > 0 && data.playedSeconds >= duration - 0.05) {
              setPlaying(false);
            }

            setCurrentTime(data.playedSeconds);
            childHandleProgress?.(data);
          }}
          onDuration={(loadedDuration) => {
            if (Number.isFinite(loadedDuration) && loadedDuration > 0) {
              const nextDuration = Math.ceil(loadedDuration);
              setDuration((prev) => Math.max(prev, nextDuration));
            }
          }}
          onEnded={() => setPlaying(false)}
          progressInterval={50}
        />
      ) : (
        <EmptyVideoState onUploadVideo={onUploadVideo} isUploading={isUploading} />
      )}
    </div>
  );
}
