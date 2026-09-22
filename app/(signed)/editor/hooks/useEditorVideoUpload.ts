"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { validateVideoUpload } from "@/app/lib/subtitles";
import {
  isCloudinaryUploadConfigured,
  isEditorCloudinaryUploadEnabled,
  uploadVideoToCloudinary,
} from "@/app/lib/cloudinaryUpload";
import { useEditorStore } from "@/app/store/editor/editorStore";
import { useBlobStore } from "@/app/store/blobStore";

export interface EditorVideoUploadCallbacks {
  setVideoUrl?: (url: string | null) => void;
  setUploadedFileUrl?: (url: string | null) => void;
  setUploadedFileType?: (type: string | null) => void;
  setBlob?: (blob: Blob | null) => void;
  setTitle?: (title: string) => void;
  setIsUploading?: (uploading: boolean) => void;
}

let activeVideoUploadPromise: Promise<string | null> | null = null;

/**
 * Returns the in-flight video upload promise if one is currently active.
 * Only waits for the existing upload; never initiates a second upload.
 */
export function getActiveVideoUploadPromise(): Promise<string | null> | null {
  return activeVideoUploadPromise;
}

/**
 * For testing / resetting module state.
 */
export function _resetActiveVideoUploadPromiseForTest(): void {
  activeVideoUploadPromise = null;
}

/**
 * Pure action for uploading a video file from ANY entry point (recorder or editor).
 * Handles validation, temporary preview blob creation, Cloudinary upload,
 * promoting returned dynamic secure_url to canonical videoUrl, temporary blob revocation,
 * and error handling / legacy fallback.
 */
export async function uploadEditorVideoFile(
  file: File,
  callbacks?: EditorVideoUploadCallbacks
): Promise<string | null> {
  const check = validateVideoUpload({
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  if (!check.ok) {
    toast.error(check.error);
    return null;
  }

  const setBlob = callbacks?.setBlob ?? useBlobStore.getState().setBlob;
  const setTitle = callbacks?.setTitle ?? useBlobStore.getState().setTitle;

  const shouldUploadToCloudinary =
    isEditorCloudinaryUploadEnabled() && isCloudinaryUploadConfigured();

  if (!shouldUploadToCloudinary) {
    // Legacy flow: local blob URL
    const localBlobUrl = URL.createObjectURL(file);
    callbacks?.setVideoUrl?.(localBlobUrl);
    callbacks?.setUploadedFileUrl?.(localBlobUrl);
    callbacks?.setUploadedFileType?.(file.type);
    setBlob(file);
    if (file.name) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
    useBlobStore.getState().setCanonicalVideoUrl(null);
    toast.success(callbacks?.setUploadedFileUrl ? "File uploaded successfully!" : "Video loaded locally");
    return localBlobUrl;
  }

  // Explicit Cloudinary flow:
  // 1. Temporary blob URL for immediate playback preview
  const tempBlobUrl = URL.createObjectURL(file);
  callbacks?.setVideoUrl?.(tempBlobUrl);
  callbacks?.setUploadedFileUrl?.(tempBlobUrl);
  callbacks?.setUploadedFileType?.(file.type);
  setBlob(file);
  if (file.name) {
    setTitle(file.name.replace(/\.[^/.]+$/, ""));
  }

  const toastId = toast.loading("Uploading video to Cloudinary...");
  callbacks?.setIsUploading?.(true);

  const uploadPromise = (async (): Promise<string | null> => {
    try {
      const secureUrl = await uploadVideoToCloudinary({
        file,
        folder: "marvedge/editor_uploads",
        filename: file.name,
      });

      // 2. Promote secure_url to canonical in blobStore
      useBlobStore.getState().setCanonicalVideoUrl(secureUrl);

      // 3. Promote secure_url to canonical editor videoUrl
      callbacks?.setVideoUrl?.(secureUrl);
      try {
        useEditorStore.getState().setVideoUrl(secureUrl);
      } catch {
        // useEditorStore might not be active if still in recorder
      }

      // 4. Update recorder preview to canonical URL
      callbacks?.setUploadedFileUrl?.(secureUrl);

      // 5. Revoke temporary blob URL
      URL.revokeObjectURL(tempBlobUrl);

      toast.success("Video uploaded to Cloudinary successfully!", { id: toastId });
      return secureUrl;
    } catch (error) {
      // 6. On failure: surface error, clean up temporary URL, do not leave broken source
      URL.revokeObjectURL(tempBlobUrl);
      callbacks?.setVideoUrl?.(null);
      try {
        useEditorStore.getState().setVideoUrl(null);
      } catch {
        // ignore
      }
      callbacks?.setUploadedFileUrl?.(null);
      useBlobStore.getState().setCanonicalVideoUrl(null);

      const message = error instanceof Error ? error.message : "Cloudinary upload failed";
      console.error("[uploadEditorVideoFile] upload failed:", error);
      toast.error(`Upload failed: ${message}`, { id: toastId });
      return null;
    } finally {
      callbacks?.setIsUploading?.(false);
      if (activeVideoUploadPromise === uploadPromise) {
        activeVideoUploadPromise = null;
      }
    }
  })();

  activeVideoUploadPromise = uploadPromise;
  return uploadPromise;
}

export function useEditorVideoUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const setVideoUrl = useEditorStore((state) => state.setVideoUrl);
  const setBlob = useBlobStore((state) => state.setBlob);
  const setTitle = useBlobStore((state) => state.setTitle);

  const uploadVideoFile = useCallback(
    async (file: File): Promise<string | null> => {
      return uploadEditorVideoFile(file, {
        setVideoUrl,
        setBlob,
        setTitle,
        setIsUploading,
      });
    },
    [setVideoUrl, setBlob, setTitle]
  );

  return {
    uploadVideoFile,
    isUploading,
  };
}
