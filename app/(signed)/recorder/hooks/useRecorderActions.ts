import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Session } from "next-auth";
import { videoToMP4 } from "@/app/lib/ffmpeg";
import { sanitizeFilename } from "@/app/lib/constants";
import { useBlobStore } from "@/app/store/blobStore";
import { getActiveVideoUploadPromise } from "@/app/(signed)/editor/hooks/useEditorVideoUpload";

export function getUserInitials(session: Session | null): string {
  return session?.user?.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session?.user?.email?.[0]?.toUpperCase() || "U";
}

interface UseRecorderActionsProps {
  blob: Blob | null;
  setProcessingDownload: (value: boolean) => void;
  setShowSavePopup: (value: boolean) => void;
}

export async function executeEditVideoNavigation(router: { push: (url: string) => void }): Promise<void> {
  const activeUpload = getActiveVideoUploadPromise();
  let canonicalUrl = useBlobStore.getState().canonicalVideoUrl;
  if (activeUpload) {
    toast.loading("Completing Cloudinary upload...", { id: "recorder-edit-upload" });
    const uploadedUrl = await activeUpload;
    toast.dismiss("recorder-edit-upload");
    if (uploadedUrl) {
      canonicalUrl = uploadedUrl;
    }
  }
  if (canonicalUrl && (canonicalUrl.startsWith("http://") || canonicalUrl.startsWith("https://"))) {
    router.push(`/editor?video=${encodeURIComponent(canonicalUrl)}`);
  } else {
    router.push("/editor");
  }
}

export function useRecorderActions({
  blob,
  setProcessingDownload,
  setShowSavePopup,
}: UseRecorderActionsProps) {
  const router = useRouter();
  const isProcessingRef = useRef(false);

  const handleBack = useCallback(() => {
    try {
      router.back();
    } catch (error) {
      console.error("Navigation error:", error);
    }
  }, [router]);

  const handleEditVideo = useCallback(async () => {
    try {
      await executeEditVideoNavigation(router);
    } catch (error) {
      console.error("Navigation error:", error);
      router.push("/editor");
    }
  }, [router]);

  const handlePopupDownload = async (data: { title: string; format: string }) => {
    if (!blob) {
      isProcessingRef.current = false;
      return;
    }

    setProcessingDownload(true);
    try {
      if (data.format === "mp4") {
        const outputBlob = await videoToMP4(blob);
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.mp4`;
        a.click();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${sanitizeFilename(data.title) || "recording"}.webm`;
        a.click();
      }
      toast.success("Video downloaded successfully!");
      setShowSavePopup(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download video.");

      isProcessingRef.current = false;
    } finally {
      setProcessingDownload(false);
    }
  };

  return { handleBack, handleEditVideo, handlePopupDownload, isProcessingRef };
}
