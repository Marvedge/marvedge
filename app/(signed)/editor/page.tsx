"use client";
import { useRef, useState, useEffect, MouseEvent } from "react";
import { useEditor } from "@/app/hooks/useEditor";
import EditorControls from "@/app/components/EditorControls";
import Image from "next/image";

interface RectOverlay {
  type: "blur" | "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArrowOverlay {
  type: "arrow";
  x: number;
  y: number;
  x2: number;
  y2: number;
}

interface TextOverlay {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  font: string;
}

type Overlay = RectOverlay | ArrowOverlay | TextOverlay;

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<"blur" | "rect" | "arrow" | "text">("blur");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [textColor, setTextColor] = useState("#000000");
  const [textFont, setTextFont] = useState("16px sans-serif");

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const item of overlays) {
        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 2;
        switch (item.type) {
          case "blur":
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.fillRect(item.x, item.y, item.w, item.h);
            break;
          case "rect":
            ctx.strokeRect(item.x, item.y, item.w, item.h);
            break;
          case "arrow":
            ctx.beginPath();
            ctx.moveTo(item.x, item.y);
            ctx.lineTo(item.x2, item.y2);
            ctx.stroke();
            break;
          case "text":
            ctx.font = item.font;
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, item.x, item.y);
            break;
        }
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, [overlays]);

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDrawing(true);
  };

  const handleMouseUp = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !startPos) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    let newOverlay: Overlay;

    if (tool === "arrow") {
      newOverlay = {
        type: "arrow",
        x: startPos.x,
        y: startPos.y,
        x2: endX,
        y2: endY,
      };
    } else if (tool === "text") {
      const text = prompt("Enter text:", "Sample text") || "";
      newOverlay = {
        type: "text",
        x: endX,
        y: endY,
        text,
        color: textColor,
        font: textFont,
      };
    } else {
      newOverlay = {
        type: tool,
        x: Math.min(startPos.x, endX),
        y: Math.min(startPos.y, endY),
        w: Math.abs(endX - startPos.x),
        h: Math.abs(endY - startPos.y),
      };
    }

    setOverlays((prev) => [...prev, newOverlay]);
    setDrawing(false);
    setStartPos(null);
  };

  const handleUndo = () => setOverlays((prev) => prev.slice(0, -1));
  const handleClear = () => setOverlays([]);
  const handleSaveOverlays = () =>
    localStorage.setItem("videoOverlays", JSON.stringify(overlays));
  const handleLoadOverlays = () => {
    const saved = localStorage.getItem("videoOverlays");
    if (saved) setOverlays(JSON.parse(saved));
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">🎬 Video Editor</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-600">
                ⏳ Trimming video, please wait...
              </p>
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
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full z-10 cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                />
              </div>

              {tool === "text" && (
                <div className="flex gap-3 items-center">
                  <label className="text-sm">Text Color:</label>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="border rounded"
                  />
                  <label className="text-sm ml-4">Font:</label>
                  <select
                    value={textFont}
                    onChange={(e) => setTextFont(e.target.value)}
                    className="border p-1 rounded"
                  >
                    <option value="16px sans-serif">Default</option>
                    <option value="20px serif">Serif</option>
                    <option value="20px monospace">Monospace</option>
                    <option value="18px Arial">Arial</option>
                    <option value="18px Georgia">Georgia</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 flex-wrap mt-2">
                {["blur", "rect", "arrow", "text"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTool(t as typeof tool)}
                    className={`px-3 py-1 rounded text-white ${
                      tool === t ? "bg-blue-700" : "bg-blue-500"
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
                <button
                  onClick={handleUndo}
                  className="bg-gray-600 text-white px-3 py-1 rounded"
                >
                  ↩️ Undo
                </button>
                <button
                  onClick={handleClear}
                  className="bg-red-600 text-white px-3 py-1 rounded"
                >
                  ❌ Clear
                </button>
                <button
                  onClick={handleSaveOverlays}
                  className="bg-yellow-600 text-white px-3 py-1 rounded"
                >
                  💾 Save
                </button>
                <button
                  onClick={handleLoadOverlays}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  📂 Load
                </button>
              </div>

              <div className="flex gap-4 flex-wrap items-center">
                <a href={videoUrl} download={`${clipName || "clip"}.webm`}>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded">
                    ⬇️ Download WebM
                  </button>
                </a>
                {mp4Url && (
                  <button
                    onClick={() =>
                      downloadBlob(mp4Url, `${clipName || "clip"}.mp4`)
                    }
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
                  <Image
                    src={thumbnailUrl}
                    alt="Google"
                    width={20}
                    height={20}
                    className="sm:w-[25px] sm:h-[25px]"
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

        <div>
          <EditorControls
            onTrim={(start, end) => {
              setOverlays(overlays); 
              trimApplier(start, end);
            }}
            processing={processing}
            videoRef={videoRef}
          />
        </div>
      </div>
    </main>
  );
}
