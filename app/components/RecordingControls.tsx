interface RecordingControlsProps {
  screenStream: MediaStream | null;
  recording: boolean;
  isUploaded: boolean;
  videoUrl: string | null;
  cameraStream: MediaStream | null;
  enableCamera: boolean;
  format: "webm" | "mp4";
  saveMessage: string;
  videoPreview: React.RefObject<HTMLVideoElement | null>;
  startScreenShare: () => void;
  stopRecording: () => void;
  setEnableCamera: (value: boolean | ((prev: boolean) => boolean)) => void;
  startCamera: () => void;
  stopCamera: () => void;
  setFormat: (format: "webm" | "mp4") => void;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFileType: (type: string | null) => void;
  setBlob: (blob: Blob | null) => void;
  reset: () => void;
  handleSaveAndPublish: () => void;
  onEditVideo?: () => void;
}

export default function RecordingControls({
  screenStream,
  recording,
  isUploaded,
  videoUrl,
  cameraStream,
  enableCamera,
  format,
  saveMessage,
  videoPreview,
  startScreenShare,
  stopRecording,
  setEnableCamera,
  startCamera,
  stopCamera,
  setFormat,
  setUploadedFileUrl,
  setUploadedFileType,
  setBlob,
  reset,
  handleSaveAndPublish,
  onEditVideo,
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
              className="bg-[#7C5CFC] text-white px-4 sm:px-8 py-2 rounded-lg font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base"
            >
              Change Tab
            </button>
          </>
        )}
        {screenStream && recording && !isUploaded && (
          <>
            <div className="flex items-center gap-4 justify-start">
              <div>
                <button
                  onClick={stopRecording}
                  className=" bg-blue-600 text-white px-4 py-2 mx-1 rounded text-sm sm:text-base min-w-[150px] transition"
                >
                  Stop Recording
                </button>
              </div>

              <div className="">
                <button
                  onClick={() => {
                    setEnableCamera((prev) => !prev);
                    if (cameraStream) {
                      stopCamera();
                    } else {
                      startCamera();
                    }
                  }}
                  className={`${
                    cameraStream ? "bg-red-600" : "bg-green-600"
                  } text-white px-4 py-2 rounded text-sm sm:text-base min-w-[150px] transition mr-30`}
                >
                  {cameraStream ? "Stop Camera" : "Start Camera"}
                </button>
              </div>

              {enableCamera && (
                <div className="fixed bottom-2 right-5 w-32 h-32 bg-black shadow z-50 rounded-full overflow-hidden">
                  <video
                    ref={videoPreview}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {(videoUrl || isUploaded) && (
        <div className="flex flex-col gap-2 sm:gap-4 mt-4 sm:mt-6 justify-center items-center">
          {!isUploaded && (
            <div className="flex gap-2 items-center mb-2">
              <label htmlFor="format-select" className="font-medium text-[#6C63FF] text-sm">
                Download as:
              </label>
              <select
                id="format-select"
                value={format}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFormat(e.target.value as "webm" | "mp4")
                }
                className="border border-[#ede7fa] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-xs sm:text-sm"
              >
                <option value="webm">WebM (Original)</option>
                <option value="mp4">MP4 (Video)</option>
              </select>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
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
              className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#F44336] text-white shadow-md hover:bg-[#d32f2f] transition flex items-center gap-2 text-base"
            >
              Discard Video
            </button>
            {!isUploaded && (
              <button
                onClick={handleSaveAndPublish}
                className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#7C5CFC] text-white shadow-md hover:bg-[#8A76FC] transition flex items-center gap-2 text-base"
              >
                Download Video
              </button>
            )}
            {isUploaded && (
              <button
                onClick={onEditVideo}
                className="px-6 py-3 cursor-pointer rounded-lg font-semibold bg-[#A594F9] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
              >
                Edit Video
              </button>
            )}
            {!isUploaded && (
              <>
                <button
                  onClick={onEditVideo}
                  className="px-6 py-3 rounded-lg font-semibold bg-[#A594F9] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
                >
                  Edit Video
                </button>
              </>
            )}
          </div>
          {saveMessage && !isUploaded && (
            <div className="mt-2 text-[#6C63FF] text-xs sm:text-sm">{saveMessage}</div>
          )}
        </div>
      )}
    </>
  );
}
