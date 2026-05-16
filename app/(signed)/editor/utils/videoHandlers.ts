import { toast } from "sonner";
import axios from "axios";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { Segment } from "../hooks/useEditorState";
import { uploadBlobToGcs } from "@/app/lib/gcsUploadClient";
import { fixWebmDurationIfNeeded } from "@/app/lib/fixWebmDuration";

function getDemoIdFromApiResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const maybeDemo = (data as { demo?: unknown }).demo;
  if (!maybeDemo || typeof maybeDemo !== "object") {
    return null;
  }
  const id = (maybeDemo as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// Utility: Convert seconds or "mm:ss" etc. to "HH:MM:SS"
export function normalizeTimeFormat(time: string | number): string {
  let totalSeconds: number;

  if (typeof time === "number") {
    totalSeconds = time;
  } else if (time.includes(":")) {
    // Handle "mm:ss" or "hh:mm:ss"
    const parts = time.split(":").map(Number);
    if (parts.length === 2) {
      totalSeconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      throw new Error("Invalid time format: " + time);
    }
  } else {
    totalSeconds = Number(time);
  }

  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(Math.floor(totalSeconds % 60)).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

interface SaveDemoParams {
  videoUrl: string;
  inputStartTime: string;
  inputEndTime: string;
  currentSegments: Segment[];
  zoomEffects: ZoomEffect[];
  subtitles?: { start: number; end: number; text: string }[];
  selectedBackground?: string | null;
  backgroundType?: string;
  aspectRatio?: string;
  browserFrame?: {
    mode: "default" | "minimal" | "hidden";
    drawShadow: boolean;
    drawBorder: boolean;
  };
  textOverlays?: unknown;
  savedDemoId?: string | null;
  setSavingDemo: (saving: boolean) => void;
  setSidebarTitle: (title: string) => void;
  setSidebarDescription: (description: string) => void;
  setShowSaveDemoModal: (show: boolean) => void;
  setDemoSaved?: (saved: boolean) => void;
  setSavedDemoId?: (id: string | null) => void;
  onSaveSuccess?: () => void;
}

export async function handleSaveDemo(
  data: { title: string; description: string },
  params: SaveDemoParams
) {
  const {
    videoUrl,
    inputStartTime,
    inputEndTime,
    currentSegments,
    zoomEffects,
    subtitles,
    selectedBackground,
    backgroundType,
    aspectRatio,
    browserFrame,
    textOverlays,
    savedDemoId,
    setSavingDemo,
    setSidebarTitle,
    setSidebarDescription,
    setShowSaveDemoModal,
    setDemoSaved,
    setSavedDemoId,
    onSaveSuccess,
  } = params;

  if (!videoUrl) {
    toast.error("No video available to save");
    return;
  }

  try {
    setSavingDemo(true);
    toast.loading("Saving demo...");

    const startTime = inputStartTime;
    const endTime = inputEndTime;

    // If this is an existing demo, we should only update the existing row's state.
    // Never POST (which can 409) and never re-upload the raw video.
    const urlDemoId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("demoId")
        : null;
    const existingDemoId = savedDemoId ?? urlDemoId ?? null;

    // First, upload source video to GCS if it's a blob URL
    let sourceVideoUrl = videoUrl;
    if (!existingDemoId && videoUrl.startsWith("blob:")) {
      try {
        // Get the video blob
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch video blob");
        }
        const videoBlob = await response.blob();
        const fixedVideoBlob = await fixWebmDurationIfNeeded(videoBlob);

        console.log("Uploading source video to GCS...");
        const upload = await uploadBlobToGcs({
          blob: fixedVideoBlob,
          filename: "video.webm",
          kind: "demo-source",
        });
        sourceVideoUrl = upload.url;
      } catch (cloudError) {
        console.error("Error uploading source video to GCS:", cloudError);
        toast.dismiss();
        toast.error("Failed to upload source video");
        return;
      }
    }

    // Use current segments from the timeline
    const segmentsToSave =
      currentSegments.length > 0
        ? currentSegments
        : [
            {
              start: startTime,
              end: endTime,
            },
          ];

    // Call the API to save demo with editing object
    const editingToSave = {
      segments: segmentsToSave,
      zoom: zoomEffects,
      background: selectedBackground ?? null,
      subtitles: subtitles || null,
      textOverlays: textOverlays || [],
      backgroundType: backgroundType || "",
      aspectRatio: aspectRatio || "native",
      browserFrame: browserFrame || {
        mode: "default",
        drawShadow: true,
        drawBorder: false,
      },
    };

    try {
      const response = existingDemoId
        ? await axios.patch("/api/demo", {
            id: existingDemoId,
            title: data.title,
            description: data.description,
            editing: editingToSave,
          })
        : await axios.post("/api/demo", {
            title: data.title,
            description: data.description,
            videoUrl: sourceVideoUrl,
            editing: editingToSave,
          });
      console.log("Demo saved/updated:", response.data);

      // Set the saved state
      if (setDemoSaved) {
        setDemoSaved(true);
      }
      if (setSavedDemoId) {
        setSavedDemoId(getDemoIdFromApiResponse(response.data) || existingDemoId);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 409) {
            // Demo already exists
            console.log("Demo already saved:", error.response.data);
            const existingId = getDemoIdFromApiResponse(error.response.data) || undefined;
            if (existingId) {
              try {
                const patchRes = await axios.patch("/api/demo", {
                  id: existingId,
                  title: data.title,
                  description: data.description,
                  editing: editingToSave,
                });
                if (setDemoSaved) {
                  setDemoSaved(true);
                }
                if (setSavedDemoId) {
                  setSavedDemoId(existingId);
                }
                if (onSaveSuccess) {
                  onSaveSuccess();
                }
                toast.dismiss();
                toast.success("Demo updated successfully!");
                // Ensure sidebar reflects the saved text immediately.
                setSidebarTitle(data.title);
                setSidebarDescription(data.description);
                setShowSaveDemoModal(false);
                console.log("Demo updated after 409:", patchRes.data);
                return;
              } catch (patchErr) {
                console.error("Failed to update existing demo after 409:", patchErr);
                toast.dismiss();
                toast.error("Failed to update demo");
                throw patchErr;
              }
            }
            if (setDemoSaved) {
              setDemoSaved(true);
            }
            if (setSavedDemoId && error.response.data.demo?.id) {
              setSavedDemoId(error.response.data.demo.id);
            }
            if (onSaveSuccess) {
              onSaveSuccess();
            }
            toast.dismiss();
            toast.warning("This demo has already been saved!");
            setShowSaveDemoModal(false);
            return;
          }
          console.error(
            `Failed to save demo: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
        } else {
          console.error("Axios error:", error.message);
        }
      } else if (error instanceof Error) {
        console.error("Unexpected error:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
      throw error;
    }

    // Update the sidebar state with the saved data
    setSidebarTitle(data.title);
    setSidebarDescription(data.description);
    toast.dismiss();
    toast.success(savedDemoId ? "Demo updated successfully!" : "Demo saved successfully!");
    // Call success callback to update parent component tracking
    if (onSaveSuccess) {
      onSaveSuccess();
    }
    // Close the modal
    setShowSaveDemoModal(false);
  } catch (error) {
    console.error("Error saving demo:", error);
    toast.dismiss();
    toast.error("Failed to save demo");
  } finally {
    setSavingDemo(false);
  }
}

interface VideoTrimParams {
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  setProgress: (progress: number) => void;
  duration: number;
}
function parseTimeToSeconds(str: string): number {
  const [h, m, s] = str.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
function secondsToTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export async function videoTrimHandler(
  segments: { start: number; end: number }[],
  params: VideoTrimParams
) {
  const { videoUrl, setVideoUrl, setProgress, duration } = params;

  try {
    setProgress(1);
    toast.loading("Trimming video...");

    // Check if videoUrl exists
    if (!videoUrl) {
      toast.error("No video available to trim");
      return;
    }

    // const normalizedSegments = segments.map((seg) => ({
    //   start: normalizeTimeFormat(seg.start),
    //   end: normalizeTimeFormat(seg.end),
    // }));
    // normalizedSegments.push({
    //   start: normalizeTimeFormat(segments[0].end),
    //   end: normalizeTimeFormat(8),
    // });
    // 1. Normalize and convert to SECONDS
    const normalizedSegments = segments
      .map((seg) => ({
        start: parseTimeToSeconds(normalizeTimeFormat(seg.start)),
        end: parseTimeToSeconds(normalizeTimeFormat(seg.end)),
      }))
      .sort((a, b) => a.start - b.start); // 2. SORT REMOVE SEGMENTS

    // 3. Build KEEP segments from gaps
    const keepSegments = [];
    let cursor = 0;

    for (const seg of normalizedSegments) {
      // Keep any time between cursor → segment.start
      if (cursor < seg.start) {
        keepSegments.push({
          start: cursor,
          end: seg.start,
        });
      }

      // move cursor to end of REMOVE segment
      cursor = seg.end;
    }

    // 4. Final segment after last trimmed part
    if (cursor < duration) {
      keepSegments.push({
        start: cursor,
        end: duration,
      });
    }

    // 5. Convert back to HH:MM:SS for your existing ffmpeg code
    const newNormalizedSegments = keepSegments.map((seg) => {
      console.log("newNormalizedSegments", seg);
      return {
        start: secondsToTime(seg.start),
        end: secondsToTime(seg.end),
      };
    });

    console.log("Segments to KEEP:", newNormalizedSegments);

    console.log("Starting trim process...");
    console.log("Video URL:", videoUrl);
    console.log("Segments:", segments);
    console.log("normalizedSegments", normalizedSegments);

    // Validate segments
    if (!segments || segments.length === 0) {
      throw new Error("No segments provided");
    }
    const mp4VideoUrl = videoUrl.endsWith(".webm") ? videoUrl.replace(".webm", ".mp4") : videoUrl;

    const res = await fetch(mp4VideoUrl);
    const blob = await res.blob();

    const formData = new FormData();
    formData.append("video", blob, "video.mp4");
    formData.append("segments", JSON.stringify(newNormalizedSegments));

    console.log("Send Data", newNormalizedSegments);

    const TRIMURL = `${process.env.NEXT_PUBLIC_VIDEO_PROCESSING_BACKEND_URL}/api/trim`;
    const resp = await axios.post(TRIMURL, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "blob",
    });
    setProgress(95);

    const videoBlob = new Blob([resp?.data], { type: "video/mp4" });
    const newVideoUrl = URL.createObjectURL(videoBlob);
    //setVideoUrl(newVideoUrl);

    console.log("Trimmed video URL:", newVideoUrl);
    // Get the current video blob
    // const response = await fetch(videoUrl);
    // if (!response.ok) {
    //   throw new Error(`Failed to fetch video: ${response.status}`);
    // }
    // const videoBlob = await response.blob();
    // console.log("Video blob size:", videoBlob.size);

    // // Use client-side WASM FFmpeg trimmer
    // console.log("Processing trim on client side...");
    // const { videoTrimmer } = await import("@/app/lib/ffmpeg");

    // // Use only the first segment for trimming
    // const firstSegment = normalizedSegments[0];
    // const trimmedBlob = await videoTrimmer(videoBlob, firstSegment.start, firstSegment.end);
    // setProgress(95);

    // const trimmedVideoUrl = URL.createObjectURL(trimmedBlob);

    // if (trimmedVideoUrl) {
    //   toast.dismiss();
    //   toast.success("Video trimmed successfully!");
    //   setVideoUrl(trimmedVideoUrl);
    //   setProgress(100);
    // } else {
    //   toast.error("Failed to trim video - no trimmedUrl returned");
    // }
    if (newVideoUrl) {
      toast.dismiss();
      toast.success("Video trimmed successfully!");
      setVideoUrl(newVideoUrl);
      setProgress(100);
      return newVideoUrl;
    } else {
      toast.error("Failed to trim video - no trimmedUrl returned");
    }
  } catch (err: unknown) {
    console.error("Trim handler error:", err);
    if (axios.isAxiosError(err)) {
      const message = err.response?.data?.message || "Unexpected error";
      toast.dismiss();
      toast.error(`Error processing video: ${message}`);
    } else if (err instanceof Error) {
      toast.dismiss();
      toast.error(`Error: ${err.message}`);
    } else {
      toast.dismiss();
      toast.error("Something went wrong");
    }
    return err;
  } finally {
    setProgress(0);
  }
}

interface ExportVideoParams {
  videoUrl: string;
  selectedBackground: string;
  customBackgroundUrl: string | null;
  imageMap: Record<string, string>;
  sidebarTitle: string;
  sidebarDescription: string;
  segments: { start: number; end: number }[];
  zoomSegments: ZoomEffect[];
  subtitles?: { start: number; end: number; text: string }[];
  textOverlays: {
    id: string;
    text: string;
    x: number;
    y: number;
    startTime: number;
    endTime: number;
    fontFamily: string;
    fontSize: number;
    color: string;
  }[];
  setProgress: (p: number) => void;
  aspectRatio?: string;
  browserFrame?: {
    mode: "default" | "minimal" | "hidden";
    drawShadow: boolean;
    drawBorder: boolean;
  };
  duration?: number;
  savedDemoId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: any; // The new export settings
}

interface ExportVideoResult {
  exportedUrl: string;
  sourceVideoUrl: string;
  downloadAsMp4: (url: string) => Promise<void>;
  uploadedSourceVideo: boolean;
}

async function uploadImageBlobToGcs(imageBlob: Blob): Promise<string> {
  const uploaded = await uploadBlobToGcs({
    blob: imageBlob,
    filename: "background.png",
    kind: "background",
  });
  return uploaded.url;
}

async function rasterizeSvgToPngBlob(svgPath: string, width = 1920, height = 1080): Promise<Blob> {
  // Convert selected frontend SVG background into a PNG so backend FFmpeg can consume it.
  const absoluteSvgUrl = svgPath.startsWith("http")
    ? svgPath
    : `${window.location.origin}${svgPath}`;

  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load SVG: ${absoluteSvgUrl}`));
    img.src = absoluteSvgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable while rasterizing background");
  }

  // Match editor page base behind SVG art so exports don't get white edge artifacts.
  ctx.fillStyle = "#F1ECFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 1);
  });

  if (!pngBlob) {
    throw new Error("Failed converting SVG to PNG blob");
  }

  return pngBlob;
}

async function fetchPublicAssetAsBlob(assetPathOrUrl: string): Promise<Blob> {
  const absoluteUrl = assetPathOrUrl.startsWith("http")
    ? assetPathOrUrl
    : `${window.location.origin}${assetPathOrUrl}`;
  const resp = await fetch(absoluteUrl, { mode: "cors" });
  if (!resp.ok) {
    throw new Error(`Failed to fetch asset: ${absoluteUrl}`);
  }
  return await resp.blob();
}

export const exportVideo = async ({
  videoUrl,
  selectedBackground,
  customBackgroundUrl,
  imageMap,
  sidebarTitle,
  sidebarDescription,
  segments,
  zoomSegments,
  subtitles,
  textOverlays,
  setProgress,
  aspectRatio,
  browserFrame,
  duration,
  savedDemoId,
  settings,
}: ExportVideoParams): Promise<ExportVideoResult | null> => {
  const toastId = toast.loading("Preparing to export...");
  const exportSettings = settings || {
    quality: "720p",
    fps: "24 FPS",
    compression: "Web",
    speed: "Default",
  };

  try {
    let uploadedSourceVideo = false;
    let backgroundToUse = "transparent";
    let resolvedCustomBackgroundUrl: string | null = null;
    if (selectedBackground === "custom" && customBackgroundUrl) {
      try {
        toast.loading("Uploading custom background...", { id: toastId });
        const response = await fetch(customBackgroundUrl);
        if (!response.ok) {
          throw new Error("Failed to read custom background");
        }
        const bgBlob = await response.blob();
        resolvedCustomBackgroundUrl = await uploadImageBlobToGcs(bgBlob);
        backgroundToUse = "custom";
      } catch (bgError) {
        console.error("Custom background upload failed:", bgError);
        backgroundToUse = "transparent";
      }
    } else if (
      selectedBackground &&
      selectedBackground !== "none" &&
      selectedBackground !== "transparent"
    ) {
      // For built-in backgrounds, ensure backend FFmpeg gets a real image input matching frontend selection.
      const mappedValue = imageMap[selectedBackground];
      if (mappedValue) {
        try {
          toast.loading("Preparing selected background...", { id: toastId });
          if (mappedValue.toLowerCase().endsWith(".svg")) {
            const pngBlob = await rasterizeSvgToPngBlob(mappedValue, 1920, 1080);
            resolvedCustomBackgroundUrl = await uploadImageBlobToGcs(pngBlob);
          } else {
            // Public-root images like /staticbackground.jpg etc.
            const blob = await fetchPublicAssetAsBlob(mappedValue);
            resolvedCustomBackgroundUrl = await uploadImageBlobToGcs(blob);
          }
          backgroundToUse = "custom";
        } catch (svgBgError) {
          console.error("Failed to rasterize/upload selected SVG background:", svgBgError);
          // Fallback to key so worker still applies a deterministic style.
          backgroundToUse = selectedBackground;
        }
      } else {
        // gradient:* / color:* paths
        backgroundToUse = selectedBackground;
      }
    }

    toast.loading("Preparing video for backend...", { id: toastId });

    let sourceVideoUrl = videoUrl;
    // If it's a blob, upload it to GCS first so the backend worker can access it
    if (videoUrl.startsWith("blob:")) {
      try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch video blob");
        }
        const videoBlob = await response.blob();
        const fixedVideoBlob = await fixWebmDurationIfNeeded(videoBlob);
        toast.loading("Uploading raw video to GCS...", { id: toastId });
        const uploaded = await uploadBlobToGcs({
          blob: fixedVideoBlob,
          filename: "video.webm",
          kind: "export-source",
        });
        sourceVideoUrl = uploaded.url;
        uploadedSourceVideo = true;
      } catch (cloudError) {
        console.error("Error uploading source to GCS:", cloudError);
        toast.error("Failed to upload source video", { id: toastId });
        return null;
      }
    }

    // 1. Initiate job on the backend
    toast.loading("Sending job to server...", { id: toastId });

    const createRes = await axios.post("/api/jobs/create", {
      videoUrl: sourceVideoUrl,
      title: sidebarTitle || "Untitled Demo",
      description: sidebarDescription || "",
      demoId: savedDemoId || null,
      segments,
      zoomEffects: zoomSegments,
      textOverlays,
      duration: duration || 0,
      selectedBackground: backgroundToUse,
      customBackgroundUrl: resolvedCustomBackgroundUrl,
      aspectRatio: aspectRatio || "native",
      browserFrame: browserFrame || {
        mode: "default",
        drawShadow: true,
        drawBorder: false,
      },
      imageMap,
      settings: exportSettings,
      subtitles: subtitles || [],
    });

    const { jobId } = createRes.data;
    if (!jobId) {
      throw new Error("No job ID returned");
    }

    toast.loading("Processing video...", { id: toastId });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const downloadAsMp4 = async (_url: string) => {
      const safeName = (sidebarTitle || "Exported_Demo")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const filename = `${safeName || "Exported_Demo"}.mp4`;
      const downloadUrl = `/api/jobs/${jobId}/download?title=${encodeURIComponent(
        sidebarTitle || "Exported_Demo"
      )}`;

      try {
        const response = await fetch(downloadUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(new Blob([blob], { type: "video/mp4" }));
        const link = document.createElement("a");
        link.href = localUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(localUrl);
      } catch (err) {
        console.error("Blob download failed, falling back to direct link:", err);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // 2. Poll for job status every 5s
    const MAX_POLLS = 180; // 15 minutes max (180 × 5s)
    for (let pollCount = 0; pollCount < MAX_POLLS; pollCount++) {
      try {
        const statusRes = await axios.get(`/api/jobs/${jobId}`);
        const { state, progress, exportedUrl, error } = statusRes.data;

        if (state === "active" || state === "waiting" || state === "delayed") {
          setProgress(progress || 0);
          toast.loading(`Processing... ${progress || 0}%`, { id: toastId });
          await sleep(5000);
          continue;
        }

        if (state === "completed") {
          if (!exportedUrl) {
            throw new Error("Export completed but no output URL was returned");
          }

          setProgress(100);
          toast.success("Export complete!", { id: toastId });

          return {
            exportedUrl,
            sourceVideoUrl,
            downloadAsMp4,
            uploadedSourceVideo,
          };
        }

        if (state === "failed") {
          throw new Error(error || "Unknown error");
        }
      } catch (err) {
        console.error("Error polling job status", err);
        const message = err instanceof Error ? err.message : "Lost connection to processing server";
        toast.error(`Export failed: ${message}`, { id: toastId });
        return null;
      }

      await sleep(5000);
    }

    toast.error("Export timed out after 15 minutes", { id: toastId });
    return null;
  } catch (error) {
    console.error("Export error:", error);
    toast.error("Failed to start export", { id: toastId });
    return null;
  }
};
