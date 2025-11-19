interface RecordingControlsProps {
  screenStream: MediaStream | null;
  recording: boolean;
  isUploaded: boolean;
  videoUrl: string | null;
  cameraStream: MediaStream | null;
  enableCamera: boolean;
  saveMessage: string;
  videoPreview: React.RefObject<HTMLVideoElement | null>;
  startScreenShare: () => void;
  stopRecording: () => void;
  setEnableCamera: (value: boolean | ((prev: boolean) => boolean)) => void;
  startCamera: () => void;
  stopCamera: () => void;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFileType: (type: string | null) => void;
  setBlob: (blob: Blob | null) => void;
  reset: () => void;
  onEditVideo?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function RecordingControls({
  screenStream,
  recording,
  isUploaded,
  videoUrl,
  cameraStream,
  enableCamera,
  saveMessage,
  videoPreview,
  startScreenShare,
  stopRecording,
  setEnableCamera,
  startCamera,
  stopCamera,
  setUploadedFileUrl,
  setUploadedFileType,
  setBlob,
  reset,
  onEditVideo,
  // fileInputRef,
}: RecordingControlsProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-6 justify-end">
        {screenStream && !recording && !isUploaded && !videoUrl && (
          <>
            <button
              onClick={() => {
                screenStream.getTracks().forEach((track) => track.stop());
                startScreenShare();
              }}
              className="bg-[#8A76FC] text-white px-4 sm:px-8 py-2 rounded-lg font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base"
            >
              Change Tab
            </button>
          </>
        )}
      </div>

      {screenStream && recording && !isUploaded && !videoUrl && (
        <div className="flex flex-col gap-2 mt-4 sm:mt-6 items-start">
          <div className="flex items-center gap-4 ml-190">
            <button
              onClick={stopRecording}
              className="px-8 py-3 rounded-2xl font-semibold bg-[#8A76FC] text-white shadow-lg hover:bg-[#8A76FC] transition text-sm sm:text-base"
            >
              Stop Recording
            </button>

            <button
              onClick={() => {
                setEnableCamera((prev) => !prev);
                if (cameraStream) {
                  stopCamera();
                } else {
                  startCamera();
                }
              }}
              className={`px-8 py-3 rounded-2xl font-semibold shadow-lg transition text-sm sm:text-base ${
                cameraStream
                  ? "bg-[#EF4444] hover:bg-[#EF4444] text-white"
                  : "bg-white hover:bg-[#F3F0FC] border border-[#ede7fa] text-[#8A76FC]"
              }`}
            >
              {cameraStream ? "Stop Camera" : "Start Camera"}
            </button>
          </div>
        </div>
      )}

      {screenStream && recording && !isUploaded && enableCamera && !videoUrl && (
        <div className="fixed bottom-2 right-5 w-32 h-32 bg-black shadow z-50 rounded-full overflow-hidden">
          <video
            ref={videoPreview}
            autoPlay
            playsInline
            className="w-full h-full object-cover rounded-full"
          />
        </div>
      )}

      {(videoUrl || isUploaded) && (
        <div className="flex flex-col gap-2 mt-4 sm:mt-6 items-end">
          <div className="flex flex-col sm:flex-row gap-3 justify-end mr-57">
            <button
              onClick={onEditVideo}
              className="px-6 py-2 rounded-lg font-medium bg-[#8A76FC] text-white shadow hover:bg-[#7A66EC] transition text-sm sm:text-base"
            >
              Start Editing
            </button>
            {/* <button
              onClick={() => fileInputRef?.current?.click()}
              className="px-6 py-2 rounded-lg font-normal bg-white border border-[#ede7fa] text-[#8A76FC] shadow hover:bg-[#F3F0FC] transition text-sm sm:text-base"
            >
              Upload File
            </button> */}
            <button
              onClick={() => {
                if (isUploaded) {
                  setUploadedFileUrl(null);
                  setUploadedFileType(null);
                  setBlob(null);
                } else {
                  reset();
                }
              }}
              className="px-6 py-2 rounded-lg font-medium bg-white text-[#8A76FC] shadow hover:bg-[#F3F0FC] transition text-sm sm:text-base border border-[#ede7fa]"
            >
              Discard Recording
            </button>
          </div>
          {saveMessage && !isUploaded && (
            <div className="text-[#8A76FC] text-xs sm:text-sm">{saveMessage}</div>
          )}
        </div>
      )}
    </>
  );
}
