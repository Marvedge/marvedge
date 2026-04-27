"use client";

import { Copy } from "lucide-react";
import toast from "react-hot-toast";

interface ExportResultModalProps {
  isOpen: boolean;
  shareUrl?: string | null;
  loading?: boolean;
  onClose: () => void;
  onDownloadMp4: () => void;
  onSaveShareLink: () => void;
}

export default function ExportResultModal({
  isOpen,
  shareUrl,
  loading = false,
  onClose,
  onDownloadMp4,
  onSaveShareLink,
}: ExportResultModalProps) {
  if (!isOpen) {
    return null;
  }

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-[560px] rounded-2xl border border-white bg-[#F8F8FC] p-6 shadow-[0_8px_32px_rgba(124,92,252,0.15)]">
        <h2 className="mb-2 text-2xl font-semibold text-[#8A76FC]">Export Complete</h2>
        <p className="mb-4 text-sm text-[#5E4FB2]">
          Download only as MP4, or generate a share link to save to your Exported Videos.
        </p>

        {shareUrl && (
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-[#8A76FC]">Shareable link</label>
            <div className="flex items-center gap-2">
              <input
                value={shareUrl}
                readOnly
                className="w-full rounded-lg border border-[#D9D1FA] bg-white px-3 py-2 text-sm text-[#4A3C87]"
              />
              <button
                onClick={handleCopy}
                className="rounded-lg bg-[#EAE5FB] p-2 text-[#8A76FC] hover:bg-[#D9D1FA] transition-colors"
                title="Copy link"
              >
                <Copy size={20} />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onDownloadMp4}
            className="flex-1 rounded-xl border border-[#8A76FC] bg-white py-3 text-sm font-semibold text-[#8A76FC] hover:bg-[#EFEAFF] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Download MP4 Only
          </button>
          {!shareUrl && (
            <button
              type="button"
              disabled={loading}
              onClick={onSaveShareLink}
              className="flex-1 rounded-xl bg-[#8A76FC] py-3 text-sm font-semibold text-white hover:bg-[#7C5CFC] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Generate Shareable Link
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
