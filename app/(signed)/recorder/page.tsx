"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useBlobStore } from "@/app/lib/blobStore";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { videoToMP4 } from "@/app/lib/ffmpeg";

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<"webm" | "mp4">("webm");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

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
    setIsSaving(true);

    try {
      setSaveMessage(format === "mp4" ? "🔄 Converting to MP4..." : "💾 Saving...");
      const outputBlob = format === "mp4" ? await videoToMP4(blob) : blob;

      setSaveMessage("⬇️ Downloading...");
      const url = URL.createObjectURL(outputBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "recording"}.${format}`;
      a.click();

      setSaveMessage("✅ Video saved successfully!");
    } catch (err) {
      console.error(err);
      setSaveMessage("❌ Failed to save video.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-8 min-h-screen bg-gray-50 space-y-10 text-gray-800">
      {/* Recorder Controls */}
      <section className="bg-white p-6 rounded-xl shadow border">
        <h1 className="text-3xl font-bold mb-6">📹 Screen Recorder</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={toggleMic}
            disabled={recording}
            className={`px-4 py-2 rounded font-medium transition w-full text-center ${
              micEnabled ? "bg-green-600 text-white" : "bg-gray-300 text-gray-800"
            }`}
          >
            🎙️ Microphone: {micEnabled ? "On" : "Off"}
          </button>

          <button
            onClick={startScreenShare}
            disabled={recording}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition w-full"
          >
            {screenStream ? "🔄 Share Different Screen" : "🖥️ Start Screen Share"}
          </button>

          {!recording && screenStream && (
            <button
              onClick={startRecording}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition w-full"
            >
              ⏺ Start Recording
            </button>
          )}

          {recording && (
            <button
              onClick={stopRecording}
              className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded transition w-full"
            >
              ⏹ Stop Recording
            </button>
          )}
        </div>

        {screenStream && (
          <div className="mt-6">
            <h2 className="font-semibold mb-2">🎞️ Preview:</h2>
            <video
              ref={videoRef}
              autoPlay
              muted={!videoUrl}
              controls={!!videoUrl}
              className="w-full rounded-xl border"
            />
          </div>
        )}
      </section>

      {/* Save Section */}
      {videoUrl && (
        <section className="bg-white p-6 rounded-xl shadow border space-y-4">
          <h2 className="text-xl font-semibold">📄 Video Details</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-4 py-2"
            placeholder="🎬 Enter video title"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded px-4 py-2"
            placeholder="📝 Enter video description"
            rows={3}
          />
          <div className="flex items-center gap-3">
            <label className="font-medium">💾 Save as:</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "webm" | "mp4")}
              className="border px-3 py-2 rounded"
            >
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
            </select>
          </div>
          <button
            onClick={handleSaveAndPublish}
            disabled={isSaving}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded w-full"
          >
            🚀 Save & Publish
          </button>
          {saveMessage && (
            <p className="text-sm text-blue-600 font-medium">{saveMessage}</p>
          )}

          <div className="flex flex-col md:flex-row gap-4 pt-4 border-t mt-4">
            <button
              onClick={reset}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded w-full"
            >
              🗑️ Discard Recording
            </button>
            <button
              onClick={() => router.push("/editor")}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded w-full"
            >
              ✂️ Start Editing
            </button>
          </div>
        </section>
      )}

      <hr className="my-6" />

      {/* Upload Section */}
      <section className="bg-white p-6 rounded-xl shadow border">
        <h2 className="text-xl font-semibold mb-4">📁 Upload a Video</h2>
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
              setUploadMessage("✅ Uploaded successfully!");
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
          <p className="mt-2 text-green-600 text-sm">{uploadMessage}</p>
        )}

        {uploadedVideoUrl && (
          <div className="mt-4 space-y-2">
            <video
              src={uploadedVideoUrl}
              controls
              className="w-full rounded-xl border"
            />
            <div className="flex flex-col md:flex-row gap-4">
              <button
                onClick={() => {
                  setUploadedVideoUrl(null);
                  setBlob(null);
                }}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded w-full"
              >
                🗑️ Remove Video
              </button>
              <button
                onClick={() => router.push("/editor")}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded w-full"
              >
                ✂️ Start Editing
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}