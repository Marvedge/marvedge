import { toast } from "sonner";
import axios from "axios";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { Segment } from "../hooks/useEditorState";
import { uploadBlobToGcs } from "@/app/lib/gcsUploadClient";
import { fixWebmDurationIfNeeded } from "@/app/lib/fixWebmDuration";
import type { SubtitleStyle } from "@/app/lib/subtitles";
import type { WatermarkConfig } from "@/app/types/wtm";

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
  /** SUB PR 4: the demo's persisted subtitle appearance, or null when unstyled. */
  subtitleStyle?: SubtitleStyle | null;
  /** SUB PR 5: the active track's language, or undefined for auto-detect. */
  subtitleLanguage?: string;
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

async function uploadDemoSourceVideo(videoUrl: string): Promise<string | null> {
  try {
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
    return upload.url;
  } catch (cloudError) {
    console.error("Error uploading source video to GCS:", cloudError);
    toast.dismiss();
    toast.error("Failed to upload source video");
    return null;
  }
}

interface DemoConflictParams {
  data: { title: string; description: string };
  editingToSave: Record<string, unknown>;
  conflictData: unknown;
  setSidebarTitle: (title: string) => void;
  setSidebarDescription: (description: string) => void;
  setShowSaveDemoModal: (show: boolean) => void;
  setDemoSaved?: (saved: boolean) => void;
  setSavedDemoId?: (id: string | null) => void;
  onSaveSuccess?: () => void;
}

async function handleDemoConflict({
  data,
  editingToSave,
  conflictData,
  setSidebarTitle,
  setSidebarDescription,
  setShowSaveDemoModal,
  setDemoSaved,
  setSavedDemoId,
  onSaveSuccess,
}: DemoConflictParams): Promise<void> {
  console.log("Demo already saved:", conflictData);
  const existingId = getDemoIdFromApiResponse(conflictData) || undefined;
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
  const conflictDemoId = getDemoIdFromApiResponse(conflictData);
  if (setSavedDemoId && conflictDemoId) {
    setSavedDemoId(conflictDemoId);
  }
  if (onSaveSuccess) {
    onSaveSuccess();
  }
  toast.dismiss();
  toast.warning("This demo has already been saved!");
  setShowSaveDemoModal(false);
}

export async function handleSaveDemo(
  data: {
    title: string;
    description: string;
    tags?: string[];
    integrations?: string[];
    userRoles?: string[];
    featured?: boolean;
  },
  params: SaveDemoParams
) {
  const {
    videoUrl,
    currentSegments,
    zoomEffects,
    subtitles,
    subtitleStyle,
    subtitleLanguage,
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
      const uploadedUrl = await uploadDemoSourceVideo(videoUrl);
      if (!uploadedUrl) {
        return;
      }
      sourceVideoUrl = uploadedUrl;
    }

    // Use current segments from the timeline
    const segmentsToSave = currentSegments;

    // Call the API to save demo with editing object
    const editingToSave = {
      segments: segmentsToSave,
      zoom: zoomEffects,
      background: selectedBackground ?? null,
      subtitles: subtitles || null,
      // SUB PR 4: this path replaces `editing` wholesale, so a saved style has
      // to be re-sent or an explicit Save would wipe what autosave wrote.
      subtitleStyle: subtitleStyle ?? null,
      subtitleLanguage: subtitleLanguage || null,
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
            tags: data.tags || [],
            integrations: data.integrations || [],
            userRoles: data.userRoles || [],
            featured: typeof data.featured === "boolean" ? data.featured : false,
            editing: editingToSave,
          })
        : await axios.post("/api/demo", {
            title: data.title,
            description: data.description,
            videoUrl: sourceVideoUrl,
            tags: data.tags || [],
            integrations: data.integrations || [],
            userRoles: data.userRoles || [],
            featured: typeof data.featured === "boolean" ? data.featured : false,
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
            await handleDemoConflict({
              data,
              editingToSave,
              conflictData: error.response.data,
              setSidebarTitle,
              setSidebarDescription,
              setShowSaveDemoModal,
              setDemoSaved,
              setSavedDemoId,
              onSaveSuccess,
            });
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
  // SUB: the demo's `editing.subtitleStyle`, if any. Only a *request* — the
  // route re-sanitizes it server-side. Undefined for a demo that was never
  // styled, which is what keeps its export byte-identical to master.
  subtitleStyle?: SubtitleStyle;
  // SUB: the active track's language. Only a *request* — the route re-normalizes
  // it. Omitted/auto-detect leaves the recipe as it is today.
  subtitleLanguage?: string;
  // SUB PR 6: whether to burn the subtitles into the picture. Undefined means
  // yes, which is what burn-in did before it was a choice; only an explicit
  // `false` reaches the request body, so a caller that ignores this field sends
  // exactly the payload it sends today.
  burnSubtitles?: boolean;
  // WTM: the demo's `editing.wtm.watermark`, if any. Only a *request* — the
  // server re-resolves the effective watermark from the user's plan.
  watermark?: WatermarkConfig;
  // WTM: optional pre-pass over the resolved source, run after any blob upload
  // (so it always receives a URL the worker can fetch) and before the job is
  // created. The camera-bubble compositor uses it to hand the chunked export an
  // already-composited MP4 — see useExportFlow. Omitted → nothing changes.
  //
  // `setStatus` writes to the export's own progress toast, so a slow pre-pass
  // can say what it is doing without the caller needing to know which toaster
  // this module uses.
  //
  // Contract: must resolve, never reject. A pre-pass that fails is expected to
  // return the URL it was given so the export still runs, just without whatever
  // the pre-pass would have added.
  prepareSourceUrl?: (
    sourceVideoUrl: string,
    ctx: { setStatus: (message: string) => void }
  ) => Promise<string>;
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

interface ResolveExportBackgroundParams {
  selectedBackground: string;
  customBackgroundUrl: string | null;
  imageMap: Record<string, string>;
  toastId: string | number;
}

async function resolveExportBackground({
  selectedBackground,
  customBackgroundUrl,
  imageMap,
  toastId,
}: ResolveExportBackgroundParams): Promise<{
  backgroundToUse: string;
  resolvedCustomBackgroundUrl: string | null;
}> {
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
  return { backgroundToUse, resolvedCustomBackgroundUrl };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMp4Downloader(jobId: string, sidebarTitle: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async (_url: string) => {
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
}

export interface PollExportJobParams {
  jobId: string;
  setProgress: (p: number) => void;
  toastId: string | number;
}

export async function pollExportJob({
  jobId,
  setProgress,
  toastId,
}: PollExportJobParams): Promise<string | null> {
  // Poll for job status every 5s
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
        return exportedUrl;
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
  subtitleStyle,
  subtitleLanguage,
  burnSubtitles,
  watermark,
  prepareSourceUrl,
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
    const { backgroundToUse, resolvedCustomBackgroundUrl } = await resolveExportBackground({
      selectedBackground,
      customBackgroundUrl,
      imageMap,
      toastId,
    });

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

    // WTM: give a pre-pass the chance to swap in a derived source (the webcam
    // bubble is composited into one MP4 before the chunked export ever sees it).
    // `sourceVideoUrl` deliberately stays pointing at the original upload — it
    // is what the exported-video record stores and what cleanup deletes, so
    // that bookkeeping is unchanged by a pre-pass.
    let renderSourceUrl = sourceVideoUrl;
    if (prepareSourceUrl) {
      const prepared = await prepareSourceUrl(sourceVideoUrl, {
        setStatus: (message: string) => toast.loading(message, { id: toastId }),
      });
      renderSourceUrl = prepared || sourceVideoUrl;
    }

    // 1. Initiate job on the backend
    toast.loading("Sending job to server...", { id: toastId });

    const createRes = await axios.post("/api/jobs/create", {
      videoUrl: renderSourceUrl,
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
      // SUB: omitted entirely when the demo was never styled, so the request
      // body — and therefore the burned-in result — is identical to today.
      ...(subtitleStyle ? { subtitleStyle } : {}),
      // Omitted for auto-detect, so a demo that never chose a language sends
      // exactly the body it sends today.
      ...(subtitleLanguage && subtitleLanguage !== "multi" ? { subtitleLanguage } : {}),
      // Sent only to turn burn-in OFF. The route reads `!== false`, so leaving
      // it out is the burn-in-on path every export has always taken.
      ...(burnSubtitles === false ? { burnSubtitles: false } : {}),
      // WTM: omitted entirely when the demo has no watermark config, so the
      // request body is identical to today for non-WTM demos.
      ...(watermark ? { watermark } : {}),
    });

    const { jobId } = createRes.data;
    if (!jobId) {
      throw new Error("No job ID returned");
    }

    toast.loading("Processing video...", { id: toastId });
    const downloadAsMp4 = createMp4Downloader(jobId, sidebarTitle);

    const exportedUrl = await pollExportJob({ jobId, setProgress, toastId });
    if (!exportedUrl) {
      return null;
    }

    return {
      exportedUrl,
      sourceVideoUrl,
      downloadAsMp4,
      uploadedSourceVideo,
    };
  } catch (error) {
    console.error("Export error:", error);
    toast.error("Failed to start export", { id: toastId });
    return null;
  }
};
