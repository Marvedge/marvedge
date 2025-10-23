"use client";
import { useRef, useCallback } from "react";
import ReactPlayer from "react-player";
import { useRouter } from "next/navigation";
import { useBlobStore } from "@/app/store/blobStore";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import RecorderTopbar from "./components/RecorderTopbar";
import { videoToMP4 } from "@/app/lib/ffmpeg";
import Image from "next/image";
import { toast, Toaster } from "sonner";
import { useSession } from "next-auth/react";
import SavePopupForm from "@/app/components/SavePopupForm";
import { sanitizeFilename } from "@/app/lib/constants";

// Import custom hooks
import { useRecorderState, useRecordingTimer } from "./hooks/useRecorderState";
import { useCameraControls } from "./hooks/useCameraControls";
import { useVideoDuration } from "./hooks/useVideoDuration";

// Import components
import VideoPlayerSection from "./components/VideoPlayerSection";
import RecordingControls from "./components/RecordingControls";
import InitialRecorderView from "./components/InitialRecorderView";

export default function RecorderPage() {
  const videoPlayerRef = useRef<ReactPlayer>(null);
  const router = useRouter();

  const handleBack = useCallback(() => {
    try {
      router.back();
    } catch (error) {
      console.error("Navigation error:", error);
    }
  }, [router]);

  const handleEditVideo = useCallback(() => {
    try {
      router.push("/editor");
    } catch (error) {
      console.error("Navigation error:", error);
    }
  }, [router]);

  // Use custom hooks for state management
  const {
    uploadMessage,
    setUploadMessage,
    uploadedFileUrl,
    setUploadedFileUrl,
    uploadedFileType,
    setUploadedFileType,
    format,
    setFormat,
    saveMessage,
    recordingTimer,
    setRecordingTimer,
    showSavePopup,
    setShowSavePopup,
    processingDownload,
    setProcessingDownload,
    videoPlaying,
    setVideoPlaying,
    videoCurrentTime,
    setVideoCurrentTime,
    videoDuration,
    setVideoDuration,
    sidebarOpen,
    setSidebarOpen,
    fileInputRef,
    recordingIntervalRef,
  } = useRecorderState();

  const { cameraStream, enableCamera, setEnableCamera, videoPreview, startCamera, stopCamera } =
    useCameraControls();

  const { setBlob, blob, title, setTitle } = useBlobStore();

  const {
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
    screenStream,
    startScreenShare,
    recordingDuration,
    reset,
  } = useScreenRecorder();

  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";

  // Use custom hooks for side effects
  useRecordingTimer(recording, recordingIntervalRef, setRecordingTimer);
  useVideoDuration({
    videoUrl,
    uploadedFileUrl,
    videoDuration,
    recordingDuration,
    setVideoDuration,
    videoPlayerRef,
  });

  const handleSaveAndPublish = () => {
    if (!blob) {
      return;
    }
    setShowSavePopup(true);
  };

  const handlePopupDownload = async (data: { title: string; format: string }) => {
    if (!blob) {
      return;
    }

    setProcessingDownload(true);
    try {
      if (data.format === "mp4") {
        const outputBlob = await videoToMP4(blob);
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.mp4`;
        a.click();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.webm`;
        a.click();
      }
      toast.success("Video downloaded successfully!");
      setShowSavePopup(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download video.");
    } finally {
      setProcessingDownload(false);
    }
  };

  // UI after user selects a screen/tab (screenStream is set) or uploads a video file
  if (screenStream || uploadedFileUrl) {
    const isUploaded = !!uploadedFileUrl && !screenStream;
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden">
        <RecorderTopbar onBack={handleBack} userInitials={initials} />
        <div className="flex flex-1 overflow-hidden">
          {/* Right Panel */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* New Recording Header Bar */}
            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
              <div>
                <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">
                  New Recording
                </div>
                <div className="text-xs sm:text-sm text-gray-400">Last saved 2 minutes ago</div>
              </div>
              {!isUploaded && !recording && videoUrl && (
                <button
                  onClick={handleSaveAndPublish}
                  className="mt-2 sm:mt-0 px-4 sm:px-5 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition flex items-center gap-2 text-sm sm:text-base"
                >
                  <Image
                    src="/icons/1.png"
                    alt="Save"
                    width={20}
                    height={20}
                    className="md:w-6 md:h-6"
                  />
                  Save & Publish
                </button>
              )}
            </div>
            <div className="flex-1 px-2 sm:px-4 pb-2 sm:pb-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow p-4 sm:p-8">
                <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4 text-[#6C63FF]">
                  Preview
                </h2>
                <VideoPlayerSection
                  uploadedFileType={uploadedFileType}
                  uploadedFileUrl={uploadedFileUrl}
                  videoUrl={videoUrl}
                  screenStream={screenStream}
                  recording={recording}
                  videoPlaying={videoPlaying}
                  setVideoPlaying={setVideoPlaying}
                  videoCurrentTime={videoCurrentTime}
                  setVideoCurrentTime={setVideoCurrentTime}
                  videoDuration={videoDuration}
                  setVideoDuration={setVideoDuration}
                  recordingDuration={recordingDuration}
                  recordingTimer={recordingTimer}
                  videoPlayerRef={videoPlayerRef}
                />
                <RecordingControls
                  screenStream={screenStream}
                  recording={recording}
                  isUploaded={isUploaded}
                  videoUrl={videoUrl}
                  cameraStream={cameraStream}
                  enableCamera={enableCamera}
                  format={format}
                  saveMessage={saveMessage}
                  videoPreview={videoPreview}
                  startScreenShare={startScreenShare}
                  stopRecording={stopRecording}
                  setEnableCamera={setEnableCamera}
                  startCamera={startCamera}
                  stopCamera={stopCamera}
                  setFormat={setFormat}
                  setUploadedFileUrl={setUploadedFileUrl}
                  setUploadedFileType={setUploadedFileType}
                  setBlob={setBlob}
                  reset={reset}
                  handleSaveAndPublish={handleSaveAndPublish}
                  onEditVideo={handleEditVideo}
                />
              </div>
            </div>
          </main>
        </div>

        {/* Save Popup Form */}
        <SavePopupForm
          isOpen={showSavePopup}
          onClose={() => setShowSavePopup(false)}
          onDownload={handlePopupDownload}
          initialTitle={title}
          processing={processingDownload}
        />
      </div>
    );
  }

  // Initial UI (no recording or uploaded video)
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <Toaster position="top-right" />
      <RecorderTopbar onBack={handleBack} userInitials={initials} />
      <InitialRecorderView
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        title={title}
        setTitle={setTitle}
        uploadedFileUrl={uploadedFileUrl}
        setUploadedFileUrl={setUploadedFileUrl}
        setUploadedFileType={setUploadedFileType}
        setUploadMessage={setUploadMessage}
        uploadMessage={uploadMessage}
        fileInputRef={fileInputRef}
        startScreenShare={startScreenShare}
        toggleMic={toggleMic}
        micEnabled={micEnabled}
      />

      {/* Save Popup Form */}
      <SavePopupForm
        isOpen={showSavePopup}
        onClose={() => setShowSavePopup(false)}
        onDownload={handlePopupDownload}
        initialTitle={title}
        processing={processingDownload}
      />
    </div>
  );
}
