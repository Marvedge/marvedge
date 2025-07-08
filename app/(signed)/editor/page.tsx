"use client";
import { useRef, useState, useEffect, MouseEvent } from "react";
import { useBlobStore } from "@/app/lib/blobStore";
import { useEditor } from "@/app/hooks/useEditor";
//import EditorControls from "@/app/components/EditorControls";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ReactPlayer from 'react-player'
import { Button } from "@/components/ui/button"
//import dynamic from "next/dynamic";
import { TimelineSlider } from "@/app/components/MytimeLine";
//import KonvaTimeLineCmp from '../../components/KonvaTimeline'

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
  // const TimelineCanvas = dynamic(() => import("../../components/TimeLine"), { ssr: false });
  // const KonvaTimeLineCmp = dynamic(() => import("../../components/KonvaTimeline"), { ssr: false })
  const router = useRouter();
  const blob = useBlobStore((state) => state.blob);
  const {
    videoUrl: recordedVideoUrl,
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

  const [duration, setDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  //const [zoom, setzoom] = useState(0)
  //const [currentTime, setCurrentTime] = useState(0);

  const videoPanelRef = useRef<HTMLDivElement>(null);
  //const [timelineWidth, setTimelineWidth] = useState(800);

  // useLayoutEffect(() => {
  //   function updateWidth() {
  //     if (videoPanelRef.current) setTimelineWidth(videoPanelRef.current.offsetWidth);
  //   }
  //   updateWidth();
  //   window.addEventListener("resize", updateWidth);
  //   return () => window.removeEventListener("resize", updateWidth);
  // }, []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reactPlayerRef = useRef<ReactPlayer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<"blur" | "rect" | "arrow" | "text" | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [textColor, setTextColor] = useState("#000000");
  const [textFont, setTextFont] = useState("16px sans-serif");



  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } else {
      setVideoUrl(recordedVideoUrl);
    }
  }, [blob, recordedVideoUrl]);


  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

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

    if (!tool) {
      setDrawing(false);
      setStartPos(null);
      return;
    }

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
      } as RectOverlay;
    }

    setOverlays((prev) => [...prev, newOverlay]);
    setDrawing(false);
    setStartPos(null);
  };

  const handleUndo = () => setOverlays((prev) => prev.slice(0, -1));
  const handleClear = () => setOverlays([]);
  const handleSaveOverlays = () => {
    localStorage.setItem("videoOverlays", JSON.stringify(overlays));
    alert("overLays saved")
  }
  const handleLoadOverlays = () => {
    const saved = localStorage.getItem("videoOverlays");
    if (saved) setOverlays(JSON.parse(saved));
    alert('Overlay loaded')
  };

  return (
    <main className="min-h-screen bg-gray-50 mt-2 ml-0">
      <button
        onClick={() => router.push("/recorder")}
        className="mb-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
      >
        🔙 Back to Recorder
      </button>

      <h1 className="text-2xl font-bold mb-6 text-gray-800">🎬 Video Editor</h1>


      <div className="flex flex-col lg:flex-row">
        <div className="md:col-span-2 space-y-4">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-600">
                ⏳ Trimming video, please wait...
              </p>
            </div>
          ) : videoUrl ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[75%_25%] gap-5">
                <div>
                  <div
                    ref={videoPanelRef}
                    className="relative rounded-lg border border-gray-300 shadow-sm bg-black overflow-hidden"
                  >
                    <ReactPlayer
                      ref={(player) => {
                        reactPlayerRef.current = player;
                        videoRef.current = player?.getInternalPlayer() as HTMLVideoElement;
                      }}
                      url={videoUrl}
                      controls
                      playing={false}
                      muted={false}
                      width="100%"
                      height="250px"
                      style={{ maxHeight: "360px" }}
                      playsinline
                      onReady={() => {
                        const vid = videoRef.current;
                        if (vid && !isNaN(vid.duration)) {
                          setDuration(Math.floor(vid.duration));
                          console.log(vid.duration)
                        }

                      }}
                      onDuration={(dur) => setDuration(Math.floor(dur))}
                      //onProgress={({ playedSeconds }) => setCurrentTime(playedSeconds)}
                    />
                    <canvas
                      ref={canvasRef}
                      className={`absolute top-0 left-0 w-full h-full z-10 ${tool ? "cursor-crosshair" : "pointer-events-none cursor-default"}`}
                      onMouseDown={handleMouseDown}
                      onMouseUp={handleMouseUp}
                    />
                    <div className="mt-4">
                      {/* <TimelineCanvas
                        width={timelineWidth}
                        currentTime={currentTime}
                        duration={duration}
                        zoom={zoom}
                        setCurrentTime={(t) => {
                          setCurrentTime(t);
                          if (reactPlayerRef.current) {
                            reactPlayerRef.current.seekTo(t, "seconds");
                          } else if (videoRef.current) {
                            videoRef.current.currentTime = t;
                          }
                        }}
                        setZoom={setzoom}
                      /> */}
                      {/* <KonvaTimeLineCmp start={0} end={duration}/> */}
                      {
                        duration != 0 &&
                        <TimelineSlider
                          duration={duration}
                          ontrim={(start, end) => {
                            setOverlays(overlays)
                            trimApplier(start, end)
                          }}
                          processing={processing}
                          videoRef={videoRef}
                        />
                      }
                    </div>
                    {/* <div className="mt-2">
                      <label className="mr-2">Zoom:</label>
                      <input
                        type="range"
                        min={0.5}
                        max={5}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setzoom(parseFloat(e.target.value))}
                      />
                    </div> */}
                  </div>
                  {/* <EditorControls
                    duration={duration}
                    onTrim={(start, end) => {
                      setOverlays(overlays);
                      trimApplier(start, end);
                    }}
                    processing={processing}
                    videoRef={videoRef}
                  /> */}
                </div>
                <div className="w-full max-w-xs ">
                  <h2 className="text-xl font-semibold mb-3 text-gray-700">🧰 Tools</h2>
                  <div className="flex flex-col gap-3">
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

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      {["blur", "rect", "arrow", "text"].map((t) => (
                        <Button
                          key={t}
                          onClick={() => setTool(tool == t ? null : t as typeof tool)}
                          variant='outline'
                          className={`w-[100px] h-[50px] rounded-md text-black ${tool === t ? "bg-blue-700" : "bg-blue-500"
                            }`}
                        >
                          {t.toUpperCase()}
                        </Button>
                      ))}

                      <Button
                        onClick={handleUndo}
                        className="bg-yellow-600 w-[100px] h-[300xl] rounded-md text-black  px-3 py-1 hover:bg-red-100"
                      >
                        ↩️ Undo
                      </Button>

                      <Button
                        variant='destructive'
                        onClick={handleClear}
                        className="w-[100px] h-[50px] rounded-md text-black px-3 py-1 hover:bg-red-50"
                      >
                        ❌ Clear
                      </Button>

                      <Button
                        variant='default'
                        onClick={handleSaveOverlays}
                        className="bg-green-600 px-3 py-1 w-[100px] h-[50px] rounded-md text-black hover:bg-red-50"
                      >
                        💾 Save
                      </Button>

                      <Button
                        onClick={handleLoadOverlays}
                        className="bg-yellow-400 px-3 py-1 w-[100px] h-[50px] rounded-md text-black hover:bg-red-50"
                      >
                        📂 Load
                      </Button>
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
                          alt="thumbnail"
                          width={128}
                          height={72}
                          className="w-32 mt-2 rounded border"
                          unoptimized
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
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-gray-600">No video found.</p>
          )}
        </div>

        <div>

        </div>
      </div>
    </main>
  );
}
