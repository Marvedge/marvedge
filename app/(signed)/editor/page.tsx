"use client";
import { useEditor } from "@/app/hooks/useEditor";
import EditorControls from "@/app/components/EditorControls";

export default function EditorPage() {
  const {
    videoUrl,
    mp4Url,
    thumbnailUrl,
    processing,
    trimApplier,
    resetVideo,
  } = useEditor();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🎬 Video Editor</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-600">⏳ Trimming video, please wait...</p>
            </div>
          ) : videoUrl ? (
            <>
              <video
                src={videoUrl}
                controls
                className="w-full rounded-lg border border-gray-300 shadow-sm"
              />
              <div className="flex gap-4 flex-wrap items-center">
                <a href={videoUrl} download="recording.webm">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded">⬇️ Download WebM</button>
                </a>
                {mp4Url && (
                  <a href={mp4Url} download="clip.mp4">
                    <button className="bg-purple-600 text-white px-4 py-2 rounded">💾 Save MP4</button>
                  </a>
                )}
                <button
                  onClick={resetVideo}
                  className="bg-gray-500 text-white px-4 py-2 rounded"
                >
                  🔁 Reset
                </button>
              </div>
              {thumbnailUrl && (
                <div>
                  <p className="text-sm text-gray-500 mt-2">📸 Thumbnail:</p>
                  <img
                    src={thumbnailUrl}
                    alt="thumbnail"
                    className="w-32 mt-2 rounded border"
                  />
                </div>
              )}
            </>
          ) : (
            <p>No video found.</p>
          )}
        </div>
        <div>
          <EditorControls onTrim={trimApplier} processing={processing} />
        </div>
      </div>
    </main>
  );
}
