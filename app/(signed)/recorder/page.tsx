"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useBlobStore } from "@/app/lib/blobStore";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);

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

  return (
    <main className="p-8 min-h-screen bg-white space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-4">📹 Screen Recorder</h1>
        <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={toggleMic}
            disabled={recording}
            className={`px-4 py-2 rounded font-medium transition ${
              micEnabled
                ? "bg-green-600 text-white"
                : "bg-gray-300 text-gray-800"
            }`}
          >
            🎙️ Microphone: {micEnabled ? "On" : "Off"}
          </button>

          <button
            onClick={startScreenShare}
            disabled={recording}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition"
          >
            {screenStream
              ? "🔄 Share Different Screen"
              : "🖥️ Start Screen Share"}
          </button>

          {!recording && screenStream && (
            <button
              onClick={startRecording}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
            >
              ⏺ Start Recording
            </button>
          )}

          {recording && (
            <button
              onClick={stopRecording}
              className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded transition"
            >
              ⏹ Stop Recording
            </button>
          )}
        </div>

        {screenStream && (
          <div className="mt-6">
            <h2 className="font-medium mb-2">Preview:</h2>
            <video
              ref={videoRef}
              autoPlay
              muted={!videoUrl}
              controls={!!videoUrl}
              className="w-full max-w-2xl border rounded"
            />
          </div>
        )}

        {videoUrl && (
          <div className="mt-6 flex gap-4">
            <button
              onClick={reset}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              🗑️ Discard Recording
            </button>
            <button
              onClick={() => router.push("/editor")}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              ✂️ Start Editing
            </button>
          </div>
        )}
      </div>

      <hr className="my-6" />

      <div>
        <h2 className="text-xl font-semibold mb-2">📁 Upload a Video</h2>
        <input
          type="file"
          accept="video/mp4,video/webm,video/*"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const fileUrl = URL.createObjectURL(file);
              setUploadedVideoUrl(fileUrl);
              setBlob(file);
              setUploadMessage("Uploaded successfully!");
              setTimeout(() => setUploadMessage(""), 3000);
            }
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
        >
          📤 Upload Video
        </button>

        {uploadMessage && (
          <p className="mt-2 text-green-600">{uploadMessage}</p>
        )}

        {uploadedVideoUrl && (
          <div className="mt-4 space-y-2">
            <video
              src={uploadedVideoUrl}
              controls
              className="w-full max-w-2xl border rounded"
            />
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setUploadedVideoUrl(null);
                  setBlob(null);
                }}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
              >
                🗑️ Remove Video
              </button>
              <button
                onClick={() => router.push("/editor")}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                ✂️ Start Editing
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
