"use client";

import React, { useRef } from "react";
import { useRouter } from "next/navigation";
import { UPLOAD_VIDEO_ACCEPT } from "@/app/lib/subtitles";

interface EmptyVideoStateProps {
  onUploadVideo?: (file: File) => Promise<string | null | void>;
  isUploading?: boolean;
}

export default function EmptyVideoState({
  onUploadVideo,
  isUploading = false,
}: EmptyVideoStateProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadVideo) {
      void onUploadVideo(file);
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 bg-[#E6E1FA] rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-[#7C5CFC]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[#7C5CFC] mb-2">No Video Selected</h3>
      <p className="text-sm text-gray-600 mb-4">To start editing, please:</p>
      <div className="space-y-2 text-sm text-gray-500">
        <p>
          â€¢ <strong>Upload</strong> a video directly below
        </p>
        <p>
          â€¢ Or go to <strong>Dashboard</strong> to edit an existing demo
        </p>
        <p>
          â€¢ Or go to <strong>Recorder</strong> to record a screen share
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 justify-center items-center">
        {onUploadVideo && (
          <>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-[#7C5CFC] text-white rounded-lg hover:bg-[#6356D7] transition font-semibold disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? "Uploading Video..." : "Upload Video"}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept={UPLOAD_VIDEO_ACCEPT}
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </>
        )}
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 bg-[#E6E1FA] text-[#7C5CFC] rounded-lg hover:bg-[#7C5CFC] hover:text-white transition font-medium"
        >
          Go to Dashboard
        </button>
        <button
          onClick={() => router.push("/recorder")}
          className="px-4 py-2 bg-[#E6E1FA] text-[#7C5CFC] rounded-lg hover:bg-[#7C5CFC] hover:text-white transition font-medium"
        >
          Go to Recorder
        </button>
      </div>
    </div>
  );
}
