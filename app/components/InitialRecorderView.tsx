import Image from "next/image";
import { Dialog } from "@headlessui/react";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { useBlobStore } from "@/app/store/blobStore";

interface InitialRecorderViewProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  title: string;
  setTitle: (title: string) => void;
  uploadedFileUrl: string | null;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFileType: (type: string | null) => void;
  setUploadMessage: (message: string) => void;
  uploadMessage: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  startScreenShare: () => void;
  toggleMic: () => void;
  micEnabled: boolean;
}

export default function InitialRecorderView({
  sidebarOpen,
  setSidebarOpen,
  title,
  setTitle,
  uploadedFileUrl,
  setUploadedFileUrl,
  setUploadedFileType,
  setUploadMessage,
  uploadMessage,
  fileInputRef,
  startScreenShare,
  toggleMic,
  micEnabled,
}: InitialRecorderViewProps) {
  const { setBlob } = useBlobStore();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      setUploadedFileUrl(fileUrl);
      setUploadedFileType(file.type);
      setBlob(file);
      setUploadMessage("✅ Uploaded successfully!");
      toast.success("File uploaded successfully!");
      setTimeout(() => setUploadMessage(""), 3000);
    } else {
      toast.error("No file selected or upload failed.");
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Mobile sidebar button */}
      <div className="flex items-center sm:hidden mb-2">
        <button
          className="md:hidden fixed top-0 left-0 z-50 bg-[#7C5CFC] text-white p-3 shadow-lg focus:outline-none "
          onClick={() => setSidebarOpen(true)}
          aria-label="Open settings"
        >
          <Menu size={28} />
        </button>
      </div>

      {/* Mobile sidebar drawer */}
      <Dialog open={sidebarOpen} onClose={() => setSidebarOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-y-0 left-0 w-[90vw] max-w-xs bg-white shadow-2xl p-6 flex flex-col gap-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-[#7C5CFC]">Recorder Settings</h2>
            <button
              className="text-[#7C5CFC] text-2xl p-1 rounded hover:bg-[#ede7fa] focus:outline-none"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>
          {/* Title */}
          <div>
            <label className="block text-[#7C5CFC] font-semibold mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
              placeholder="Enter recording title"
            />
          </div>
          {/* Upload & Screen Share */}
          <div>
            <label className="block text-[#7C5CFC] font-semibold mb-1">Recording Source</label>
            <div className="border-2 border-dashed border-[#A594F9] rounded-lg p-4 flex flex-col items-center justify-center mb-4 bg-[#F8F6FF]">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 text-[#7C5CFC] font-semibold text-base focus:outline-none"
              >
                <span className="text-2xl">
                  <Image
                    src="/icons/upload_icon.png"
                    alt="Notifications"
                    width={20}
                    height={20}
                    className="md:w-6 md:h-6"
                  />
                </span>
                Upload Screen Recording
                <span className="text-xs text-gray-400">MP4, MOV up to 100MB</span>
              </button>
              <input
                type="file"
                accept="video/mp4,video/webm,video/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />
              {uploadMessage && <div className="mt-2 text-green-600 text-xs">{uploadMessage}</div>}
            </div>
            <button
              onClick={startScreenShare}
              className="w-full mt-2 px-4 py-3 rounded-lg bg-white text-[#7C5CFC] font-semibold shadow hover:bg-[#8A76FC] hover:text-white transition flex items-center justify-center gap-2 text-base"
            >
              <Image
                src="/icons/play_button_icon.png"
                alt="Notifications"
                width={20}
                height={20}
                className="md:w-6 md:h-6"
              />
              Start Screen Sharing
            </button>
          </div>
        </div>
      </Dialog>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* New Recording Header Bar */}
        <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px- sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
          <div>
            <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">New Recording</div>
            <div className="text-xs sm:text-sm text-gray-400">Last saved 2 minutes ago</div>
          </div>
        </div>
        {/* Main Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden px-0 sm:px-2 pb-0 sm:pb-2">
          {/* <h2 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4 text-[#6C63FF] px-4 sm:px-2 ml-10">
            Preview
          </h2> */}
          <div className="w-full max-w-360 mx-auto flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-4 sm:p-8 flex-1 overflow-y-auto">
            {uploadedFileUrl ? (
              <video
                src={uploadedFileUrl}
                controls
                className="w-full h-[200px] sm:h-[400px] object-contain bg-[#F6F4FF] mb-4 sm:mb-6 rounded-xl border border-[#7C5CFC]"
                style={{ maxWidth: 900 }}
              />
            ) : (
              <>
                <span
                  className="mb-10 mt-0"
                  style={{ width: 96, height: 66, display: "inline-block" }}
                >
                  <Image
                    src="/icons/tabler_video.svg"
                    alt="Preview Icon"
                    width={96}
                    height={66}
                    className="object-contain"
                    priority
                  />
                </span>
                <div className="text-lg sm:text-xl font-semibold text-[#1A0033] mb-2">
                  Start Sharing Your Screen
                </div>
                <div className="text-gray-400 text-center max-w-md mb-4 sm:mb-6 text-sm sm:text-base">
                  Click the below button or upload a screen share to begin.
                  <br />
                  creating your interactive demo
                </div>
              </>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-6 justify-center items-center w-full">
              <button
                onClick={startScreenShare}
                className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base cursor-pointer"
              >
                Start Screen Share
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-white border border-[#ede7fa] text-[#7C5CFC] font-semibold shadow hover:bg-[#F3F0FC] transition text-sm sm:text-base cursor-pointer"
              >
                Upload File
              </button>
              <div className="flex items-center gap-2 sm:gap-3 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full sm:w-auto justify-center">
                <span className="text-[#888] font-medium text-sm sm:text-base">Microphone</span>
                <button
                  onClick={toggleMic}
                  className={`w-10 sm:w-12 h-6 rounded-full flex items-center px-1 transition ${micEnabled ? "bg-[#6C63FF]" : "bg-gray-300"} cursor-pointer`}
                >
                  <span
                    className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${micEnabled ? "translate-x-4 sm:translate-x-6" : ""}`}
                  />
                </button>
              </div>
            </div>
            {/* Hidden file input for main area upload */}
            <input
              type="file"
              accept="video/mp4,video/webm,video/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
