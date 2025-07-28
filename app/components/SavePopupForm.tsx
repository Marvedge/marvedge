"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface SavePopupFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; format: string }) => void;
  initialTitle?: string;
  initialDescription?: string;
  processing?: boolean;
}

export default function SavePopupForm({
  isOpen,
  onClose,
  onSave,
  initialTitle = "",
  initialDescription = "",
  processing = false,
}: SavePopupFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [format, setFormat] = useState("webm");

  // Update internal state when props change
  useEffect(() => {
    setTitle(initialTitle);
    setDescription(initialDescription);
  }, [initialTitle, initialDescription]);

  const handleSave = () => {
    onSave({ title, description, format });
  };

  // Debug: Log when popup opens
  useEffect(() => {
    if (isOpen) {
      console.log("Save popup opened with:", { initialTitle, initialDescription, processing });
    }
  }, [isOpen, initialTitle, initialDescription, processing]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Save Video</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              disabled={processing}
            />
          </div>

          {/* Description Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
              disabled={processing}
            />
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("webm")}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "webm"
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
                disabled={processing}
              >
                <div className="text-sm font-medium">WebM</div>
                <div className="text-xs text-gray-500">High quality, smaller size</div>
              </button>
              <button
                type="button"
                onClick={() => setFormat("mp4")}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  format === "mp4"
                    ? "border-purple-500 bg-purple-50 text-purple-700"
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
            onClick={handleSave}
            disabled={!title.trim() || processing}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {processing ? "Saving..." : "Save Video"}
          </Button>
        </div>
      </div>
    </div>
  );
} 