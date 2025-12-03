"use client";
import { useRef, useCallback } from "react";
import ReactPlayer from "react-player";
import { useRouter } from "next/navigation";
import { useBlobStore } from "@/app/store/blobStore";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import RecorderTopbar from "@/app/components/RecorderTopbar";
import { videoToMP4 } from "@/app/lib/ffmpeg";
// import Image from "next/image";
import { toast, Toaster } from "sonner";
import { useSession } from "next-auth/react";
import SavePopupForm from "@/app/components/SavePopupForm";
import { sanitizeFilename } from "@/app/lib/constants";

// Import custom hooks
import { useRecorderState, useRecordingTimer } from "./hooks/useRecorderState";
import { useCameraControls } from "./hooks/useCameraControls";
import { useVideoDuration } from "./hooks/useVideoDuration";

// Import components
import VideoPlayerSection from "@/app/components/VideoPlayerSection";
import RecordingControls from "@/app/components/RecordingControls";
import InitialRecorderView from "@/app/components/InitialRecorderView";
// import { TutorialRecorder } from "@/app/components/TutorialRecorder";
export default function RecorderPage() {
  const videoPlayerRef = useRef<ReactPlayer>(null);
  const router = useRouter();
  //const saveSessionRef = useRef<Set<string>>(new Set());
  const isProcessingRef = useRef(false);
  // const [recordingMode, setRecordingMode] = useState<"standard" | "tutorial">("standard");

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
    // isSavePublishDisabled,
    // setIsSavePublishDisabled,
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

  // const handleSaveAndPublish = () => {
  //   if (!blob) {
  //     return;
  //   }

  //   // Prevent multiple clicks using useRef (most reliable)
  //   if (isProcessingRef.current) {
  //     toast.error("Already processing, please wait!");
  //     return;
  //   }

  //   // Prevent multiple saves
  //   if (isSavePublishDisabled) {
  //     return;
  //   }

  //   // Create unique key for this recording
  //   const recordKey = `${blob.size}|${videoUrl || ""}|${new Date().toISOString().split("T")[0]}`;

  //   // Check if this recording was already saved in this session
  //   if (saveSessionRef.current.has(recordKey)) {
  //     toast.error("This recording has already been saved in this session!");
  //     return;
  //   }

  //   // Mark as processing and track this save
  //   isProcessingRef.current = true;
  //   setIsSavePublishDisabled(true);
  //   saveSessionRef.current.add(recordKey);

  //   setShowSavePopup(true);
  // };

  const handlePopupDownload = async (data: { title: string; format: string }) => {
    if (!blob) {
      isProcessingRef.current = false;
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
      // Reset processing flag on error so user can try again
      isProcessingRef.current = false;
    } finally {
      setProcessingDownload(false);
    }
  };

  // UI after user selects a screen/tab (screenStream is set) or uploads a video file
  if (screenStream || uploadedFileUrl) {
    const isUploaded = !!uploadedFileUrl && !screenStream;
    return (
      <div
        className="flex flex-col h-screen w-full overflow-hidden"
        style={{ fontFamily: "var(--font-raleway)" }}
      >
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
              {/* {!recording && (videoUrl || uploadedFileUrl) ? (
                <button
                  onClick={handleSaveAndPublish}
                  disabled={isSavePublishDisabled}
                  className={`mt-2 sm:mt-0 px-4 sm:px-5 py-2 rounded-lg text-white font-semibold shadow 
                  transition flex items-center gap-2 text-sm sm:text-base
                  backdrop-blur-sm bg-[#8A76FC]/80 
                  ${
                    isSavePublishDisabled
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:bg-[#8A76FC]/90"
                  }`}
                >
                  <Image
                    src="/icons/1.png"
                    alt="Save"
                    width={20}
                    height={20}
                    className="md:w-6 md:h-6"
                  />
                  {isSavePublishDisabled ? " Saved" : "Save & Publish"}
                </button>
              ) : null} */}
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/*  */}
              <div className="bg-white rounded-2xl shadow p-4 sm:p-8 flex-1 overflow-y-auto ml-4 sm:ml-12 mr-4 sm:mr-12">
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
                  saveMessage={saveMessage}
                  videoPreview={videoPreview}
                  startScreenShare={startScreenShare}
                  stopRecording={stopRecording}
                  setEnableCamera={setEnableCamera}
                  startCamera={startCamera}
                  stopCamera={stopCamera}
                  setUploadedFileUrl={setUploadedFileUrl}
                  setUploadedFileType={setUploadedFileType}
                  setBlob={setBlob}
                  reset={reset}
                  onEditVideo={handleEditVideo}
                  fileInputRef={fileInputRef}
                />
              </div>
            </div>
          </main>
        </div>

        {/* Hidden file input for upload */}
        <input
          type="file"
          accept="video/mp4,video/webm,video/*"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const fileUrl = URL.createObjectURL(file);
              setUploadedFileUrl(fileUrl);
              setUploadedFileType(file.type);
              setBlob(file);
              toast.success("File uploaded successfully!");
            }
          }}
        />

        {/* Save Popup Form */}
        <SavePopupForm
          isOpen={showSavePopup}
          onClose={() => {
            setShowSavePopup(false);
            isProcessingRef.current = false;
          }}
          onDownload={handlePopupDownload}
          initialTitle={title}
          processing={processingDownload}
        />
      </div>
    );
  }

  // Initial UI (no recording or uploaded video)
  // TUTORIAL MODE COMMENTED OUT - Only standard recording mode is available
  // if (recordingMode === "tutorial") {
  //   return (
  //     <div
  //       className="flex flex-col h-screen w-full overflow-hidden"
  //       style={{ fontFamily: "var(--font-raleway)" }}
  //     >
  //       <Toaster position="top-right" />
  //       <RecorderTopbar onBack={handleBack} userInitials={initials} />
  //       <div className="flex flex-col h-full overflow-hidden">
  //         <div className="border-b border-gray-200 bg-white">
  //           <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  //             <div className="flex gap-4">
  //               <button
  //                 onClick={() => setRecordingMode("standard")}
  //                 className="px-4 py-3 text-gray-700 font-medium border-b-2 border-transparent hover:border-gray-300"
  //               >
  //                 Standard Recording
  //               </button>
  //               <button
  //                 onClick={() => setRecordingMode("tutorial")}
  //                 className="px-4 py-3 text-blue-600 font-medium border-b-2 border-blue-600"
  //               >
  //                 Tutorial Slideshow
  //               </button>
  //             </div>
  //           </div>
  //         </div>
  //         <div className="flex-1 overflow-hidden">
  //           <TutorialRecorder />
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div
      className="flex flex-col h-screen w-full overflow-hidden"
      style={{ fontFamily: "var(--font-raleway)" }}
    >
      <Toaster position="top-right" />
      <RecorderTopbar onBack={handleBack} userInitials={initials} />
      {/* MODE SELECTOR COMMENTED OUT - Only standard recording is available */}
      {/* <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4">
            <button
              onClick={() => setRecordingMode("standard")}
              className="px-4 py-3 text-blue-600 font-medium border-b-2 border-blue-600"
            >
              Standard Recording
            </button>
            <button
              onClick={() => setRecordingMode("tutorial")}
              className="px-4 py-3 text-gray-700 font-medium border-b-2 border-transparent hover:border-gray-300"
            >
              Tutorial Slideshow
            </button>
          </div>
        </div>
      </div> */}
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

      {/* Screen Share Modal */}
      {/* <ScreenShareModal
        isOpen={showScreenShareModal}
        onCancel={() => setShowScreenShareModal(false)}
        onShare={handleConfirmScreenShare}
        micEnabled={micEnabled}
        onToggleMic={toggleMic}
      /> */}

      {/* Save Popup Form */}
      <SavePopupForm
        isOpen={showSavePopup}
        onClose={() => {
          setShowSavePopup(false);
          isProcessingRef.current = false;
        }}
        onDownload={handlePopupDownload}
        initialTitle={title}
        processing={processingDownload}
      />
    </div>
  );
}
