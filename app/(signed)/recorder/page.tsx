// "use client";
// import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
// import { useRouter } from "next/navigation";
// import { useEffect } from "react";

// export default function RecorderPage() {
//   const {
//     startRecording,
//     stopRecording,
//     toggleMic,
//     micEnabled,
//     recording,
//     videoUrl,
//   } = useScreenRecorder();

//   const router = useRouter();

//   useEffect(() => {
//     if (videoUrl) router.push("/editor");
//   }, [videoUrl, router]);

//   return (
//     <main className="p-8 min-h-screen bg-white">
//       <h1 className="text-2xl font-bold mb-6">📹 Screen Recorder</h1>

//       <button
//         onClick={toggleMic}
//         disabled={recording}
//         className={`mr-4 px-4 py-2 rounded font-medium transition ${
//           micEnabled ? "bg-green-600 text-white" : "bg-gray-300 text-gray-800"
//         }`}
//       >
//         🎙️ Microphone: {micEnabled ? "On" : "Off"}
//       </button>

//       {!recording ? (
//         <button
//           onClick={startRecording}
//           className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
//         >
//           ⏺ Start Recording
//         </button>
//       ) : (
//         <button
//           onClick={stopRecording}
//           className="bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded transition"
//         >
//           ⏹ Stop Recording
//         </button>
//       )}
//     </main>
//   );
// }

"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";
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

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [uploadMessage, setUploadMessage] = useState("");

  // Bind stream to video element
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // Redirect to editor on successful recording
  useEffect(() => {
    if (videoUrl) router.push("/editor");
  }, [videoUrl, router]);

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

        {/* Screen Preview */}
        {screenStream && (
          <div className="mt-6">
            <h2 className="font-medium mb-2">Preview:</h2>
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full max-w-2xl border rounded"
            />
          </div>
        )}

        {/* Discard or Edit Recording */}
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

      {/* Upload Section */}
      <div>
        <h2 className="text-xl font-semibold mb-2">📁 Upload a Video</h2>
        <input
          type="file"
          accept="video/*"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              // This URL is no longer used since we redirect
              setUploadMessage("Uploaded successfully!");
              setTimeout(() => setUploadMessage(""), 3000);
              router.push("/editor");
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
      </div>
    </main>
  );
}
