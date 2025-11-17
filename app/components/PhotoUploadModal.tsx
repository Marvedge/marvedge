"use client";

import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useEffect } from "react";
import Image from "next/image";

interface PhotoUploadModalProps {
  isOpen: boolean;
  imagePreview: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function PhotoUploadModal({
  isOpen,
  imagePreview,
  onSave,
  onCancel,
}: PhotoUploadModalProps) {
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 transform transition-all duration-300 scale-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Update Photo</h2>
          <button
            onClick={onCancel}
            className="cursor-pointer text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {imagePreview && (
            <div className="flex justify-center">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#7C5CFC] flex items-center justify-center bg-gray-100">
                <Image
                  src={imagePreview}
                  alt="Preview"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
          <p className="text-gray-600 text-center">
            Click &quot;Save&quot; to update your profile photo.
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={onCancel} variant="outline" className="flex-1 cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={onSave}
            className="flex-1 bg-[#7C5CFC] hover:bg-[#8A76FC] text-white cursor-pointer"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
