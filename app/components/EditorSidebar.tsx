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
  selectedBackground?: string | null;
  setSelectedBackground?: (bg: string | null) => void;
  backgroundType?: string;
  setBackgroundType?: (type: string) => void;
  customBackground?: File | null;
  setCustomBackground?: (file: File | null) => void;
}

type MainTab = "background" | "tools";
type BgSubTab = "image" | "gradient" | "color" | "hidden";

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  // title,
  // setTitle,
  // description,
  // setDescription,
  // onDownloadWebM,
  onDownloadMP4,
  onExportWebM,
  tool,
  setTool,
  handleUndo,
  handleClear,
  handleSaveOverlays,
  handleLoadOverlays,
  forceShowMobile = false,
  // thumbnailUrl,
  selectedBackground,
  setSelectedBackground,
  backgroundType,
  setBackgroundType,
  customBackground,
  setCustomBackground,
}) => {
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<MainTab>("background");
  const [bgSubTab, setBgSubTab] = React.useState<BgSubTab>("image");

  const [localSelectedBackground, setLocalSelectedBackground] = React.useState<
    string | null
  >(selectedBackground ?? null);
  const [localBackgroundType, setLocalBackgroundType] = React.useState<string>(
    backgroundType || ""
  );
  const [localCustomBackground, setLocalCustomBackground] =
    React.useState<File | null>(customBackground || null);
  const [customBackgroundUrl, setCustomBackgroundUrl] = React.useState<
    string | null
  >(null);

  // Sync down external changes if they happen upstream
  React.useEffect(() => {
    if (selectedBackground !== undefined)
      setLocalSelectedBackground(selectedBackground);
  }, [selectedBackground]);
  React.useEffect(() => {
    if (backgroundType !== undefined) setLocalBackgroundType(backgroundType);
  }, [backgroundType]);
  React.useEffect(() => {
    if (customBackground !== undefined)
      setLocalCustomBackground(customBackground);
  }, [customBackground]);

  const handleBackgroundSelect = (value: string | null) => {
    setLocalSelectedBackground(value);
    setSelectedBackground?.(value);
  };

  const handleCustomBackgroundUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setLocalCustomBackground(file);
      setCustomBackground?.(file);
      handleBackgroundSelect("custom");
      setCustomBackgroundUrl(URL.createObjectURL(file));
      setBgSubTab("image");
    }
  };

  // Background options (Image)
  const imageBackgroundOptions = [
    {
      id: "bg1",
      name: "Mountain Sunset",
      thumbnail: "/icons/bg-mountain-sunset.svg",
    },
    {
      id: "bg2",
      name: "Abstract Circles",
      thumbnail: "/icons/bg-abstract-circles.svg",
    },
    {
      id: "bg3",
      name: "Crystalline Shapes",
      thumbnail: "/icons/bg-crystalline.svg",
    },
    {
      id: "bg4",
      name: "Dynamic Brushstrokes",
      thumbnail: "/icons/bg-brushstrokes.svg",
    },
    {
      id: "bg5",
      name: "Warm Gradients",
      thumbnail: "/icons/bg-warm-gradients.svg",
    },
    { id: "bg6", name: "Ethereal Light", thumbnail: "/icons/bg-ethereal.svg" },
    { id: "bg7", name: "Fiery Swirls", thumbnail: "/icons/bg-fiery.svg" },
    { id: "bg8", name: "Elegant Ribbons", thumbnail: "/icons/bg-ribbons.svg" },
  ];

  // Background options (Gradient)
  const gradientOptions: { id: string; name: string; css: string }[] = [
    {
      id: "sunset",
      name: "Sunset",
      css: "bg-gradient-to-br from-pink-500 via-orange-400 to-yellow-300",
    },
    {
      id: "ocean",
      name: "Ocean",
      css: "bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700",
    },
    {
      id: "mint",
      name: "Mint",
      css: "bg-gradient-to-br from-emerald-300 via-teal-400 to-cyan-500",
    },
    {
      id: "royal",
      name: "Royal",
      css: "bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-600",
    },
    {
      id: "steel",
      name: "Steel",
      css: "bg-gradient-to-br from-slate-700 via-slate-500 to-slate-300",
    },
    {
      id: "candy",
      name: "Candy",
      css: "bg-gradient-to-br from-rose-400 via-fuchsia-500 to-violet-600",
    },
  ];

  // Background options (Color)
  const colorOptions: { id: string; name: string; hex: string }[] = [
    { id: "#111827", name: "Near Black", hex: "#111827" },
    { id: "#0ea5e9", name: "Sky", hex: "#0ea5e9" },
    { id: "#7c3aed", name: "Violet", hex: "#7c3aed" },
    { id: "#22c55e", name: "Green", hex: "#22c55e" },
    { id: "#f59e0b", name: "Amber", hex: "#f59e0b" },
    { id: "#ef4444", name: "Red", hex: "#ef4444" },
    { id: "#e5e7eb", name: "Light", hex: "#e5e7eb" },
    { id: "#0f172a", name: "Slate", hex: "#0f172a" },
  ];

  // const Segmented = ({
  //   value,
  //   onChange,
  //   options,
  // }: {
  //   value: string;
  //   onChange: (v: any) => void;
  //   options: { label: string; value: string }[];
  // }) => (
  //   <div className="inline-flex bg-[#F6F3FF] rounded-xl p-1 gap-1">
  //     {options.map((o) => (
  //       <button
  //         key={o.value}
  //         onClick={() => onChange(o.value)}
  //         className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
  //           value === o.value
  //             ? "bg-white text-[#7C5CFC] shadow"
  //             : "text-gray-600 hover:text-[#7C5CFC]"
  //         }`}
  //       >
  //         {o.label}
  //       </button>
  //     ))}
  //   </div>
  // );

  return (
    <aside
      className={`w-full max-w-xs h-screen bg-white border-r border-[#ede7fa] px-4 py-4 flex flex-col gap-4 overflow-y-auto ${
        forceShowMobile ? "flex" : "hidden md:flex"
      }`}
    >
      {/* Export Section */}
      <div className="relative">
        <button
          className="w-full bg-[#A594F9] hover:bg-[#7C5CFC] text-white font-semibold py-1.5 rounded-lg shadow transition text-sm"
          onClick={() => setExportMenuOpen((v) => !v)}
        >
          Export Video
        </button>
        {exportMenuOpen && (
          <div className="absolute left-0 mt-2 w-full bg-white border border-[#ede7fa] rounded-lg shadow z-10">
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm"
              onClick={() => {
                setExportMenuOpen(false);
                onExportWebM();
              }}
            >
              Export WebM
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

      {/* Demo Properties */}

      {/* Main Tabs */}
      <div className="flex justify-between bg-[#F6F3FF] rounded-xl p-1">
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            activeTab === "background"
              ? "bg-white text-[#7C5CFC] shadow"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("background")}
        >
          Background
        </button>
        <button
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            activeTab === "tools"
              ? "bg-white text-[#7C5CFC] shadow"
              : "text-gray-600"
          }`}
          onClick={() => setActiveTab("tools")}
        >
          Tools
        </button>
      </div>

      {/* BACKGROUND TAB */}
      {activeTab === "background" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#A594F9]">Background</h2>
          </div>

          {/* Sub-tab: Image */}
          {bgSubTab === "image" && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {imageBackgroundOptions.map((bg) => {
                  const isActive = localSelectedBackground === bg.id;
                  return (
                    <button
                      key={bg.id}
                      onClick={() => handleBackgroundSelect(bg.id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        isActive
                          ? "border-[#7C5CFC] shadow-md"
                          : "border-[#ede7fa] hover:border-[#A594F9]"
                      }`}
                      title={bg.name}
                    >
                      <div className="w-full h-[60px] flex items-center justify-center bg-white">
                        <Image
                          src={bg.thumbnail}
                          alt={bg.name}
                          width={80}
                          height={60}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      {isActive && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-[#7C5CFC] rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full" />
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Custom image preview tile if available */}
                {customBackgroundUrl && (
                  <button
                    onClick={() => handleBackgroundSelect("custom")}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      localSelectedBackground === "custom"
                        ? "border-[#7C5CFC] shadow-md"
                        : "border-[#ede7fa] hover:border-[#A594F9]"
                    }`}
                    title={localCustomBackground?.name || "Custom"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customBackgroundUrl}
                      alt="Custom"
                      className="w-full h-[60px] object-cover"
                    />
                    {localSelectedBackground === "custom" && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-[#7C5CFC] rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </button>
                )}
              </div>

              {/* Type select + upload */}
              <div className="mt-3">
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

              <div className="mt-3">
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
            </>
          )}

          {/* Sub-tab: Gradient */}
          {bgSubTab === "gradient" && (
            <div className="grid grid-cols-3 gap-2">
              {gradientOptions.map((g) => {
                const val = `gradient:${g.id}`;
                const isActive = localSelectedBackground === val;
                return (
                  <button
                    key={g.id}
                    onClick={() => handleBackgroundSelect(val)}
                    className={`relative h-16 rounded-lg border-2 ${g.css} ${
                      isActive
                        ? "border-[#7C5CFC] shadow-md"
                        : "border-[#ede7fa] hover:border-[#A594F9]"
                    }`}
                    title={g.name}
                  >
                    {isActive && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-[#7C5CFC] rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-tab: Color */}
          {bgSubTab === "color" && (
            <div className="grid grid-cols-6 gap-2">
              {colorOptions.map((c) => {
                const val = `color:${c.hex}`;
                const isActive = localSelectedBackground === val;
                return (
                  <button
                    key={c.hex}
                    onClick={() => handleBackgroundSelect(val)}
                    className={`relative h-10 rounded-md border-2 ${
                      isActive
                        ? "border-[#7C5CFC] shadow"
                        : "border-[#ede7fa] hover:border-[#A594F9]"
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {isActive && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-[#7C5CFC] rounded-full" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sub-tab: Hidden */}
          {bgSubTab === "hidden" && (
            <div className="rounded-lg border border-dashed border-[#ede7fa] p-4 text-sm text-gray-600">
              <p className="mb-2">Hide background completely.</p>
              <button
                onClick={() => handleBackgroundSelect("hidden")}
                className={`px-3 py-1.5 rounded-md font-semibold ${
                  localSelectedBackground === "hidden"
                    ? "bg-[#7C5CFC] text-white"
                    : "bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#d1c6fa]"
                }`}
              >
                Set Hidden
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOOLS TAB */}
      {activeTab === "tools" && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[#A594F9]">Tools</h2>

          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setTool("none")}
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
                onClick={() => setTool(t)}
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
              className="w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF]"
            >
              UNDO
            </button>
            <button
              onClick={handleClear}
              className="w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF]"
            >
              CLEAR
            </button>
            <button
              onClick={handleSaveOverlays}
              className="w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF]"
            >
              SAVE
            </button>
            <button
              onClick={handleLoadOverlays}
              className="w-full py-2 rounded-lg font-semibold shadow-sm transition-all text-sm tracking-wide border bg-[#E6E1FA] text-[#7C5CFC] hover:bg-[#F6F3FF]"
            >
              LOAD
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default EditorSidebar;
