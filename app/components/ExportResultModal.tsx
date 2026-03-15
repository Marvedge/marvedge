"use client";

interface ExportResultModalProps {
  isOpen: boolean;
  exportedUrl: string;
  loading?: boolean;
  onClose: () => void;
  onDownloadMp4: () => void;
  onSaveShareLink: () => void;
}

export default function ExportResultModal({
  isOpen,
  exportedUrl,
  loading = false,
  onClose,
  onDownloadMp4,
  onSaveShareLink,
}: ExportResultModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-[560px] rounded-2xl border border-white bg-[#F8F8FC] p-6 shadow-[0_8px_32px_rgba(124,92,252,0.15)]">
        <h2 className="mb-2 text-2xl font-semibold text-[#8A76FC]">Export Complete</h2>
        <p className="mb-4 text-sm text-[#5E4FB2]">
          Download only as MP4, or save this share link to Exported Videos.
        </p>

        <label className="mb-2 block text-sm font-medium text-[#8A76FC]">Shareable link</label>
        <input
          value={exportedUrl}
          readOnly
          className="mb-6 w-full rounded-lg border border-[#D9D1FA] bg-white px-3 py-2 text-sm text-[#4A3C87]"
        />

        <div className="flex gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onDownloadMp4}
            className="flex-1 rounded-xl border border-[#8A76FC] bg-white py-3 text-sm font-semibold text-[#8A76FC] hover:bg-[#EFEAFF] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Download MP4 Only
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onSaveShareLink}
            className="flex-1 rounded-xl bg-[#8A76FC] py-3 text-sm font-semibold text-white hover:bg-[#7C5CFC] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Save Share Link
          </button>
        </div>
      </div>
    </div>
  );
}
