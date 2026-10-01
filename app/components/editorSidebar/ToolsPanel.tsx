import React, { useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import AddTextSection from "./AddTextSection";
import ExportResultModal from "../ExportResultModal";
import { useEditorStore } from "@/app/store/editor/editorStore";
import { uploadBlobToCloudinary } from "@/app/lib/cloudinaryClientUpload";
import {
  pollExportJob,
  createMp4Downloader,
} from "@/app/(signed)/editor/utils/videoHandlers";

interface ToolsPanelProps {
  aspectRatio: string;
  setAspectRatio?: (ratio: string) => void;
  browserFrameDrawShadow: boolean;
  setBrowserFrameDrawShadow?: (enabled: boolean) => void;
  browserFrameDrawBorder: boolean;
  setBrowserFrameDrawBorder?: (enabled: boolean) => void;
  textOverlayInput: string;
  setTextOverlayInput?: (value: string) => void;
  textOverlayFontFamily: string;
  setTextOverlayFontFamily?: (value: string) => void;
  textOverlayFontSize: number;
  setTextOverlayFontSize?: (value: number) => void;
  onAddTextOverlay?: () => void;
  textOverlayColor: string;
  setTextOverlayColor?: (value: string) => void;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({
  aspectRatio,
  setAspectRatio,
  browserFrameDrawShadow,
  setBrowserFrameDrawShadow,
  browserFrameDrawBorder,
  setBrowserFrameDrawBorder,
  textOverlayInput,
  setTextOverlayInput,
  textOverlayFontFamily,
  setTextOverlayFontFamily,
  textOverlayFontSize,
  setTextOverlayFontSize,
  onAddTextOverlay,
  textOverlayColor,
  setTextOverlayColor,
}) => {
  const videoUrl = useEditorStore((s) => s.videoUrl);
  const savedDemoId = useEditorStore((s) => s.savedDemoId);
  const sidebarTitle = useEditorStore((s) => s.sidebarTitle);

  const [isReframing, setIsReframing] = useState(false);
  const [reframeProgress, setReframeProgress] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [reframedUrl, setReframedUrl] = useState<string | null>(null);
  const [reframedJobId, setReframedJobId] = useState<string | null>(null);

  const targetRatio = aspectRatio === "native" ? "9:16" : aspectRatio;

  const handleAutoReframe = async () => {
    if (!videoUrl) {
      toast.error("Please load or record a video first.");
      return;
    }
    if (isReframing) return;

    setIsReframing(true);
    setReframeProgress(0);
    const toastId = toast.loading("Starting auto-reframe...");

    try {
      let resolvedUrl = videoUrl;

      // If it's a blob, upload it to Cloudinary to get the public HTTPS URL for AutoFlip
      if (videoUrl.startsWith("blob:")) {
        toast.loading("Uploading source video...", { id: toastId });
        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error("Failed to load local video blob");
        }
        const blob = await response.blob();
        resolvedUrl = await uploadBlobToCloudinary(blob);
      } else if (videoUrl.startsWith("gs://")) {
        toast.loading("Resolving video URL...", { id: toastId });
        const res = await fetch(
          `/api/gcs/resolve?url=${encodeURIComponent(videoUrl)}`
        );
        if (!res.ok) {
          throw new Error("Failed to resolve storage URL");
        }
        const data = await res.json();
        if (!data.url) {
          throw new Error("Storage URL resolution returned empty URL");
        }
        resolvedUrl = data.url;
      }

      toast.loading("Submitting reframe job...", { id: toastId });
      const createRes = await axios.post("/api/reframe", {
        videoUrl: resolvedUrl,
        targetAspectRatio: targetRatio,
        demoId: savedDemoId || undefined,
      });

      const jobId = createRes.data?.jobId;
      if (!jobId) {
        throw new Error("Failed to create reframe job: missing jobId");
      }

      toast.loading("Processing AI reframe...", { id: toastId });
      const outputUrl = await pollExportJob({
        jobId,
        setProgress: setReframeProgress,
        toastId,
      });

      if (!outputUrl) {
        throw new Error("Reframe processing did not produce an output URL");
      }

      setReframedJobId(jobId);
      setReframedUrl(outputUrl);
      setShowResultModal(true);

      // Auto-trigger download of the reframed MP4
      const downloadHandler = createMp4Downloader(
        jobId,
        `${sidebarTitle || "Demo"}_reframed_${targetRatio.replace(":", "_")}`
      );
      await downloadHandler(outputUrl);
    } catch (err: unknown) {
      console.error("Auto-reframe failed:", err);
      const errMsg =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : err instanceof Error
            ? err.message
            : "Failed to reframe video";
      toast.error(`Reframe failed: ${errMsg}`, { id: toastId });
    } finally {
      setIsReframing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="control-block-label text-lg font-bold text-[#A594F9] mb-4">Aspect Ratio</h2>
        <div className="relative w-[180px]">
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio && setAspectRatio(e.target.value)}
            className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#7C5CFC] font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-[#A594F9] cursor-pointer"
          >
            <option value="native">Native</option>
            <option value="16:9">16:9</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
            <option value="2:3">2:3</option>
            <option value="9:16">9:16</option>
          </select>

          <div className="absolute top-0 right-0 h-full w-10 flex items-center justify-center pointer-events-none">
            <svg
              className="w-4 h-4 text-[#7C5CFC]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={handleAutoReframe}
            disabled={isReframing}
            className={`w-[180px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold text-white transition shadow-sm ${
              isReframing
                ? "bg-[#A594F9] cursor-not-allowed opacity-80"
                : "bg-[#7C5CFC] hover:bg-[#6844fc] active:scale-[0.98] cursor-pointer"
            }`}
          >
            {isReframing ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Reframing {reframeProgress > 0 ? `${reframeProgress}%` : "..."}</span>
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
                <span>Auto-Reframe</span>
              </>
            )}
          </button>
          <p className="text-xs text-[#7A7A7A] mt-1">
            Reframe video to {targetRatio} with AI
          </p>
        </div>
      </div>

      <ExportResultModal
        isOpen={showResultModal}
        shareUrl={reframedUrl}
        title={`${sidebarTitle || "Demo"}_reframed_${targetRatio.replace(":", "_")}`}
        onClose={() => setShowResultModal(false)}
        onDownloadMp4={() => {
          if (reframedJobId && reframedUrl) {
            createMp4Downloader(
              reframedJobId,
              `${sidebarTitle || "Demo"}_reframed_${targetRatio.replace(":", "_")}`
            )(reframedUrl);
          }
        }}
        onSaveShareLink={() => {
          if (reframedUrl) {
            navigator.clipboard.writeText(reframedUrl);
            toast.success("Share link copied to clipboard!");
          }
        }}
      />

      <div>
        <h2 className="control-block-label text-lg font-bold text-[#A594F9] mb-4">Browser Frame</h2>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() =>
              setBrowserFrameDrawShadow && setBrowserFrameDrawShadow(!browserFrameDrawShadow)
            }
            className="toggle-flex-row w-full flex items-center justify-between py-1 text-sm"
          >
            <span className="text-[#6B6B6B] dark:text-inherit">Draw Shadow</span>
            <span
              className={`pill-slider relative inline-flex h-6 w-11 items-center rounded-full transition ${
                browserFrameDrawShadow ? "bg-[#8A76FC]" : "bg-[#A3A3A3]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  browserFrameDrawShadow ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setBrowserFrameDrawBorder && setBrowserFrameDrawBorder(!browserFrameDrawBorder)
            }
            className="toggle-flex-row w-full flex items-center justify-between py-1 text-sm"
          >
            <span className="text-[#6B6B6B] dark:text-inherit">Draw Border</span>
            <span
              className={`pill-slider relative inline-flex h-6 w-11 items-center rounded-full transition ${
                browserFrameDrawBorder ? "bg-[#8A76FC]" : "bg-[#A3A3A3]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  browserFrameDrawBorder ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      <AddTextSection
        textOverlayInput={textOverlayInput}
        setTextOverlayInput={setTextOverlayInput}
        textOverlayFontFamily={textOverlayFontFamily}
        setTextOverlayFontFamily={setTextOverlayFontFamily}
        textOverlayFontSize={textOverlayFontSize}
        setTextOverlayFontSize={setTextOverlayFontSize}
        textOverlayColor={textOverlayColor}
        setTextOverlayColor={setTextOverlayColor}
        onAddTextOverlay={onAddTextOverlay}
      />
    </div>
  );
};

export default ToolsPanel;
