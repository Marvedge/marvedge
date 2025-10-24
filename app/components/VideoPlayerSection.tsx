import ReactPlayer from "react-player";
import Image from "next/image";
import VideoPreview from "@/app/components/VideoPreview";
import SimpleTimeline from "@/app/components/SimpleTimeline";
import RecordingTimeline from "@/app/components/RecordingTimeline";

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
  const renderVideoPlayer = (url: string, isUploaded: boolean = false) => (
    <div className="w-full max-w-[900px] mx-auto">
      <div className="bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300">
        <div className="w-full h-auto aspect-video bg-[#F6F3FF] rounded-b-2xl overflow-hidden">
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
              // Ensure currentTime starts from 0 immediately
              if (playedSeconds === 0) {
                setVideoCurrentTime(0);
              } else {
                setVideoCurrentTime(playedSeconds);
              }
            }}
            onDuration={(dur) => {
              // Only set videoDuration if recordingDuration is not available (for uploaded videos)
              if (
                isUploaded &&
                recordingDuration === 0 &&
                isFinite(dur) &&
                !isNaN(dur) &&
                dur > 0
              ) {
                setVideoDuration(dur);
              } else if (
                !isUploaded &&
                isFinite(dur) &&
                !isNaN(dur) &&
                dur > 0
              ) {
                setVideoDuration(dur);
              }
            }}
            onStart={() => {
              // Ensure currentTime starts from 0 when video starts
              setVideoCurrentTime(0);
            }}
            onPlay={() => {
              // Ensure currentTime is 0 when video starts playing
              setVideoCurrentTime(0);
            }}
            onEnded={() => setVideoPlaying(false)}
            onReady={() => {
              console.log("Video loaded in recorder");
              // Only try to get duration if recordingDuration is not available (for uploaded videos)
              if (isUploaded && recordingDuration === 0) {
                // Try to get duration immediately when video is ready
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

                // Additional attempts with delays
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
                // For recorded videos, try to get duration
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
    <div className="flex justify-center mb-4 sm:mb-8">
      {uploadedFileType?.startsWith("image/") ? (
        <div
          className="border-2 border-[#6C63FF] rounded-2xl mx-auto"
          style={{ maxWidth: 900, background: "#000" }}
        >
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
          <div className="bg-white rounded-2xl shadow-md border border-[#E6E1FA] flex flex-col items-center justify-center transition-all duration-300">
            <div className="w-full h-auto aspect-video bg-[#F6F3FF] rounded-b-2xl overflow-hidden">
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
          No preview available. Start screen sharing or upload a video to see
          the preview.
        </div>
      )}
    </div>
  );
}
