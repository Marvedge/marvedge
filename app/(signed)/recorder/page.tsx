"use client";
import React from "react";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
import { useRouter } from "next/navigation";

const RecorderPage = () => {
  const {
    startRecording,
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
  } = useScreenRecorder();

  const router = useRouter();

  // Redirect to /editor when videoUrl is set
  React.useEffect(() => {
    if (videoUrl) {
      router.push(`/editor?video=${encodeURIComponent(videoUrl)}`); // Redirected the preview to editor page
    }
  }, [videoUrl, router]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Screen Recorder</h1>

      {/* Microphone Toggle */}
      <button
        onClick={toggleMic}
        disabled={recording}
        className={`btn mr-4 px-4 py-2 rounded ${
          micEnabled ? "bg-green-600 text-white" : "bg-gray-400 text-black"
        }`}
      >
        Microphone: {micEnabled ? "On" : "Off"}
      </button>

      {/* Start/Stop Button */}
      {!recording ? (
        <button
          onClick={startRecording}
          className="btn bg-blue-600 text-white px-4 py-2 rounded"
        >
          Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="btn bg-yellow-500 text-black px-4 py-2 rounded"
        >
          Stop Recording
        </button>
      )}
    </div>
  );
};

export default RecorderPage;
