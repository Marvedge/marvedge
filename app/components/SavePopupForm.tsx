"use client";
import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { X } from "lucide-react";
import Image from "next/image";

interface SavePopupFormProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (data: { title: string; format: string }) => void;
  initialTitle?: string;
  initialDescription?: string;
  processing?: boolean;
}

export default function SavePopupForm({
  isOpen,
  onClose,
  onDownload,
  initialTitle = "",
  processing = false,
}: SavePopupFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [format, setFormat] = useState("webm");

  // Update internal state when props change
  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  const handleDownload = () => {
    onDownload({ title, format });
  };

  // Prevent body scroll when modal is open
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop with blur effect */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 transform transition-all duration-300 scale-100">
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
              Title *
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

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Download Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("webm")}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "webm"
                    ? "border-[#7C5CFC] bg-[#F8F6FF] text-[#7C5CFC]"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
                disabled={processing}
              >
                <div className="text-sm font-medium">WebM</div>
                <div className="text-xs text-gray-500">
                  High quality, smaller size
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("mp4")}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "mp4"
                    ? "border-[#7C5CFC] bg-[#F8F6FF] text-[#7C5CFC]"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
                disabled={processing}
              >
                <div className="text-sm font-medium">MP4</div>
                <div className="text-xs text-gray-500">Widely compatible</div>
              </button>
            </div>
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
            className="flex-1 bg-[#7C5CFC] hover:bg-[#8A76FC] text-white flex items-center gap-2"
          >
            <Image src="/icons/1.png" alt="Download" width={16} height={16} />
            {processing ? "Processing..." : "Download Video"}
          </Button>
        </div>
      </div>
    </div>
  );
}
