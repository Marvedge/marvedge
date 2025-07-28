"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useBlobStore } from "@/app/lib/blobStore";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { videoToMP4 } from "@/app/lib/ffmpeg";
import Image from "next/image";
import RecorderSidebar from "@/app/components/RecorderSidebar";
import { sanitizeFilename } from "@/app/lib/constants";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { Dialog } from "@headlessui/react";
import { Menu } from "lucide-react";
import { useSession, signOut } from "next-auth/react";

type RecorderTopbarProps = {
  onBack: () => void;
  userInitials: string;
};

function RecorderTopbar({ onBack, userInitials }: RecorderTopbarProps) {
  const { data: session } = useSession();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Get first name or fallback
  const username =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")?.[0] ||
    "User";
  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className="w-full flex items-center justify-between px-4 sm:px-8 py-2 sm:py-4 bg-white border-b border-[#ede7fa] shadow-sm">
      <div className="flex items-center gap-2 sm:gap-6">
        {/* Mobile: left arrow at the left edge */}
        <button
          onClick={onBack}
          className="text-[#7C5CFC] text-xl sm:text-2xl hover:bg-[#ede7fa] rounded-full p-1 mr-2 sm:ml-4 sm:order-2 order-1"
          style={{ order: 1 }}
        >
          <Image
            src="/icons/arrow_left_icon.png"
            alt="Back"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
        {/* Logo and title */}
        <span className="ml-2 sm:ml-0 text-lg sm:text-2xl font-extrabold text-[#7C5CFC] tracking-widest flex items-center gap-2 sm:order-1 order-2">
          <Image
            src="/images/Transparent logo.png"
            alt="Marvedge logo"
            width={32}
            height={32}
            className="h-6 w-6 sm:h-8 sm:w-8 object-contain"
            priority
          />
          MARVEDGE
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="relative lg:mr-60 hidden sm:block">
          <input
            type="text"
            placeholder="Search"
            className="rounded-full border border-[#ede7fa] px-4 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
          />
        </div>
        <span className="hidden sm:block text-[#7C5CFC] font-medium text-base mr-2 flex items-center gap-1">
          Welcome, {username}
          <span role="img" aria-label="waving hand" className="ml-1">
            👋
          </span>
        </span>

        <button className="relative text-[#7C5CFC] hover:bg-[#ede7fa] rounded-full p-2 hidden sm:block">
          <Image
            src="/icons/bell.png"
            alt="Notifications"
            width={20}
            height={20}
            className="md:w-6 md:h-6"
          />
        </button>
        <div className="relative" ref={dropdownRef}>
          <button
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#6356D7] text-white flex items-center justify-center text-lg md:text-xl font-bold shadow cursor-pointer border-4 border-white hover:scale-105 transition-all"
            onClick={() => setShowDropdown((v) => !v)}
            title={session?.user?.name || session?.user?.email || undefined}
          >
            {userInitials}
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 md:w-64 bg-white rounded-lg shadow-lg p-3 md:p-4 z-50 border border-gray-200 animate-fade-in">
              <div className="mb-2 text-base md:text-lg font-bold text-[#6356D7]">
                {session?.user?.name || "User"}
              </div>
              <div className="mb-1 text-gray-700 text-xs md:text-sm font-semibold">
                {session?.user?.email}
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="mt-3 md:mt-4 w-full px-3 md:px-4 py-2 bg-[#6356D7] text-white rounded hover:bg-[#7E5FFF] font-semibold transition-all text-sm md:text-base"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecorderPage() {
  const {
    startRecording,
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
    screenStream,
    startScreenShare,
    reset,
  } = useScreenRecorder();

  const setBlob = useBlobStore((state) => state.setBlob);
  const blob = useBlobStore((state) => state.blob);
  const title = useBlobStore((state) => state.title);
  const description = useBlobStore((state) => state.description);
  const setTitle = useBlobStore((state) => state.setTitle);
  const setDescription = useBlobStore((state) => state.setDescription);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const somethingxx = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [enableCamera, setEnableCamera] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setCameraStream(stream);
      if (somethingxx.current) {
        somethingxx.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access denied or not available:", error);
    }
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    if (somethingxx.current) somethingxx.current.srcObject = null;
  };

  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [saveMessage, setSaveMessage] = useState<string>("");

  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";

  useEffect(() => {
    if (!videoRef.current) return;

    if (videoUrl) {
      videoRef.current.srcObject = null;
      videoRef.current.src = videoUrl;
    } else if (screenStream) {
      videoRef.current.srcObject = screenStream;
      videoRef.current.src = "";
    }
  }, [videoUrl, screenStream]);

  const handleSaveAndPublish = async () => {
    if (!blob) return;

    try {
      if (format === "mp4") {
        setSaveMessage("🔄 Converting to MP4...");
        const outputBlob = await videoToMP4(blob);
        setSaveMessage("⬇️ Downloading...");
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(title) || "recording"}.mp4`;
        a.click();
      } else {
        setSaveMessage("💾 Saving...");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(title) || "recording"}.webm`;
        a.click();
      }
      setSaveMessage("✅ Video saved successfully!");
      toast.success("Video saved and published!");
    } catch (err) {
      console.error(err);
      setSaveMessage("❌ Failed to save video.");
    }
  };

  // UI after user selects a screen/tab (screenStream is set) or uploads a video file
  if (screenStream || uploadedFileUrl) {
    const isUploaded = !!uploadedFileUrl && !screenStream;
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden">
        <Toaster position="top-right" />
        <RecorderTopbar onBack={() => router.back()} userInitials={initials} />
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar for desktop, button for mobile */}
          <div className="hidden md:block">
            <RecorderSidebar
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              fileInputRef={fileInputRef}
              onFileInputClick={() => fileInputRef.current?.click()}
              onFileChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
              }}
              uploadMessage={uploadMessage}
              onStartScreenShare={startScreenShare}
            />
          </div>
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
          <Dialog
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            className="relative z-50"
          >
            <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
            <div className="fixed inset-y-0 left-0 w-[90vw] max-w-xs bg-white shadow-2xl p-6 flex flex-col gap-6 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-[#7C5CFC]">
                  Recorder Settings
                </h2>
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
                <label className="block text-[#7C5CFC] font-semibold mb-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
                  placeholder="Enter recording title"
                />
              </div>
              {/* Description */}
              <div>
                <label className="block text-[#7C5CFC] font-semibold mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
                  placeholder="Describe your recording"
                  rows={3}
                />
              </div>
              {/* Upload & Screen Share */}
              <div>
                <label className="block text-[#7C5CFC] font-semibold mb-1">
                  Recording Source
                </label>
                <div className="border-2 border-dashed border-[#A594F9] rounded-lg p-4 flex flex-col items-center justify-center mb-4 bg-[#F8F6FF]">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 text-[#7C5CFC] font-semibold text-base focus:outline-none"
                  >
                    <span className="text-2xl"></span>
                    Upload Screen Recording
                    <span className="text-xs text-gray-400">
                      MP4, MOV up to 100MB
                    </span>
                  </button>
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
                        setUploadMessage("✅ Uploaded successfully!");
                        toast.success("File uploaded successfully!");
                        setTimeout(() => setUploadMessage(""), 3000);
                      } else {
                        toast.error("No file selected or upload failed.");
                      }
                    }}
                  />
                  {uploadMessage && (
                    <div className="mt-2 text-green-600 text-xs">
                      {uploadMessage}
                    </div>
                  )}
                </div>
                <button
                  onClick={startScreenShare}
                  className="w-full mt-2 px-4 py-3 rounded-lg bg-white text-[#7C5CFC] font-semibold shadow hover:bg-[#8A76FC] hover:text-white transition flex items-center justify-center gap-2 text-base"
                >
                  Start Screen Sharing
                </button>
              </div>
            </div>
          </Dialog>
          {/* Right Panel */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* New Recording Header Bar */}
            <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
              <div>
                <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">
                  New Recording
                </div>
                <div className="text-xs sm:text-sm text-gray-400">
                  Last saved 2 minutes ago
                </div>
              </div>
              {!isUploaded && (
                <button
                  onClick={handleSaveAndPublish}
                  className="mt-2 sm:mt-0 px-4 sm:px-5 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition flex items-center gap-2 text-sm sm:text-base"
                >
                  <Image
                    src="/icons/1.png"
                    alt="Notifications"
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
                <div
                  className="border-2 border-[#6C63FF] rounded-2xl mb-4 sm:mb-8 mx-auto"
                  style={{
                    width: "100%",
                    maxWidth: 900,
                    height: "auto",
                    maxHeight: "60vh",
                    background: "#000",
                    position: "relative",
                  }}
                >
                  {uploadedFileType?.startsWith("image/") ? (
                    <Image
                      src={uploadedFileUrl!}
                      alt="Uploaded preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        background: "#000",
                      }}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={uploadedFileUrl!}
                      controls
                      autoPlay
                      muted
                      className="w-full h-auto max-h-[60vh] bg-black object-contain"
                      style={{
                        display: "block",
                        margin: "0 auto",
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-4 sm:mt-6 justify-end">
                  {screenStream && !recording && !isUploaded && !videoUrl && (
                    <>
                      <button
                        onClick={() => {
                          screenStream
                            .getTracks()
                            .forEach((track) => track.stop());
                          startScreenShare();
                        }}
                        className="bg-[#7C5CFC] text-white px-4 sm:px-8 py-2 rounded-lg font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base"
                      >
                        Change Tab
                      </button>
                      <button
                        onClick={startRecording}
                        className="bg-[#6C63FF] text-white px-4 sm:px-8 py-2 rounded-lg font-semibold shadow hover:bg-[#5548c8] transition text-sm sm:text-base"
                      >
                        Start Recording
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

                        {/* {cameraStream && (
                          <DraggableCameraPreview videoRef={somethingxx} />
                        )} */}

                        {enableCamera && (
                          <div className="fixed bottom-2 right-5 w-32 h-32 bg-black shadow z-50 rounded-full overflow-hidden">
                            <video
                              ref={somethingxx}
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
                        <label
                          htmlFor="format-select"
                          className="font-medium text-[#6C63FF] text-sm"
                        >
                          Save as:
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
                        className="px-6 py-3 rounded-lg font-semibold bg-[#F44336] text-white shadow-md hover:bg-[#d32f2f] transition flex items-center gap-2 text-base"
                      >
                        Discard Video
                      </button>
                      {isUploaded && (
                        <button
                          onClick={() => router.push("/editor")}
                          className="px-6 py-3 rounded-lg font-semibold bg-[#A594F9] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
                        >
                          Edit Video
                        </button>
                      )}
                      {!isUploaded && (
                        <>
                          <button
                            onClick={() => router.push("/editor")}
                            className="px-6 py-3 rounded-lg font-semibold bg-[#7C5CFC] text-white shadow-md hover:bg-[#7C5CFC] transition flex items-center gap-2 text-base"
                          >
                            Edit Video
                          </button>
                        </>
                      )}
                    </div>
                    {saveMessage && !isUploaded && (
                      <div className="mt-2 text-[#6C63FF] text-xs sm:text-sm">
                        {saveMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // UI for when recording is in progress
  if (recording) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-gray-900 text-white overflow-hidden">
        <div className="bg-gray-800 p-8 rounded-xl shadow-lg flex flex-col items-center space-y-6 w-full max-w-xl">
          <h2 className="text-2xl font-bold animate-pulse">⏺ Recording...</h2>
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full rounded-lg border-2 border-red-500"
            style={{ maxHeight: "60vh" }}
          />
          <button
            onClick={stopRecording}
            className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded w-full text-lg font-semibold"
          >
            ⏹ Stop Recording
          </button>
          <div className="flex items-center gap-2">
            <span>🎙️ Mic: {micEnabled ? "On" : "Off"}</span>
            <button
              onClick={toggleMic}
              className={`px-3 py-1 rounded ${
                micEnabled ? "bg-green-600" : "bg-gray-600"
              }`}
            >
              {micEnabled ? "Mute" : "Unmute"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Initial UI (no recording or uploaded video)
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      <Toaster position="top-right" />
      <RecorderTopbar onBack={() => router.back()} userInitials={initials} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for desktop, button for mobile */}
        <div className="hidden md:block">
          <RecorderSidebar
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            fileInputRef={fileInputRef}
            onFileInputClick={() => fileInputRef.current?.click()}
            onFileChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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
            }}
            uploadMessage={uploadMessage}
            onStartScreenShare={startScreenShare}
          />
        </div>
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
        <Dialog
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 w-[90vw] max-w-xs bg-white shadow-2xl p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-[#7C5CFC]">
                Recorder Settings
              </h2>
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
              <label className="block text-[#7C5CFC] font-semibold mb-1">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
                placeholder="Enter recording title"
              />
            </div>
            {/* Description */}
            <div>
              <label className="block text-[#7C5CFC] font-semibold mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] text-base"
                placeholder="Describe your recording"
                rows={3}
              />
            </div>
            {/* Upload & Screen Share */}
            <div>
              <label className="block text-[#7C5CFC] font-semibold mb-1">
                Recording Source
              </label>
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
                  <span className="text-xs text-gray-400">
                    MP4, MOV up to 100MB
                  </span>
                </button>
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
                      setUploadMessage("✅ Uploaded successfully!");
                      toast.success("File uploaded successfully!");
                      setTimeout(() => setUploadMessage(""), 3000);
                    } else {
                      toast.error("No file selected or upload failed.");
                    }
                  }}
                />
                {uploadMessage && (
                  <div className="mt-2 text-green-600 text-xs">
                    {uploadMessage}
                  </div>
                )}
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
          <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-12 py-4 sm:py-6 bg-[#f3f0fc] border-b border-[#ede7fa]">
            <div>
              <div className="text-lg sm:text-2xl font-semibold text-[#1A0033]">
                New Recording
              </div>
              <div className="text-xs sm:text-sm text-gray-400">
                Last saved 2 minutes ago
              </div>
            </div>
          </div>
          {/* Main Area */}
          <div className="flex-1 flex flex-col items-center justify-center h-full overflow-hidden">
            <div className="w-full max-w-6xl mx-auto flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-4 sm:p-12 h-[calc(100vh-12rem)]">
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
                      src="/icons/play_button_icon.png"
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
                  className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-[#7C5CFC] text-white font-semibold shadow hover:bg-[#8A76FC] transition text-sm sm:text-base"
                >
                  Start Screen Share
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto px-4 sm:px-8 py-2 sm:py-3 rounded-lg bg-white border border-[#ede7fa] text-[#7C5CFC] font-semibold shadow hover:bg-[#F3F0FC] transition text-sm sm:text-base"
                >
                  Upload File
                </button>
                <div className="flex items-center gap-2 sm:gap-3 ml-0 sm:ml-4 mt-2 sm:mt-0 w-full sm:w-auto justify-center">
                  <span className="text-[#888] font-medium text-sm sm:text-base">
                    Microphone
                  </span>
                  <button
                    onClick={toggleMic}
                    className={`w-10 sm:w-12 h-6 rounded-full flex items-center px-1 transition ${micEnabled ? "bg-[#6C63FF]" : "bg-gray-300"}`}
                  >
                    <span
                      className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${micEnabled ? "translate-x-4 sm:translate-x-6" : ""}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
