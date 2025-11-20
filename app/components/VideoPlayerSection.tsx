import ReactPlayer from "react-player";
import Image from "next/image";
import VideoPreview from "@/app/components/VideoPreview";
import SimpleTimeline from "@/app/components/SimpleTimeline";
import RecordingTimeline from "@/app/components/RecordingTimeline";
import playIcon from "@/public/mingcute_play-fill.png";
import React, { useRef, useState } from "react";

interface VideoPlayerSectionProps {
  uploadedFileType: string | null;
  uploadedFileUrl: string | null;
  videoUrl: string | null;
  screenStream: MediaStream | null;
  recording: boolean;
  videoPlaying: boolean;
  setVideoPlaying: (playing: boolean) => void;
  videoCurrentTime: number;
  setVideoCurrentTime: (time: number) => void;
  videoDuration: number;
  setVideoDuration: (duration: number) => void;
  recordingDuration: number;
  recordingTimer: number;
  videoPlayerRef: React.RefObject<ReactPlayer | null>;
}

export default function VideoPlayerSection({
  uploadedFileType,
  uploadedFileUrl,
  videoUrl,
  screenStream,
  recording,
  videoPlaying,
  setVideoPlaying,
  videoCurrentTime,
  setVideoCurrentTime,
  videoDuration,
  setVideoDuration,
  recordingDuration,
  recordingTimer,
  videoPlayerRef,
}: VideoPlayerSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {
          console.log("Fullscreen request failed");
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    if (videoPlayerRef.current) {
      const player = videoPlayerRef.current.getInternalPlayer();
      if (player && player.volume !== undefined) {
        player.volume = newVolume;
      }
    }
  };

  const renderVideoPlayer = (url: string, isUploaded: boolean = false) => (
    <div className="w-full max-w-[900px] mx-auto">
      <div
        ref={containerRef}
        className="bg-white rounded-2xl shadow-md flex flex-col items-center justify-center transition-all duration-300"
      >
        <div className="relative w-full h-auto aspect-video bg-white rounded-2xl overflow-hidden group">
          {/* Top Control Bar */}
          <div className="absolute top-0 right-0 z-20 flex items-center gap-2 p-4 bg-linear-to-l rounded-bl-2xl">
            {/* Volume Control */}
            <div className="flex items-center gap-2 bg-black/40 rounded-full px-3 py-2 backdrop-blur-sm">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="text-white"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 accent-[#7C5CFC]"
                style={{ cursor: "pointer" }}
              />
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={handleFullscreen}
              className="bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition backdrop-blur-sm"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>
          <ReactPlayer
            ref={videoPlayerRef}
            url={url}
            playing={videoPlaying}
            controls={false}
            muted={false}
            width="100%"
            height="100%"
            style={{
              objectFit: "contain",
              borderRadius: "1.25rem",
              background: "#F6F3FF",
            }}
            progressInterval={50}
            onProgress={({ playedSeconds }) => {
              if (playedSeconds === 0) {
                setVideoCurrentTime(0);
              } else {
                setVideoCurrentTime(playedSeconds);
              }
            }}
            onDuration={(dur) => {
              if (
                isUploaded &&
                recordingDuration === 0 &&
                isFinite(dur) &&
                !isNaN(dur) &&
                dur > 0
              ) {
                setVideoDuration(dur);
              } else if (!isUploaded && isFinite(dur) && !isNaN(dur) && dur > 0) {
                setVideoDuration(dur);
              }
            }}
            onStart={() => {
              setVideoCurrentTime(0);
            }}
            onPlay={() => {
              setVideoCurrentTime(0);
            }}
            onEnded={() => setVideoPlaying(false)}
            onReady={() => {
              console.log("Video loaded in recorder");
              if (isUploaded && recordingDuration === 0) {
                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 10);

                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 100);

                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 500);
              } else if (!isUploaded) {
                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 10);

                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 100);

                setTimeout(() => {
                  if (videoPlayerRef.current) {
                    const player = videoPlayerRef.current.getInternalPlayer();
                    if (
                      player &&
                      player.duration &&
                      isFinite(player.duration) &&
                      player.duration > 0
                    ) {
                      setVideoDuration(player.duration);
                    }
                  }
                }, 500);
              }
            }}
            config={{
              file: {
                attributes: {
                  preload: "metadata",
                },
              },
            }}
          />

          {!videoPlaying && (
            <button
              onClick={() => setVideoPlaying(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
            >
              <div className="bg-white hover:bg-gray-100 rounded-full p-4 transition-all shadow-lg">
                <Image src={playIcon} alt="Play" width={32} height={32} className="w-8 h-8" />
              </div>
            </button>
          )}
        </div>
        <SimpleTimeline
          videoPlaying={videoPlaying}
          setVideoPlaying={setVideoPlaying}
          videoCurrentTime={videoCurrentTime}
          setVideoCurrentTime={setVideoCurrentTime}
          videoDuration={videoDuration}
          recordingDuration={recordingDuration}
          videoPlayerRef={videoPlayerRef}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center mb-4 sm:mb-8 w-full max-w-[900px] mx-auto">
      <div className="w-full">
        {uploadedFileType?.startsWith("image/") ? (
          <div className="rounded-2xl mx-auto" style={{ maxWidth: 900, background: "#000" }}>
            <Image
              src={uploadedFileUrl!}
              alt="Uploaded preview"
              style={{
                width: "100%",
                height: "auto",
                objectFit: "contain",
                background: "#000",
              }}
              width={900}
              height={500}
            />
          </div>
        ) : uploadedFileUrl && uploadedFileType?.startsWith("video/") ? (
          renderVideoPlayer(uploadedFileUrl, true)
        ) : videoUrl ? (
          renderVideoPlayer(videoUrl, false)
        ) : screenStream ? (
          <div className="w-full max-w-[900px] mx-auto">
            <div className="bg-white rounded-2xl shadow-md flex flex-col items-center justify-center transition-all duration-300">
              <div className="w-full h-auto aspect-video bg-white rounded-2xl overflow-hidden">
                <VideoPreview
                  videoUrl={null}
                  isRecording={recording}
                  screenStream={screenStream}
                  className="w-full h-full"
                  showControls={false}
                />
              </div>
              {recording && <RecordingTimeline recordingTimer={recordingTimer} />}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-300 rounded-2xl">
            No preview available. Start screen sharing or upload a video to see the preview.
          </div>
        )}
      </div>
    </div>
  );
}
