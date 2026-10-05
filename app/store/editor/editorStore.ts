import type { Dispatch, SetStateAction } from "react";
import { create } from "zustand";

import type { ZoomEffect } from "@/app/types/editor/zoom-effect";
import type { AvsState } from "@/app/types/avs";
import type { WtmState } from "@/app/types/wtm";
import type {
  BrowserFrameMode,
  CtaItem,
  Segment,
} from "@/app/(signed)/editor/hooks/useEditorState";

type ToolMode = "none" | "blur" | "rect" | "arrow" | "text";

/**
 * Central editor state store (issue #150). Holds the 34 non-ref fields that used
 * to live in the useEditorState god-hook. Refs (playerRef, canvasRef,
 * videoContainerRef) intentionally stay OUT of the store and remain React refs,
 * created in the useEditorState shim / EditorClient.
 *
 * Setters mirror React's useState signature (`Dispatch<SetStateAction<T>>`) so the
 * useEditorState shim keeps returning the exact same shape and every existing
 * consumer — including functional updates like `setCtas(prev => ...)` — keeps
 * working untouched.
 */
export interface EditorStoreState {
  // Source
  params: URLSearchParams | null;
  videoUrl: string | null;

  // Playback / video
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  // Timeline
  timelineStartTime: number;
  timelineEndTime: number;
  inputStartTime: string;
  inputEndTime: string;

  // Segments
  loadedSegments: Segment[] | null;
  currentSegments: Segment[];

  // Tool
  tool: ToolMode;
  textColor: string;
  textFont: string;

  // Sidebar / UI
  sidebarTitle: string;
  sidebarDescription: string;
  isSidebarOpen: boolean;
  isDashboardMenuOpen: boolean;
  isFullscreen: boolean;

  // CTA (definitions live in the Cta table, not in demo.editing)
  ctas: CtaItem[];

  // Modal / save
  showSaveDemoModal: boolean;
  savingDemo: boolean;
  demoSaved: boolean;
  savedDemoId: string | null;

  // Zoom UI
  zoomEffects: ZoomEffect[];
  isZoomPopupOpen: boolean;

  // Background
  selectedBackground: string | null;
  backgroundType: string;
  customBackground: File | null;

  // Aspect ratio / browser frame
  aspectRatio: string;
  browserFrameMode: BrowserFrameMode;
  browserFrameDrawShadow: boolean;
  browserFrameDrawBorder: boolean;

  // AVS (AI Script, Voiceover & Audio Synchronization) — persisted to
  // Demo.editing.avs. Null until the feature produces state for this demo.
  avs: AvsState | null;

  // Whether the preview should play the dubbed-aligned source (`avs.dubAligned`)
  // instead of the original recording. Session-only UI state — never persisted.
  previewDubSource: boolean;

  // WTM (Automated Video Watermarking & Compositing) — persisted to
  // Demo.editing.wtm. Null until the branding panel produces state for this demo.
  wtm: WtmState | null;

  // Setters
  setParams: Dispatch<SetStateAction<URLSearchParams | null>>;
  setVideoUrl: Dispatch<SetStateAction<string | null>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setDuration: Dispatch<SetStateAction<number>>;
  setVolume: Dispatch<SetStateAction<number>>;
  setTimelineStartTime: Dispatch<SetStateAction<number>>;
  setTimelineEndTime: Dispatch<SetStateAction<number>>;
  setInputStartTime: Dispatch<SetStateAction<string>>;
  setInputEndTime: Dispatch<SetStateAction<string>>;
  setLoadedSegments: Dispatch<SetStateAction<Segment[] | null>>;
  setCurrentSegments: Dispatch<SetStateAction<Segment[]>>;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  setTextColor: Dispatch<SetStateAction<string>>;
  setTextFont: Dispatch<SetStateAction<string>>;
  setSidebarTitle: Dispatch<SetStateAction<string>>;
  setSidebarDescription: Dispatch<SetStateAction<string>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setIsDashboardMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  setCtas: Dispatch<SetStateAction<CtaItem[]>>;
  setShowSaveDemoModal: Dispatch<SetStateAction<boolean>>;
  setSavingDemo: Dispatch<SetStateAction<boolean>>;
  setDemoSaved: Dispatch<SetStateAction<boolean>>;
  setSavedDemoId: Dispatch<SetStateAction<string | null>>;
  setZoomEffects: Dispatch<SetStateAction<ZoomEffect[]>>;
  setIsZoomPopupOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedBackground: Dispatch<SetStateAction<string | null>>;
  setBackgroundType: Dispatch<SetStateAction<string>>;
  setCustomBackground: Dispatch<SetStateAction<File | null>>;
  setAspectRatio: Dispatch<SetStateAction<string>>;
  setBrowserFrameMode: Dispatch<SetStateAction<BrowserFrameMode>>;
  setBrowserFrameDrawShadow: Dispatch<SetStateAction<boolean>>;
  setBrowserFrameDrawBorder: Dispatch<SetStateAction<boolean>>;
  setAvs: Dispatch<SetStateAction<AvsState | null>>;
  setPreviewDubSource: Dispatch<SetStateAction<boolean>>;
  setWtm: Dispatch<SetStateAction<WtmState | null>>;

  reset: () => void;
}

/** Resolve a `SetStateAction` against the previous value (supports functional updates). */
const resolve = <T>(value: SetStateAction<T>, prev: T): T =>
  typeof value === "function" ? (value as (prev: T) => T)(prev) : value;

const initialState = {
  params: null as URLSearchParams | null,
  videoUrl: null as string | null,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  timelineStartTime: 0,
  timelineEndTime: 0,
  inputStartTime: "00:00:00",
  inputEndTime: "00:00:00",
  loadedSegments: null as Segment[] | null,
  currentSegments: [] as Segment[],
  tool: "none" as ToolMode,
  textColor: "#000000",
  textFont: "16px sans-serif",
  sidebarTitle: "",
  sidebarDescription: "",
  isSidebarOpen: false,
  isDashboardMenuOpen: false,
  isFullscreen: false,
  ctas: [] as CtaItem[],
  showSaveDemoModal: false,
  savingDemo: false,
  demoSaved: false,
  savedDemoId: null as string | null,
  zoomEffects: [] as ZoomEffect[],
  isZoomPopupOpen: false,
  selectedBackground: null as string | null,
  backgroundType: "",
  customBackground: null as File | null,
  aspectRatio: "native",
  browserFrameMode: "default" as BrowserFrameMode,
  browserFrameDrawShadow: true,
  browserFrameDrawBorder: false,
  avs: null as AvsState | null,
  previewDubSource: false,
  wtm: null as WtmState | null,
};

export const useEditorStore = create<EditorStoreState>((set) => ({
  ...initialState,

  setParams: (v) => set((s) => ({ params: resolve(v, s.params) })),
  setVideoUrl: (v) => set((s) => ({ videoUrl: resolve(v, s.videoUrl) })),
  setPlaying: (v) => set((s) => ({ playing: resolve(v, s.playing) })),
  setCurrentTime: (v) => set((s) => ({ currentTime: resolve(v, s.currentTime) })),
  setDuration: (v) => set((s) => ({ duration: resolve(v, s.duration) })),
  setVolume: (v) => set((s) => ({ volume: resolve(v, s.volume) })),
  setTimelineStartTime: (v) => set((s) => ({ timelineStartTime: resolve(v, s.timelineStartTime) })),
  setTimelineEndTime: (v) => set((s) => ({ timelineEndTime: resolve(v, s.timelineEndTime) })),
  setInputStartTime: (v) => set((s) => ({ inputStartTime: resolve(v, s.inputStartTime) })),
  setInputEndTime: (v) => set((s) => ({ inputEndTime: resolve(v, s.inputEndTime) })),
  setLoadedSegments: (v) => set((s) => ({ loadedSegments: resolve(v, s.loadedSegments) })),
  setCurrentSegments: (v) => set((s) => ({ currentSegments: resolve(v, s.currentSegments) })),
  setTool: (v) => set((s) => ({ tool: resolve(v, s.tool) })),
  setTextColor: (v) => set((s) => ({ textColor: resolve(v, s.textColor) })),
  setTextFont: (v) => set((s) => ({ textFont: resolve(v, s.textFont) })),
  setSidebarTitle: (v) => set((s) => ({ sidebarTitle: resolve(v, s.sidebarTitle) })),
  setSidebarDescription: (v) =>
    set((s) => ({ sidebarDescription: resolve(v, s.sidebarDescription) })),
  setIsSidebarOpen: (v) => set((s) => ({ isSidebarOpen: resolve(v, s.isSidebarOpen) })),
  setIsDashboardMenuOpen: (v) =>
    set((s) => ({ isDashboardMenuOpen: resolve(v, s.isDashboardMenuOpen) })),
  setIsFullscreen: (v) => set((s) => ({ isFullscreen: resolve(v, s.isFullscreen) })),
  setCtas: (v) => set((s) => ({ ctas: resolve(v, s.ctas) })),
  setShowSaveDemoModal: (v) => set((s) => ({ showSaveDemoModal: resolve(v, s.showSaveDemoModal) })),
  setSavingDemo: (v) => set((s) => ({ savingDemo: resolve(v, s.savingDemo) })),
  setDemoSaved: (v) => set((s) => ({ demoSaved: resolve(v, s.demoSaved) })),
  setSavedDemoId: (v) => set((s) => ({ savedDemoId: resolve(v, s.savedDemoId) })),
  setZoomEffects: (v) => set((s) => ({ zoomEffects: resolve(v, s.zoomEffects) })),
  setIsZoomPopupOpen: (v) => set((s) => ({ isZoomPopupOpen: resolve(v, s.isZoomPopupOpen) })),
  setSelectedBackground: (v) =>
    set((s) => ({ selectedBackground: resolve(v, s.selectedBackground) })),
  setBackgroundType: (v) => set((s) => ({ backgroundType: resolve(v, s.backgroundType) })),
  setCustomBackground: (v) => set((s) => ({ customBackground: resolve(v, s.customBackground) })),
  setAspectRatio: (v) => set((s) => ({ aspectRatio: resolve(v, s.aspectRatio) })),
  setBrowserFrameMode: (v) => set((s) => ({ browserFrameMode: resolve(v, s.browserFrameMode) })),
  setBrowserFrameDrawShadow: (v) =>
    set((s) => ({ browserFrameDrawShadow: resolve(v, s.browserFrameDrawShadow) })),
  setBrowserFrameDrawBorder: (v) =>
    set((s) => ({ browserFrameDrawBorder: resolve(v, s.browserFrameDrawBorder) })),
  setAvs: (v) => set((s) => ({ avs: resolve(v, s.avs) })),
  setPreviewDubSource: (v) => set((s) => ({ previewDubSource: resolve(v, s.previewDubSource) })),
  setWtm: (v) => set((s) => ({ wtm: resolve(v, s.wtm) })),

  reset: () => set({ ...initialState }),
}));
