// "use client";

// import { useEffect, useState } from "react";

// const EditorPage = () => {
//   const [initialUrl, setInitialUrl] = useState<string | null>(null);

//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     const video = params.get("video");
//     setInitialUrl(video);
//   }, []);

//   return (
//     <div className="p-8 grid grid-cols-3 gap-8">
//       Editor Page
//       <div className="col-span-2">
//         {initialUrl && (
//           <>
//             <video src={initialUrl} controls className="w-full rounded" />
//             <a href={initialUrl} download="recording.webm">
//               <button className="btn mt-2 bg-blue-500 text-white px-4 py-2 rounded">
//                 Download Recording
//               </button>
//             </a>
//           </>
//         )}
//       </div>
//       <div>
//         {/* <EditorControls onTrim={trimApplier} processing={processing} /> */}
//       </div>
//     </div>
//   );
// };

// export default EditorPage;

"use client";

import { useEffect, useState } from "react";
import EditorControls from "../../components/EditorControls";
import { useEditor } from "../../hooks/useEditor";

const EditorPage = () => {
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const video = params.get("video");
    if (video) {
      setInitialUrl(video);
      setEnabled(true);
    }
  }, []);

  const { videoUrl, processing, trimApplier, resetVideo } = useEditor(
    initialUrl || ""
  );

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🎬 Video Editor</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left - Video Preview */}
        <div className="md:col-span-2 space-y-4">
          {enabled && processing && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg
                className="animate-spin h-10 w-10 text-blue-600 mb-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                ></path>
              </svg>
              <p className="text-sm text-gray-600">Trimming video, please wait...</p>
            </div>
          )}

          {enabled && !processing && (
            <>
              <video
                src={videoUrl || initialUrl || ""}
                controls
                className="w-full rounded-lg border border-gray-300 shadow-sm"
              />
              <div className="flex flex-wrap gap-3">
                <a
                  href={videoUrl || initialUrl || ""}
                  download="recording.webm"
                >
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition">
                    ⬇️ Download
                  </button>
                </a>
                <button
                  onClick={resetVideo}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition"
                >
                  🔁 Reset
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right - Editor Controls */}
        <div className="bg-white p-4 shadow-md rounded-lg border border-gray-200">
          {enabled && (
            <EditorControls
              onTrim={trimApplier}
              processing={processing}
            />
          )}
        </div>
      </div>
    </main>
  );
};

export default EditorPage;

