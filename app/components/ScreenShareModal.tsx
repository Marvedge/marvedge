"use client";
import { Dialog } from "@headlessui/react";
import { useState } from "react";

interface ScreenShareModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onShare: (shareType: "window" | "screen") => void;
  micEnabled: boolean;
  onToggleMic: () => void;
}

export default function ScreenShareModal({
  isOpen,
  onCancel,
  onShare,
  micEnabled,
  onToggleMic,
}: ScreenShareModalProps) {
  const [shareType, setShareType] = useState<"window" | "screen">("window");
  const [isLoading, setIsLoading] = useState(false);

  const handleShare = async () => {
    setIsLoading(true);
    try {
      await onShare(shareType);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onCancel} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl p-8">
          <Dialog.Title className="text-lg font-semibold text-gray-700 mb-6">
            Choose the screen you want to share.
          </Dialog.Title>

          <div className="flex gap-0 mb-6 border-b border-gray-200">
            <button
              onClick={() => setShareType("window")}
              className={`flex-1 pb-4 text-center font-semibold transition ${
                shareType === "window"
                  ? "text-[#7C5CFC] border-b-2 border-[#7C5CFC]"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Window
            </button>
            <button
              onClick={() => setShareType("screen")}
              className={`flex-1 pb-4 text-center font-semibold transition ${
                shareType === "screen"
                  ? "text-[#7C5CFC] border-b-2 border-[#7C5CFC]"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Entire Screen
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg border-2 border-gray-200 p-8 mb-6 h-64 flex items-center justify-center">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <svg
                  className="w-16 h-16 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">
                Click &quot;Start Screen Share&quot; to select your{" "}
                {shareType === "window" ? "window" : "screen"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-200">
            <span className="text-gray-600 font-medium">Microphone</span>
            <button
              onClick={onToggleMic}
              className={`relative inline-flex w-12 h-6 items-center rounded-full transition ${
                micEnabled ? "bg-[#7C5CFC]" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  micEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-6 py-2 rounded-lg text-[#7C5CFC] font-semibold hover:bg-gray-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={isLoading}
              className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white font-semibold hover:bg-[#8A76FC] transition disabled:opacity-50"
            >
              {isLoading ? "Starting..." : "Start Screen Share"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
