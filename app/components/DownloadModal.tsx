"use client";
import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { X } from "lucide-react";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (data: { title: string; format: "webm" | "mp4" }) => void;
  defaultTitle?: string;
  processing?: boolean;
}

export default function DownloadModal({
  isOpen,
  onClose,
  onDownload,
  defaultTitle = "video",
  processing = false,
}: DownloadModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [format, setFormat] = useState<"webm" | "mp4">("webm");

  useEffect(() => {
    setTitle(defaultTitle);
  }, [defaultTitle]);

  // Prevent background scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownload = () => {
    onDownload({ title, format });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Download Video
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Name *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] focus:border-[#7C5CFC] transition-all"
              disabled={processing}
            />
          </div>

          {/* Format Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format *
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "webm" | "mp4")}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7C5CFC] focus:border-[#7C5CFC] transition-all"
              disabled={processing}
            >
              <option value="webm">WebM</option>
              <option value="mp4">MP4</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!title.trim() || processing}
            className="flex-1 bg-[#7C5CFC] hover:bg-[#8A76FC] text-white"
          >
            {processing ? "Downloading..." : "Download"}
          </Button>
        </div>
      </div>
    </div>
  );
}
