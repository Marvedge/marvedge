import { toast } from "sonner";
import axios from "axios";
import { ZoomEffect } from "@/app/types/editor/zoom-effect";
import { Segment } from "../hooks/useEditorState";
import { normalizeTimeFormat } from "@/app/lib/utils";
import { CLOUDINARY_CONFIG } from "@/app/config/cloudinary-client";

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
  } = params;

  const { uploadUrl, uploadPreset } = CLOUDINARY_CONFIG;

  if (!videoUrl) {
    toast.error("No video available to save");
    return;
  }

  try {
    setSavingDemo(true);
    toast.loading("Saving demo...");

    const startTime = inputStartTime;
    const endTime = inputEndTime;

    // Construct editing metadata
    const trimSegments =
      currentSegments.length > 0
        ? currentSegments
        : [
            {
              start: startTime,
              end: endTime,
            },
          ];

    const editingMetadata = {
      segments: trimSegments,
      zoom: zoomEffects,
    };

    if (videoUrl.startsWith("blob:")) {
      // Get the video blob
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch video blob");
      }
      const videoBlob = await response.blob();

      // Create FormData for Cloudinary upload
      const cloudFormData = new FormData();
      cloudFormData.append("file", videoBlob, "video.webm");
      cloudFormData.append("upload_preset", uploadPreset);

      const res = await axios.post(uploadUrl, cloudFormData);
      const cloudinaryVideoUrl = res.data.secure_url;

      await axios.post("/api/demo", {
        title: data.title,
        description: data.description,
        videoUrl: cloudinaryVideoUrl,
        editing: editingMetadata,
      });

      setSidebarTitle(data.title);
      setSidebarDescription(data.description);
      toast.dismiss();
      toast.success("Demo saved successfully!");
      setShowSaveDemoModal(false);
    } else {
      throw new Error("Video URL is not a blob URL");
    }
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
}

export async function videoTrimHandler(
  segments: { start: string; end: string }[],
  params: VideoTrimParams
) {
  const { videoUrl, setVideoUrl, setProgress } = params;

  try {
    setProgress(1);
    toast.loading("Trimming video...");

    // Check if videoUrl exists
    if (!videoUrl) {
      toast.error("No video available to trim");
      return;
    }

    const normalizedSegments = segments.map((seg) => ({
      start: normalizeTimeFormat(seg.start),
      end: normalizeTimeFormat(seg.end),
    }));

    console.log("Starting trim process...");
    console.log("Video URL:", videoUrl);
    console.log("Segments:", segments);

    // Validate segments
    if (!segments || segments.length === 0) {
      throw new Error("No segments provided");
    }

    // Get the current video blob
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`);
    }
    const videoBlob = await response.blob();
    console.log("Video blob size:", videoBlob.size);

    // Use client-side WASM FFmpeg trimmer
    console.log("Processing trim on client side...");
    const { videoTrimmer } = await import("@/app/lib/ffmpeg");

    // Use only the first segment for trimming
    const firstSegment = normalizedSegments[0];
    const trimmedBlob = await videoTrimmer(
      videoBlob,
      firstSegment.start,
      firstSegment.end
    );
    setProgress(95);

    const trimmedVideoUrl = URL.createObjectURL(trimmedBlob);

    if (trimmedVideoUrl) {
      toast.dismiss();
      toast.success("Video trimmed successfully!");
      setVideoUrl(trimmedVideoUrl);
      setProgress(100);
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
}

export async function exportVideo(params: ExportVideoParams) {
  const {
    videoUrl,
    selectedBackground,
    imageMap,
    sidebarTitle,
    sidebarDescription,
    router,
  } = params;

  if (!videoUrl) {
    toast.error("No video available to export");
    return;
  }

  try {
    console.log("sending from here #linex 1228");
    toast.loading("Processing video...");
    console.log(selectedBackground);

    // Fetch blob from ReactPlayer video
    const res = await fetch(videoUrl);
    const videoBlob = await res.blob();

    const formData = new FormData();
    formData.append("video", videoBlob, "video.webm");

    // Handle background
    if (selectedBackground) {
      const backgroundPath = imageMap[selectedBackground];
      console.log(backgroundPath);
      if (backgroundPath) {
        const bgUrl = `${window.location.origin}${backgroundPath}`;
        console.log("Fetching background from:", bgUrl);

        const bgRes = await fetch(bgUrl);
        if (!bgRes.ok) {
          throw new Error(`Failed to fetch background: ${bgUrl}`);
        }

        const bgBlob = await bgRes.blob();
        console.log("Background blob:", bgBlob);

        formData.append("background", bgBlob, "background.svg");
      }
    }

    const backendUrl = process.env.NEXT_PUBLIC_VIDEO_PROCESSING_BACKEND_URL;
    const cloudinaryUrl = process.env.NEXT_PUBLIC_CLOUDINARY_URL as string;
    const cloudinaryPreset = process.env
      .NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET as string;

    // Call backend FFmpeg server with axios
    const serverRes = await axios.post(
      `${backendUrl}/process-video`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );

    const { url } = serverRes.data; // backend returns { url }

    // Fetch processed video (mp4) from backend
    const processedRes = await axios.get(`${backendUrl}${url}`, {
      responseType: "blob",
    });
    const processedBlob = processedRes.data;

    // Upload processed video to Cloudinary with axios
    const cloudFormData = new FormData();
    cloudFormData.append("file", processedBlob, "final.mp4");
    cloudFormData.append("upload_preset", cloudinaryPreset);

    const cloudRes = await axios.post(cloudinaryUrl, cloudFormData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const cloudData = cloudRes.data;

    console.log("backend url is ", cloudData.secure_url);
    toast.dismiss();
    toast.success("Video exported with background!");

    // Navigate to preview page
    router.push(
      `/preview?video=${encodeURIComponent(cloudData.secure_url)}&title=${encodeURIComponent(sidebarTitle)}&description=${encodeURIComponent(sidebarDescription || "")}`
    );
  } catch (err) {
    console.error(err);
    toast.dismiss();
    toast.error("Export failed");
  }
}
