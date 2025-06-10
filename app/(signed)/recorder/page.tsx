"use client";
import { useScreenRecorder } from "@/app/hooks/useScreenRecorder";

const RecorderPage = () => {
  const {
    startRecording,
    stopRecording,
    toggleMic,
    micEnabled,
    recording,
    videoUrl,
  } = useScreenRecorder();

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

      {/* Video Preview */}
      {videoUrl && (
        <div className="mt-4">
          <h2 className="text-lg">Preview:</h2>
          <video src={videoUrl} controls className="mt-2" width={600} />
          <a href={videoUrl} download="recording.webm">
            <button className="btn mt-2 bg-blue-500 text-white px-4 py-2 rounded">
              Download Recording
            </button>
          </a>
        </div>
      )}
    </div>
  );
};

export default RecorderPage;
