import React from "react";
import Image from "next/image";

interface EditorSidebarProps {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  onDownloadWebM: () => void;
  onDownloadMP4: () => void;
  tool: string;
  setTool: (t: string) => void;
  handleUndo: () => void;
  handleClear: () => void;
  handleSaveOverlays: () => void;
  handleLoadOverlays: () => void;
  forceShowMobile?: boolean;
  thumbnailUrl?: string;
  selectedBackground?: string | null;
  setSelectedBackground?: (bg: string | null) => void;
  backgroundType?: string;
  setBackgroundType?: (type: string) => void;
  customBackground?: File | null;
  setCustomBackground?: (file: File | null) => void;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  title,
  setTitle,
  description,
  setDescription,
  onDownloadWebM,
  onDownloadMP4,
  tool,
  setTool,
  handleUndo,
  handleClear,
  handleSaveOverlays,
  handleLoadOverlays,
  forceShowMobile = false,
  thumbnailUrl,
  selectedBackground,
  setSelectedBackground,
  backgroundType,
  setBackgroundType,
  customBackground,
  setCustomBackground,
}) => {
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [localSelectedBackground, setLocalSelectedBackground] = React.useState<
    string | null
  >(selectedBackground || null);
  const [localBackgroundType, setLocalBackgroundType] = React.useState<string>(
    backgroundType || ""
  );
  const [localCustomBackground, setLocalCustomBackground] =
    React.useState<File | null>(customBackground || null);
  const [customBackgroundUrl, setCustomBackgroundUrl] = React.useState<
    string | null
  >(null);

  // Handle custom background upload
  const handleCustomBackgroundUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setLocalCustomBackground(file);
      setCustomBackground?.(file);
      setLocalSelectedBackground("custom");
      setSelectedBackground?.("custom");
      setCustomBackgroundUrl(URL.createObjectURL(file));
    }
  };

  // Background options
  const backgroundOptions = [
    {
      id: "bg1",
      name: "Mountain Sunset",
      thumbnail: "/icons/bg-mountain-sunset.svg",
      description: "Landscape with mountains and sunset sky",
    },
    {
      id: "bg2",
      name: "Abstract Circles",
      thumbnail: "/icons/bg-abstract-circles.svg",
      description: "Overlapping translucent circles in blue and purple",
    },
    {
      id: "bg3",
      name: "Crystalline Shapes",
      thumbnail: "/icons/bg-crystalline.svg",
      description: "Sharp geometric shapes in vibrant colors",
    },
    {
      id: "bg4",
      name: "Dynamic Brushstrokes",
      thumbnail: "/icons/bg-brushstrokes.svg",
      description: "Flowing brushstroke patterns in bright colors",
    },
    {
      id: "bg5",
      name: "Warm Gradients",
      thumbnail: "/icons/bg-warm-gradients.svg",
      description: "Smooth wavy lines in warm red, orange, yellow",
    },
    {
      id: "bg6",
      name: "Ethereal Light",
      thumbnail: "/icons/bg-ethereal.svg",
      description: "Soft blurred light with organic shapes",
    },
    {
      id: "bg7",
      name: "Fiery Swirls",
      thumbnail: "/icons/bg-fiery.svg",
      description: "Dark swirling patterns with glowing orange accents",
    },
    {
      id: "bg8",
      name: "Elegant Ribbons",
      thumbnail: "/icons/bg-ribbons.svg",
      description: "Flowing ribbons in light purple and blue",
    },
  ];

  const handleBackgroundSelect = (bgId: string) => {
    setLocalSelectedBackground(bgId);
    setSelectedBackground?.(bgId);
  };

  return (
    <aside
      className={`w-full max-w-xs h-screen bg-white border-r border-[#ede7fa] px-4 py-4 flex flex-col gap-4 overflow-y-auto ${forceShowMobile ? "flex" : "hidden md:flex"}`}
    >
      {/* Export Section */}
      <div className="relative mb-4">
        <button
          className="w-full bg-[#A594F9] hover:bg-[#7C5CFC] text-white font-semibold py-1.5 rounded-lg shadow transition text-sm"
          onClick={() => setExportMenuOpen((v) => !v)}
        >
          Export Video
        </button>
        {exportMenuOpen && (
          <div className="absolute left-0 mt-2 w-full bg-white border border-[#ede7fa] rounded-lg shadow z-10">
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-t-lg"
              onClick={() => {
                setExportMenuOpen(false);
                onDownloadWebM();
              }}
            >
              Download WebM
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-b-lg"
              onClick={() => {
                setExportMenuOpen(false);
                onDownloadMP4();
              }}
            >
              Download MP4
            </button>
          </div>
        )}
      </div>

      {/* Demo Properties Section */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#A594F9] mb-4">
          Demo Properties
        </h2>
        <div className="mb-4">
          <label className="block text-[#A594F9] font-semibold mb-1">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#A594F9]"
            placeholder="Enter demo title"
          />
        </div>
        {thumbnailUrl ? (
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
        ) : (
          <div className="mb-4">
            <label className="block text-[#A594F9] font-semibold mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#A594F9]"
              placeholder="Click here to continue"
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Background Selection Section */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#A594F9] mb-4">Background</h2>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {backgroundOptions.map((bg) => (
            <button
              key={bg.id}
              onClick={() => handleBackgroundSelect(bg.id)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                localSelectedBackground === bg.id
                  ? "border-[#7C5CFC] shadow-md"
                  : "border-[#ede7fa] hover:border-[#A594F9]"
              }`}
            >
              <div className="w-full h-15 flex items-center justify-center bg-white">
                <Image
                  src={bg.thumbnail}
                  alt={bg.name}
                  width={80}
                  height={60}
                  className="w-full h-full object-cover"
                />
              </div>
              {localSelectedBackground === bg.id && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-[#7C5CFC] rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mb-4">
          <label className="block text-[#A594F9] font-semibold mb-2">
            Select Type
          </label>
          <select
            value={localBackgroundType}
            onChange={(e) => {
              setLocalBackgroundType(e.target.value);
              setBackgroundType?.(e.target.value);
            }}
            className="w-full border border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#A594F9] text-[#7C5CFC]"
          >
            <option value="">Select Type</option>
            <option value="static">Static Background</option>
            <option value="animated">Animated Background</option>
            <option value="gradient">Gradient Background</option>
            <option value="pattern">Pattern Background</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-[#A594F9] font-semibold mb-2">
            Upload Custom Image
          </label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleCustomBackgroundUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="border border-[#ede7fa] rounded px-3 py-2 text-[#7C5CFC] flex items-center justify-between">
              <span className="text-sm">
                {localCustomBackground
                  ? localCustomBackground.name
                  : "Upload Custom Image"}
              </span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#A594F9] mb-4">Tools</h2>
        <div className="flex flex-col gap-2 mb-4">
          <div className="grid grid-cols-1 gap-2">
            <button
              key="none"
              onClick={() => setTool && setTool("none")}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide ${
                tool === "none"
                  ? "bg-[#7C5CFC] text-white"
                  : "bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#d1c6fa]"
              }`}
            >
              SELECT
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["blur", "rect", "arrow", "text"].map((t) => (
              <button
                key={t}
                onClick={() => setTool && setTool(t)}
                className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide ${
                  tool === t
                    ? "bg-[#7C5CFC] text-white"
                    : "bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#d1c6fa]"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleUndo}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              UNDO
            </button>
            <button
              onClick={handleClear}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              CLEAR
            </button>
            <button
              onClick={handleSaveOverlays}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
            >
              SAVE
            </button>
            <button
              onClick={handleLoadOverlays}
              className={`w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF] hover:text-[#7C5CFC]`}
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
