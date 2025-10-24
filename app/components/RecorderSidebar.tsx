import React from "react";
import Image from "next/image";

interface RecorderSidebarProps {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInputClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadMessage?: string;
  onStartScreenShare: () => void;
}

const RecorderSidebar: React.FC<RecorderSidebarProps> = ({
  title,
  setTitle,
  description,
  setDescription,
  fileInputRef,
  onFileInputClick,
  onFileChange,
  uploadMessage,
  onStartScreenShare,
}) => {
  return (
    <aside className="w-full max-w-xs bg-white border-r border-[#ede7fa] px-6 py-8 flex flex-col gap-8 min-h-screen hidden md:flex">
      <div>
        <h2 className="text-xl font-bold text-[#7C5CFC] mb-4">Recorder Settings</h2>
        <div className="mb-4">
          <label className="block text-[#7C5CFC] font-semibold mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
            placeholder="Enter recording title"
          />
        </div>
        <div className="mb-4">
          <label className="block text-[#7C5CFC] font-semibold mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]"
            placeholder="Describe your recording"
            rows={3}
          />
        </div>
        <div className="mb-4">
          <label className="block text-[#7C5CFC] font-semibold mb-1">Recording Source</label>
          <div className="border-2 border-dashed border-[#A594F9] rounded-lg p-4 flex flex-col items-center justify-center mb-4 bg-[#F8F6FF]">
            <button
              onClick={onFileInputClick}
              className="flex flex-col items-center gap-2 text-[#7C5CFC] font-semibold text-sm focus:outline-none"
            >
              <span className="text-2xl">
                <Image
                  src="/icons/upload_icon.png"
                  alt="Notifications"
                  width={32}
                  height={32}
                  className="md:w-6 md:h-6"
                />
              </span>
              Upload Screen Recording
              <span className="text-xs text-gray-400">MP4, MOV up to 100MB</span>
            </button>
            <input
              type="file"
              accept="video/mp4,video/webm,video/*"
              ref={fileInputRef}
              className="hidden"
              onChange={onFileChange}
            />
            {uploadMessage && <div className="mt-2 text-green-600 text-xs">{uploadMessage}</div>}
          </div>

          <button
            onClick={onStartScreenShare}
            className="w-full mt-2 px-4 py-2 border-1 rounded-lg bg-white text-[#7C5CFC] font-semibold shadow hover:bg-[#8A76FC] hover:text-white transition flex items-center justify-center gap-2"
          >
            <Image
              src="/icons/play_button_icon.png"
              alt="Notifications"
              width={20}
              height={20}
              className="md:w-6 md:h-6"
            />
            Start Screen Recording
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RecorderSidebar;
