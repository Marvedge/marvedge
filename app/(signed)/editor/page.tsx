"use client";
import { useRef } from "react";
import { useEditor } from "@/app/hooks/useEditor";
import EditorControls from "@/app/components/EditorControls";

export default function EditorPage() {
  const {
    videoUrl,
    mp4Url,
    thumbnailUrl,
    clipName,
    setClipName,
    clipNote,
    setClipNote,
    processing,
    trimApplier,
    resetVideo,
    downloadBlob,
  } = useEditor();

  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🎬 Video Editor</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Video & Actions */}
        <div className="md:col-span-2 space-y-4">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-600">⏳ Trimming video, please wait...</p>
            </div>
          ) : videoUrl ? (
            <>
              <div className="relative overflow-auto max-h-[70vh] rounded-lg border border-gray-300 shadow-sm">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full transition-transform duration-300 ease-in-out"
                />
              </div>

              <div className="flex gap-4 flex-wrap items-center">
                <a href={videoUrl} download={`${clipName || "clip"}.webm`}>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded">
                    ⬇️ Download WebM
                  </button>
                </a>

                {mp4Url && (
                  <button
                    onClick={() => downloadBlob(mp4Url, `${clipName || "clip"}.mp4`)}
                    className="bg-purple-600 text-white px-4 py-2 rounded"
                  >
                    💾 Save MP4
                  </button>
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

              <div className="mt-4 space-y-2">
                <input
                  value={clipName}
                  onChange={(e) => setClipName(e.target.value)}
                  className="w-full border border-gray-300 p-2 rounded"
                  placeholder="📎 Clip Name"
                />
                <textarea
                  value={clipNote}
                  onChange={(e) => setClipNote(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 p-2 rounded"
                  placeholder="📝 Notes or Description"
                />
              </div>
            </>
          ) : (
            <p className="text-gray-600">No video found.</p>
          )}
        </div>

        {/* Controls */}
        <div>
          <EditorControls
            onTrim={trimApplier}
            processing={processing}
            videoRef={videoRef}
          />
        </div>
      </div>
    </main>
  );
}
