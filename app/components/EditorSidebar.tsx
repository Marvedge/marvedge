import React from "react";
import Image from "next/image";

interface EditorSidebarProps {
  title: string;
  onExportWebM: () => void;
  forceShowMobile?: boolean;
  thumbnailUrl?: string;
  selectedBackground?: string | null;
  setSelectedBackground?: (bg: string | null) => void;
  backgroundType?: string;
  setBackgroundType?: (type: string) => void;
  customBackground?: File | null;
  setCustomBackground?: (file: File | null) => void;
  aspectRatio?: string;
  setAspectRatio?: (ratio: string) => void;
  browserFrameMode?: "default" | "minimal" | "hidden";
  setBrowserFrameMode?: (mode: "default" | "minimal" | "hidden") => void;
  browserFrameDrawShadow?: boolean;
  setBrowserFrameDrawShadow?: (enabled: boolean) => void;
  browserFrameDrawBorder?: boolean;
  setBrowserFrameDrawBorder?: (enabled: boolean) => void;
  textOverlayInput?: string;
  setTextOverlayInput?: (value: string) => void;
  textOverlayFontFamily?: string;
  setTextOverlayFontFamily?: (value: string) => void;
  textOverlayFontSize?: number;
  setTextOverlayFontSize?: (value: number) => void;
  onAddTextOverlay?: () => void;
  onDeleteSelectedTextOverlay?: () => void;
  hasSelectedTextOverlay?: boolean;
  textOverlayColor?: string;
  setTextOverlayColor?: (value: string) => void;
  className?: string;
  onOpenSaveDemo?: () => void;
  savingDemo?: boolean;
  demoSaved?: boolean;
  onToggleDashboardMenu?: () => void;
}

type MainTab = "background" | "tools";
type BgSubTab = "image" | "gradient" | "color" | "hidden";

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  title,
  onExportWebM,
  forceShowMobile = false,
  // thumbnailUrl,
  selectedBackground,
  setSelectedBackground,
  backgroundType,
  setBackgroundType,
  customBackground,
  setCustomBackground,
  aspectRatio = "native",
  setAspectRatio,
  browserFrameMode = "default",
  setBrowserFrameMode,
  browserFrameDrawShadow = true,
  setBrowserFrameDrawShadow,
  browserFrameDrawBorder = false,
  setBrowserFrameDrawBorder,
  textOverlayInput = "Add text",
  setTextOverlayInput,
  textOverlayFontFamily = "Arial",
  setTextOverlayFontFamily,
  textOverlayFontSize = 24,
  setTextOverlayFontSize,
  onAddTextOverlay,
  textOverlayColor = "#ffffff",
  setTextOverlayColor,
  onOpenSaveDemo,
  savingDemo = false,
  demoSaved = false,
  onToggleDashboardMenu,
}) => {
  //const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<MainTab>("background");
  const [bgSubTab, setBgSubTab] = React.useState<BgSubTab>("image");

  const [localSelectedBackground, setLocalSelectedBackground] = React.useState<string | null>(
    selectedBackground ?? null
  );
  const [localBackgroundType, setLocalBackgroundType] = React.useState<string>(
    backgroundType || ""
  );
  const [localCustomBackground, setLocalCustomBackground] = React.useState<File | null>(
    customBackground || null
  );
  const [customBackgroundUrl, setCustomBackgroundUrl] = React.useState<string | null>(null);

  // Sync down external changes if they happen upstream
  React.useEffect(() => {
    if (selectedBackground !== undefined) {
      setLocalSelectedBackground(selectedBackground);
    }
  }, [selectedBackground]);
  React.useEffect(() => {
    if (backgroundType !== undefined) {
      setLocalBackgroundType(backgroundType);
    }
  }, [backgroundType]);
  React.useEffect(() => {
    if (customBackground !== undefined) {
      setLocalCustomBackground(customBackground);
    }
  }, [customBackground]);

  const handleBackgroundSelect = (value: string | null) => {
    // Toggle behavior: clicking the active background again removes it.
    const nextValue = localSelectedBackground === value ? null : value;
    setLocalSelectedBackground(nextValue);
    setSelectedBackground?.(nextValue);
  };

  const handleCustomBackgroundUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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
  // const [interactionType, setInteractionType] = useState("Click");

  return (
    <aside
      className={`w-full max-w-xs h-screen bg-white border-r border-[#ede7fa] px-4 py-4 flex flex-col gap-4 overflow-y-auto ${
        forceShowMobile ? "flex" : "hidden md:flex"
      }`}
    >
      {/* 3-bar menu + title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onToggleDashboardMenu?.()}
          className="h-[54px] w-[68px] rounded-xl bg-[#A594F9] hover:bg-[#7C5CFC] transition flex items-center justify-center shrink-0 shadow-sm"
          aria-label="Open dashboard menu"
        >
          <div className="flex flex-col gap-1.5">
            <span className="block w-6 h-0.5 bg-white rounded-full" />
            <span className="block w-6 h-0.5 bg-white rounded-full opacity-90" />
            <span className="block w-6 h-0.5 bg-white rounded-full opacity-80" />
          </div>
        </button>
        <div className="min-w-0">
          <div className="text-lg font-semibold text-[#261753] truncate">
            {title?.trim() ? title.trim() : "Untitled demo"}
          </div>
        </div>
      </div>

      {/* Save Demo */}
      <button
        type="button"
        onClick={() => onOpenSaveDemo?.()}
        disabled={demoSaved || savingDemo}
        className={`flex items-center justify-center gap-2 w-full h-[54px] font-semibold rounded-lg shadow transition text-sm ${
          demoSaved || savingDemo
            ? "bg-[#8A76FC] text-white opacity-70 cursor-not-allowed"
            : "bg-[#8A76FC] hover:bg-[#7A66EC] text-white"
        }`}
      >
        {savingDemo ? "Saving..." : demoSaved ? "✓ Saved" : "Save Demo"}
      </button>

      {/* Export Section */}
      <div className="relative">
        <button
          className="flex items-center justify-center gap-2 w-full h-[54px] bg-[#A594F9] hover:bg-[#7C5CFC] text-white font-semibold py-1.5 rounded-lg shadow transition text-sm"
          //onClick={() => setExportMenuOpen((v) => !v)} // Only toggle the menu
          onClick={() => {
            onExportWebM();
          }}
        >
          <Image src="/icons/bx_export.svg" alt="export_icon" width={24} height={24} />
          <span className="text-md">Export Video</span>
        </button>

        {
          // exportMenuOpen &&
          //(
          // <div className="absolute left-0 mt-2 w-full bg-white border border-[#ede7fa] rounded-lg shadow z-10">
          //   {/* <button
          //     className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm"
          //     onClick={() => {
          //       setExportMenuOpen(false);
          //       onExportWebM();
          //     }}
          //   >
          //     Export WebM
          //   </button> */}
          //   {/* Uncomment onDownloadMP4 if needed */}
          //   {/* <button
          //     className="w-full text-left px-4 py-2 hover:bg-[#F6F3FF] text-[#7C5CFC] text-sm rounded-b-lg"
          //     onClick={() => {
          //       setExportMenuOpen(false);
          //       onDownloadMP4();
          //     }}
          //   >
          //     Download MP4
          //   </button> */}
          // </div>
          //)
        }
      </div>

      {/* Demo Properties */}

      {/* Main Tabs */}
      <div className="flex justify-between bg-[#F6F3FF] rounded-xl p-1">
        <button
          className={`flex-1 cursor-pointer py-2 rounded-lg text-sm font-semibold ${
            activeTab === "background" ? "bg-white text-[#7C5CFC] shadow" : "text-gray-600"
          }`}
          onClick={() => setActiveTab("background")}
        >
          Background
        </button>
        <button
          className={`flex-1 cursor-pointer py-2 rounded-lg text-sm font-semibold ${
            activeTab === "tools" ? "bg-white text-[#7C5CFC] shadow" : "text-gray-600"
          }`}
          onClick={() => setActiveTab("tools")}
        >
          Tools
        </button>
      </div>

      {/* cd  TAB */}
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
                <label className="block text-[#A594F9] font-semibold mb-2">Select Type</label>
                <select
                  value={localBackgroundType}
                  onChange={(e) => {
                    setLocalBackgroundType(e.target.value);
                    setBackgroundType?.(e.target.value);
                  }}
                  className="w-full border cursor-pointer border-[#ede7fa] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#A594F9] text-[#7C5CFC]"
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
                      {localCustomBackground ? localCustomBackground.name : "Upload Custom Image"}
                    </span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="space-y-6">
          {/* Aspect Ratio Section */}
          <div>
            <h2 className="text-lg font-bold text-[#A594F9] mb-4">Aspect Ratio</h2>
            <div className="relative w-[180px]">
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio && setAspectRatio(e.target.value)}
                className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#7C5CFC] font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-[#A594F9] cursor-pointer"
              >
                <option value="native">Native</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
                <option value="2:3">2:3</option>
                <option value="9:16">9:16</option>
              </select>
              {/* Custom dropdown arrow */}
              <div className="absolute top-0 right-0 h-full w-10 flex items-center justify-center pointer-events-none">
                <svg
                  className="w-4 h-4 text-[#7C5CFC]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Browser Frame Section */}
          <div>
            <h2 className="text-lg font-bold text-[#A594F9] mb-4">Browser Frame</h2>
            <div className="inline-flex items-center rounded-full bg-[#E6E1FA] p-1 gap-1 mb-4">
              {(["default", "minimal", "hidden"] as const).map((mode) => {
                const isActive = browserFrameMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBrowserFrameMode && setBrowserFrameMode(mode)}
                    className={`min-w-[92px] rounded-full px-3 py-1 text-sm transition ${
                      isActive
                        ? "bg-[#D7D0F5] text-[#7C5CFC]"
                        : "bg-transparent text-[#7C5CFC] hover:bg-[#DDD6F8]"
                    }`}
                  >
                    {mode === "default" ? "Default" : mode === "minimal" ? "Minimal" : "Hidden"}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  setBrowserFrameDrawShadow && setBrowserFrameDrawShadow(!browserFrameDrawShadow)
                }
                className="w-full flex items-center justify-between py-1 text-sm"
              >
                <span className="text-[#6B6B6B]">Draw Shadow</span>
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    browserFrameDrawShadow ? "bg-[#8A76FC]" : "bg-[#A3A3A3]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      browserFrameDrawShadow ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setBrowserFrameDrawBorder && setBrowserFrameDrawBorder(!browserFrameDrawBorder)
                }
                className="w-full flex items-center justify-between py-1 text-sm"
              >
                <span className="text-[#6B6B6B]">Draw Border</span>
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    browserFrameDrawBorder ? "bg-[#8A76FC]" : "bg-[#A3A3A3]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      browserFrameDrawBorder ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          {/* Add Text Section */}
          <div>
            <h2 className="text-lg font-bold text-[#A594F9] mb-4">Add Text</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={textOverlayInput}
                onChange={(e) => setTextOverlayInput && setTextOverlayInput(e.target.value)}
                className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#4A3C87] focus:outline-none focus:ring-2 focus:ring-[#A594F9]"
                placeholder="Write your text"
              />

              <div className="grid grid-cols-3 gap-2">
                <div className="relative">
                  <select
                    value={textOverlayFontFamily}
                    onChange={(e) =>
                      setTextOverlayFontFamily && setTextOverlayFontFamily(e.target.value)
                    }
                    className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#7C5CFC] font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#A594F9] cursor-pointer"
                  >
                    <option value="Arial">Arial</option>
                    <option value="Inter">Inter</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                  <div className="absolute top-0 right-0 h-full w-8 flex items-center justify-center pointer-events-none">
                    <svg
                      className="w-4 h-4 text-[#7C5CFC]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                <div className="relative">
                  <select
                    value={String(textOverlayFontSize)}
                    onChange={(e) =>
                      setTextOverlayFontSize && setTextOverlayFontSize(Number(e.target.value))
                    }
                    className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#7C5CFC] font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#A594F9] cursor-pointer"
                  >
                    <option value="16">16</option>
                    <option value="20">20</option>
                    <option value="24">24</option>
                    <option value="28">28</option>
                    <option value="32">32</option>
                    <option value="40">40</option>
                  </select>
                  <div className="absolute top-0 right-0 h-full w-8 flex items-center justify-center pointer-events-none">
                    <svg
                      className="w-4 h-4 text-[#7C5CFC]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                <div className="relative">
                  <select
                    value={textOverlayColor}
                    onChange={(e) => setTextOverlayColor && setTextOverlayColor(e.target.value)}
                    className="w-full border border-[#ede7fa] bg-[#F6F3FF] rounded-lg px-3 py-2 text-sm text-[#7C5CFC] font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-[#A594F9] cursor-pointer"
                  >
                    <option value="#ffffff">White</option>
                    <option value="#000000">Black</option>
                    <option value="#ff0000">Red</option>
                    <option value="#00ff00">Green</option>
                    <option value="#0000ff">Blue</option>
                    <option value="#ffff00">Yellow</option>
                    <option value="#A594F9">Purple</option>
                  </select>
                  <div className="absolute top-0 right-0 h-full w-8 flex items-center justify-center pointer-events-none">
                    <svg
                      className="w-4 h-4 text-[#7C5CFC]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAddTextOverlay && onAddTextOverlay()}
                  className="w-full rounded-lg bg-[#8A76FC] text-white py-2 text-sm font-semibold hover:bg-[#7C5CFC] transition"
                >
                  Add Text
                </button>
                <div className="w-full rounded-lg border border-transparent text-[#8A76FC] py-2 text-sm font-semibold opacity-60 select-none flex items-center justify-center">
                  Delete via canvas
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default EditorSidebar;
