"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RecorderPage() {
  const {
    startRecording,
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
  } = useScreenRecorder();

  const router = useRouter();

  useEffect(() => {
    if (videoUrl) router.push("/editor");
  }, [videoUrl, router]);

  return (
    <main className="p-8 min-h-screen bg-white">
      <h1 className="text-2xl font-bold mb-6">📹 Screen Recorder</h1>

      {/* Mic Toggle */}
      <button
        onClick={toggleMic}
        disabled={recording}
        className={`mr-4 px-4 py-2 rounded font-medium transition ${
          micEnabled ? "bg-green-600 text-white" : "bg-gray-300 text-gray-800"
        }`}
      >
        🎙️ Microphone: {micEnabled ? "On" : "Off"}
      </button>

      {/* Record Controls */}
      {!recording ? (
        <button
          onClick={startRecording}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
        >
          ⏺ Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded transition"
        >
          ⏹ Stop Recording
        </button>
      )}
    </main>
  );
}