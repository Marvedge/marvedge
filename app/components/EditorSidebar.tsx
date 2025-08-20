import React from "react";
import Image from "next/image";

interface EditorSidebarProps {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  onDownloadWebM: () => void;
  onDownloadMP4: () => void;
  onExportWebM: () => void;
  tool: string;
  setTool: (t: string) => void;
  handleUndo: () => void;
  handleClear: () => void;
  handleSaveOverlays: () => void;
  handleLoadOverlays: () => void;
  forceShowMobile?: boolean;
  thumbnailUrl?: string;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  onExportWebM,
  tool,
  setTool,
  handleUndo,
  handleClear,
  handleSaveOverlays,
  handleLoadOverlays,
  forceShowMobile = false,
  thumbnailUrl,
}) => {
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  return (
    <aside
      className={`w-full max-w-xs h-screen bg-white border-r border-[#ede7fa] px-4 py-4 flex flex-col gap-4 overflow-hidden ${forceShowMobile ? "flex" : "hidden md:flex"}`}
    >
      <div className="relative mb-4">
        <button
          className="w-full bg-[#A594F9] hover:bg-[#7C5CFC] text-white font-semibold py-1.5 rounded-lg shadow transition text-sm"
          onClick={() => {
            setExportMenuOpen((v) => !v);
            onExportWebM(); // 👈 call it here
          }}
          // onClick={onExportWebM()}
        >
          Export Video
        </button>
        {exportMenuOpen && (
          <div className="absolute left-0 mt-2 w-full bg-white border border-[#ede7fa] rounded-lg shadow z-10">
            {/* <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-t-lg"
              onClick={() => {
                setExportMenuOpen(false);
                onDownloadWebM();
              }}
            >
              Download WebM
            </button> */}
            {/* <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm"
              onClick={() => {
                setExportMenuOpen(false);
                onExportWebM();
              }}
            >
              Export WebM
            </button> */}
            {/* <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-b-lg"
              onClick={() => {
                setExportMenuOpen(false);
                onDownloadMP4();
              }}
            >
              Download MP4
            </button> */}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold text-[#A594F9] mb-4">Editing Tools</h2>
        {thumbnailUrl && (
          <div className="mb-4 flex flex-col items-center">
            <label className="block text-[#A594F9] font-semibold mb-1">
              📸 Thumbnail:
            </label>
            <Image
              src={thumbnailUrl}
              alt="thumbnail"
              width={128}
              height={72}
              className="w-32 mt-2 rounded border"
              unoptimized
            />
          </div>
        )}
        <div className="flex flex-col gap-2 mb-4">
          {/* Tool Buttons */}
          <div className="grid grid-cols-1 gap-2">
            <button
              key="none"
              onClick={() => setTool && setTool("none")}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide
              ${tool === "none" ? "bg-[#7C5CFC] text-white" : "bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#d1c6fa]"}
            `}
            >
              SELECT
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["blur", "rect", "arrow", "text"].map((t) => (
              <button
                key={t}
                onClick={() => setTool && setTool(t)}
                className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide
                ${tool === t ? "bg-[#7C5CFC] text-white" : "bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#d1c6fa]"}
              `}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 ">
            <button
              onClick={handleUndo}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border  bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              UNDO
            </button>
            <button
              onClick={handleClear}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border  bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              Clear
            </button>
            <button
              onClick={handleSaveOverlays}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border  bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              SAVE
            </button>
            <button
              onClick={handleLoadOverlays}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide  bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              LOAD
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default EditorSidebar;
