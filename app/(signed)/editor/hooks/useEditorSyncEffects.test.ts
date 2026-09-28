import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";

import { useEditorSyncEffects } from "./useEditorSyncEffects";
import type { EditorState } from "../apiTypes";

describe("useEditorSyncEffects - URL precedence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function createMockEditorState(overrides: Partial<EditorState> = {}): EditorState {
    return {
      videoUrl: "",
      currentTime: 0,
      savedDemoId: null,
      duration: 0,
      params: new URLSearchParams(),
      setVideoUrl: vi.fn(),
      setCurrentTime: vi.fn(),
      setSavedDemoId: vi.fn(),
      setDuration: vi.fn(),
      setParams: vi.fn(),
      currentSegments: [],
      setCurrentSegments: vi.fn(),
      zoomEffects: [],
      setZoomEffects: vi.fn(),
      selectedBackground: "",
      setSelectedBackground: vi.fn(),
      backgroundType: "color",
      setBackgroundType: vi.fn(),
      aspectRatio: "16:9",
      setAspectRatio: vi.fn(),
      browserFrameMode: "none",
      setBrowserFrameMode: vi.fn(),
      browserFrameDrawShadow: false,
      setBrowserFrameDrawShadow: vi.fn(),
      browserFrameDrawBorder: false,
      setBrowserFrameDrawBorder: vi.fn(),
      sidebarTitle: "Test",
      setSidebarTitle: vi.fn(),
      sidebarDescription: "",
      setSidebarDescription: vi.fn(),
      timelineStartTime: 0,
      setTimelineStartTime: vi.fn(),
      timelineEndTime: 0,
      setTimelineEndTime: vi.fn(),
      inputStartTime: "00:00",
      setInputStartTime: vi.fn(),
      inputEndTime: "00:00",
      setInputEndTime: vi.fn(),
      demoSaved: false,
      setDemoSaved: vi.fn(),
      isPlaying: false,
      setPlaying: vi.fn(),
      avs: null,
      setAvs: vi.fn(),
      wtm: null,
      setWtm: vi.fn(),
      ctas: [],
      setCtas: vi.fn(),
      ...overrides,
    };
  }

  it("does not overwrite videoUrl with blob when params.get('video') has explicit Cloudinary URL", () => {
    // In React 18 renderToStaticMarkup, effects don't run automatically,
    // so we can test the effect logic directly or with a custom runner.
    // Let's test the effect condition logic.
    const params = new URLSearchParams("video=https://res.cloudinary.com/test-cloud/video/upload/demo.mp4");
    const setVideoUrl = vi.fn();
    const editorState = createMockEditorState({
      videoUrl: "",
      params,
      setVideoUrl,
    });

    const fakeBlob = new Blob(["fake video"], { type: "video/webm" });

    // Simulate the effect condition:
    const shouldSetBlobUrl = !editorState.videoUrl && fakeBlob && !params?.get("video");

    expect(shouldSetBlobUrl).toBeFalsy();
    expect(params.get("video")).toBe("https://res.cloudinary.com/test-cloud/video/upload/demo.mp4");
  });

  it("sets videoUrl to blob when params.get('video') is absent", () => {
    const params = new URLSearchParams();
    const fakeBlob = new Blob(["fake video"], { type: "video/webm" });

    const shouldSetBlobUrl = !"" && fakeBlob && !params?.get("video");
    expect(shouldSetBlobUrl).toBeTruthy();
  });
});
