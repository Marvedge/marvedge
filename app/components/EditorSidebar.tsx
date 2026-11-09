import React from "react";
import { MainTab } from "./editorSidebar/backgroundOptions";
import SidebarHeader from "./editorSidebar/SidebarHeader";
import BackgroundPanel from "./editorSidebar/BackgroundPanel";
import ToolsPanel from "./editorSidebar/ToolsPanel";
import CtaPanel from "./editorSidebar/CtaPanel";
import AvsPanel from "./editorSidebar/AvsPanel";
import SubtitlePanel from "./editorSidebar/SubtitlePanel";
import SubtitleGenerateActions from "./editorSidebar/subtitles/SubtitleGenerateActions";
import BrandingPanel from "./editorSidebar/BrandingPanel";
import AudioPanel from "./editorSidebar/audio/AudioPanel";
import OverlaysPanel from "./editorSidebar/OverlaysPanel";
import { isAvsPanelEnabled } from "@/app/lib/avs/flags";
import { isWtmPanelEnabled } from "@/app/lib/wtm/flags";
import { isSubtitleEditorEnabled } from "@/app/lib/subtitles";
import { useSubtitleStore } from "@/app/store/editor/subtitleStore";
import { isAudioPanelEnabled } from "@/app/lib/audio/flags";
import { isOverlaysPanelEnabled } from "@/app/lib/overlays/flags";
import type { CtaItem } from "@/app/(signed)/editor/apiTypes";

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
  onAddSubtitles?: () => void;
  onClearSubtitles?: () => void;
  subtitlesLoading?: boolean;
  hasSubtitles?: boolean;
  /** Stop waiting on a running subtitle job (PRD §13). */
  onCancelSubtitles?: () => void;
  cancelling?: boolean;
  /** Seek the player. The subtitle panel uses it to jump to a cue. */
  onSeek?: (seconds: number) => void;
  className?: string;
  onOpenSaveDemo?: () => void;
  savingDemo?: boolean;
  demoSaved?: boolean;
  onToggleDashboardMenu?: () => void;
  ctas?: CtaItem[];
  onAddCta?: (data: { label: string; url: string; placement?: string }) => void | Promise<void>;
  onUpdateCta?: (
    id: string,
    data: { label?: string; url?: string; placement?: string | null }
  ) => void | Promise<void>;
  onDeleteCta?: (id: string) => void | Promise<void>;
  onReorderCta?: (id: string, direction: "up" | "down") => void | Promise<void>;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({
  title,
  onExportWebM,
  forceShowMobile = false,

  selectedBackground,
  setSelectedBackground,
  backgroundType,
  setBackgroundType,
  customBackground,
  setCustomBackground,
  aspectRatio = "native",
  setAspectRatio,
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
  onAddSubtitles,
  onClearSubtitles,
  subtitlesLoading = false,
  hasSubtitles = false,
  onCancelSubtitles,
  cancelling = false,
  onSeek,
  onOpenSaveDemo,
  savingDemo = false,
  demoSaved = false,
  onToggleDashboardMenu,
  ctas,
  onAddCta,
  onUpdateCta,
  onDeleteCta,
  onReorderCta,
}) => {
  const [activeTab, setActiveTab] = React.useState<MainTab>("background");

  // Picking a cue on the timeline's subtitle track (SUB PR 3) has to bring the
  // cue list up, or "selecting a block scrolls the list to it" only works when
  // the user happened to already be on this tab. Driven off the store's focus
  // nonce rather than the selected index, so re-picking the same block after
  // switching away still comes back here.
  const cueFocusNonce = useSubtitleStore((s) => s.cueFocusNonce);
  React.useEffect(() => {
    if (isSubtitleEditorEnabled() && useSubtitleStore.getState().selectedCueIndex !== null) {
      setActiveTab("subtitles");
    }
  }, [cueFocusNonce]);

  return (
    <aside
      className={`editor-sidebar w-full max-w-xs h-screen bg-white border-r border-[#ede7fa] px-4 py-4 flex flex-col gap-4 overflow-y-auto ${
        forceShowMobile ? "flex" : "hidden md:flex"
      }`}
    >
      <SidebarHeader
        title={title}
        onToggleDashboardMenu={onToggleDashboardMenu}
        onOpenSaveDemo={onOpenSaveDemo}
        savingDemo={savingDemo}
        demoSaved={demoSaved}
        onExportWebM={onExportWebM}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {activeTab === "background" && (
        <BackgroundPanel
          selectedBackground={selectedBackground}
          setSelectedBackground={setSelectedBackground}
          backgroundType={backgroundType}
          setBackgroundType={setBackgroundType}
          customBackground={customBackground}
          setCustomBackground={setCustomBackground}
        />
      )}

      {activeTab === "tools" && (
        <div className="space-y-6">
          <ToolsPanel
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            browserFrameDrawShadow={browserFrameDrawShadow}
            setBrowserFrameDrawShadow={setBrowserFrameDrawShadow}
            browserFrameDrawBorder={browserFrameDrawBorder}
            setBrowserFrameDrawBorder={setBrowserFrameDrawBorder}
            textOverlayInput={textOverlayInput}
            setTextOverlayInput={setTextOverlayInput}
            textOverlayFontFamily={textOverlayFontFamily}
            setTextOverlayFontFamily={setTextOverlayFontFamily}
            textOverlayFontSize={textOverlayFontSize}
            setTextOverlayFontSize={setTextOverlayFontSize}
            onAddTextOverlay={onAddTextOverlay}
            textOverlayColor={textOverlayColor}
            setTextOverlayColor={setTextOverlayColor}
            onAutoGenerateSubtitles={onAddSubtitles}
          />

          {/* Subtitle generation lives in its own tab now. With the editor flag
              off that tab does not exist, so the original buttons stay here and
              the Tools tab looks and behaves exactly as it does today. */}
          {!isSubtitleEditorEnabled() && (
            <SubtitleGenerateActions
              onAddSubtitles={onAddSubtitles}
              onClearSubtitles={onClearSubtitles}
              subtitlesLoading={subtitlesLoading}
              hasSubtitles={hasSubtitles}
              onCancelSubtitles={onCancelSubtitles}
              cancelling={cancelling}
            />
          )}
        </div>
      )}

      {activeTab === "cta" && (
        <CtaPanel
          ctas={ctas}
          onAddCta={onAddCta}
          onUpdateCta={onUpdateCta}
          onDeleteCta={onDeleteCta}
          onReorderCta={onReorderCta}
        />
      )}

      {activeTab === "avs" && isAvsPanelEnabled() && <AvsPanel />}

      {activeTab === "subtitles" && isSubtitleEditorEnabled() && (
        <SubtitlePanel
          onAddSubtitles={onAddSubtitles}
          onClearSubtitles={onClearSubtitles}
          subtitlesLoading={subtitlesLoading}
          hasSubtitles={hasSubtitles}
          onCancelSubtitles={onCancelSubtitles}
          cancelling={cancelling}
          onSeek={onSeek}
        />
      )}
      {activeTab === "audio" && isAudioPanelEnabled() && <AudioPanel />}

      {activeTab === "branding" && isWtmPanelEnabled() && <BrandingPanel />}

      {activeTab === "overlays" && isOverlaysPanelEnabled() && <OverlaysPanel />}
    </aside>
  );
};

export default EditorSidebar;
