import { toast } from "sonner";
import axios from "axios";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { Segment } from "../hooks/useEditorState";

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

    // First, upload video to Cloudinary if it's a blob URL
    let cloudinaryVideoUrl = videoUrl;
    if (videoUrl.startsWith("blob:")) {
      try {
        // Get the video blob
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch video blob");
        }
        const videoBlob = await response.blob();

        // Create FormData for Cloudinary upload
        const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
        const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

        const cloudFormData = new FormData();
        cloudFormData.append("file", videoBlob, "video.webm");
        cloudFormData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

        console.log("Uploading to Cloudinary...");

        try {
          const cloudRes = await axios.post(CLOUDINARY_API_URL, cloudFormData);
          console.log("Upload success:", cloudRes.data);
          cloudinaryVideoUrl = cloudRes.data.secure_url;
        } catch (error: unknown) {
          if (axios.isAxiosError(error)) {
            console.log("cloudinary failed... ... ");
            console.error("Cloudinary upload failed:");
            console.error("Status:", error.response?.status);
            console.error("Status Text:", error.response?.statusText);
            console.error("Response Data:", error.response?.data);
            console.error("Headers:", error.response?.headers);
          } else {
            console.error("Unexpected error:", error);
          }
        }
      } catch (cloudError) {
        console.error("Error uploading to Cloudinary:", cloudError);
        toast.dismiss();
        toast.error("Failed to upload video to Cloudinary");
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
    };

    try {
      const response = await axios.post("/api/demo", {
        title: data.title,
        description: data.description,
        videoUrl: cloudinaryVideoUrl,
        editing: editingToSave,
      });
      console.log("Demo saved:", response.data);

      // Set the saved state
      if (setDemoSaved) {
        setDemoSaved(true);
      }
      if (setSavedDemoId && response.data.demo?.id) {
        setSavedDemoId(response.data.demo.id);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          if (error.response.status === 409) {
            // Demo already exists
            console.log("Demo already saved:", error.response.data);
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
    toast.success("Demo saved successfully!");
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
  selectedBackground: string | null;
  imageMap: Record<string, string>;
  sidebarTitle: string;
  sidebarDescription: string;
  router: {
    push: (url: string) => void;
  };
  segments: { start: number; end: number }[];
  zoomSegments: ZoomEffect[];
  setVideoUrl: (url: string) => void;
  setProgress: (progress: number) => void;
  duration: number;
  savedDemoId?: string | null;
}

export async function exportVideo(params: ExportVideoParams) {
  const {
    videoUrl,
    sidebarTitle,
    sidebarDescription,
    router,
    segments,
    zoomSegments,
    savedDemoId,
  } = params;

  if (!videoUrl) {
    toast.error("No video available to export");
    return;
  }

  try {
    toast.loading("Processing video...", { id: "export" });

    // 1. Fetch the original video blob
    const res = await fetch(videoUrl);
    let videoBlob = await res.blob();

    // 2. Apply trim segments (client-side WASM FFmpeg)
    if (segments.length > 0) {
      console.log("Applying trim segments:", segments);
      toast.loading("Applying trims...", { id: "export" });
      const { videoTrimmer } = await import("@/app/lib/ffmpeg");

      // Process segments from end to start so timestamps stay valid
      const sortedSegments = [...segments].sort((a, b) => b.start - a.start);
      for (const seg of sortedSegments) {
        const start = secondsToTime(seg.start);
        const end = secondsToTime(seg.end);
        videoBlob = await videoTrimmer(videoBlob, start, end);
      }
      console.log("Trim complete, blob size:", videoBlob.size);
    }

    // 3. Apply zoom effects (client-side WASM FFmpeg)
    if (zoomSegments.length > 0) {
      console.log("Applying zoom effects:", zoomSegments);
      toast.loading("Applying zoom effects...", { id: "export" });
      const { videoWithZoomEffects } = await import("@/app/lib/ffmpeg");
      videoBlob = await videoWithZoomEffects(videoBlob, zoomSegments);
      console.log("Zoom complete, blob size:", videoBlob.size);
    }

    // 4. Upload processed video directly to Cloudinary (no backend needed)
    toast.loading("Uploading to Cloudinary...", { id: "export" });

    const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
    const CLOUDINARY_UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;
    const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

    const cloudFormData = new FormData();
    cloudFormData.append("file", videoBlob, "exported-video.webm");
    cloudFormData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const cloudRes = await axios.post(CLOUDINARY_API_URL, cloudFormData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const exportedUrl = cloudRes.data.secure_url;
    console.log("Exported video URL:", exportedUrl);

    // 5. Save exportedUrl to DB if we have a saved demo
    if (savedDemoId) {
      try {
        await axios.patch("/api/demo", { id: savedDemoId, exportedUrl });
        console.log("Saved exportedUrl to demo:", savedDemoId);
      } catch (patchErr) {
        console.error("Failed to save exportedUrl to DB:", patchErr);
        // Don't fail the export — the video is already uploaded
      }
    }

    toast.success("Video exported successfully!", { id: "export" });

    // Navigate to preview page
    router.push(
      `/preview?video=${encodeURIComponent(exportedUrl)}&title=${encodeURIComponent(sidebarTitle)}&description=${encodeURIComponent(sidebarDescription || "")}`
    );
  } catch (err) {
    console.error("Export failed:", err);
    toast.error("Export failed", { id: "export" });
  }
}
