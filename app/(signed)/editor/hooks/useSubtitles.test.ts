import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import axios from "axios";
import { toast } from "react-hot-toast";

import * as gcsClient from "@/app/lib/gcsUploadClient";
import * as cloudinaryClient from "@/app/lib/cloudinaryUpload";
import { resolveSubtitleSourceUrl, useSubtitles } from "./useSubtitles";
import type { EditorState } from "../apiTypes";

vi.mock("react-hot-toast", () => ({
  toast: Object.assign(vi.fn(), {
    loading: vi.fn().mockReturnValue("toast-id"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

describe("useSubtitles & resolveSubtitleSourceUrl", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveSubtitleSourceUrl", () => {
    it("bypasses upload entirely when videoUrl is already an HTTPS Cloudinary URL", async () => {
      const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");
      const cloudinarySpy = vi.spyOn(cloudinaryClient, "cloudinaryUpload");

      const httpsUrl = "https://res.cloudinary.com/test-cloud/video/upload/demo.mp4";
      const result = await resolveSubtitleSourceUrl(httpsUrl);

      expect(result).toBe(httpsUrl);
      expect(cloudinarySpy).not.toHaveBeenCalled();
      expect(gcsSpy).not.toHaveBeenCalled();
    });

    it("bypasses upload entirely for any standard HTTPS video URL", async () => {
      const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");
      const cloudinarySpy = vi.spyOn(cloudinaryClient, "cloudinaryUpload");

      const httpsUrl = "https://storage.googleapis.com/some-bucket/video.mp4";
      const result = await resolveSubtitleSourceUrl(httpsUrl);

      expect(result).toBe(httpsUrl);
      expect(cloudinarySpy).not.toHaveBeenCalled();
      expect(gcsSpy).not.toHaveBeenCalled();
    });

    it("uploads blob to Cloudinary and does NOT call uploadBlobToGcs in local development", async () => {
      const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");
      const expectedCloudinaryUrl = "https://res.cloudinary.com/test-cloud/video/upload/v1/subtitles_source/test.webm";
      const cloudinarySpy = vi
        .spyOn(cloudinaryClient, "cloudinaryUpload")
        .mockResolvedValue(expectedCloudinaryUrl);

      const fakeBlob = new Blob(["video data"], { type: "video/webm" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => fakeBlob,
      });
      vi.stubGlobal("fetch", fetchMock);

      const blobUrl = "blob:http://localhost:3000/1234-5678";
      const result = await resolveSubtitleSourceUrl(blobUrl, { isLocalDev: true });

      expect(result).toBe(expectedCloudinaryUrl);
      expect(cloudinarySpy).toHaveBeenCalledTimes(1);
      expect(cloudinarySpy).toHaveBeenCalledWith(
        fakeBlob,
        expect.objectContaining({
          folder: "subtitles_source",
          filename: "subtitle_source.webm",
          contentType: "video/webm",
        })
      );
      expect(gcsSpy).not.toHaveBeenCalled();
    });

    it("falls back to uploadBlobToGcs when in production and useGcs is true", async () => {
      const expectedGcsUrl = "gs://prod-bucket/uploads/subtitle-source/source.webm";
      const gcsSpy = vi
        .spyOn(gcsClient, "uploadBlobToGcs")
        .mockResolvedValue({ url: expectedGcsUrl });
      const cloudinarySpy = vi.spyOn(cloudinaryClient, "cloudinaryUpload");

      const fakeBlob = new Blob(["video data"], { type: "video/webm" });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: async () => fakeBlob,
        })
      );

      const blobUrl = "blob:http://localhost:3000/1234-5678";
      const result = await resolveSubtitleSourceUrl(blobUrl, {
        isLocalDev: false,
        useGcs: true,
      });

      expect(result).toBe(expectedGcsUrl);
      expect(gcsSpy).toHaveBeenCalledTimes(1);
      expect(cloudinarySpy).not.toHaveBeenCalled();
    });
  });

  describe("handleAddSubtitles hook execution", () => {
    function createMockEditorState(overrides: Partial<EditorState> = {}): EditorState {
      return {
        videoUrl: "blob:http://localhost:3000/test-blob",
        currentTime: 0,
        savedDemoId: "demo-123",
        duration: 30,
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
        timelineEndTime: 30,
        setTimelineEndTime: vi.fn(),
        inputStartTime: "00:00",
        setInputStartTime: vi.fn(),
        inputEndTime: "00:30",
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

    function renderHookHelper(editorState: EditorState) {
      let hookReturn!: ReturnType<typeof useSubtitles>;
      function TestComponent() {
        hookReturn = useSubtitles({ editorState });
        return null;
      }
      ReactDOMServer.renderToStaticMarkup(React.createElement(TestComponent));
      return hookReturn;
    }

    it("uploads blob to Cloudinary and passes resulting HTTPS URL to /api/subtitles/create", async () => {
      const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");
      const expectedCloudinaryUrl =
        "https://res.cloudinary.com/test-cloud/video/upload/v999/subtitles_source/subtitle_source.webm";
      const cloudinarySpy = vi
        .spyOn(cloudinaryClient, "cloudinaryUpload")
        .mockResolvedValue(expectedCloudinaryUrl);

      const fakeBlob = new Blob(["test-audio-video"], { type: "video/webm" });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: async () => fakeBlob,
        })
      );

      const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
        data: { jobId: "job-abc-123" },
      });

      const getSpy = vi.spyOn(axios, "get").mockResolvedValue({
        data: {
          state: "completed",
          subtitles: [{ start: 0, end: 2, text: "Hello Cloudinary" }],
        },
      });

      const editorState = createMockEditorState({
        videoUrl: "blob:http://localhost:3000/my-recording-blob",
        savedDemoId: "demo-xyz",
        duration: 25,
      });

      const { handleAddSubtitles } = renderHookHelper(editorState);

      await handleAddSubtitles();

      // Verified: blob -> Cloudinary called
      expect(cloudinarySpy).toHaveBeenCalledTimes(1);
      // Verified: uploadBlobToGcs is NEVER called
      expect(gcsSpy).not.toHaveBeenCalled();

      // Verified: /api/subtitles/create received the HTTPS Cloudinary URL
      expect(postSpy).toHaveBeenCalledWith(
        "/api/subtitles/create",
        expect.objectContaining({
          videoUrl: expectedCloudinaryUrl,
          demoId: "demo-xyz",
        })
      );
    });

    it("bypasses upload entirely when videoUrl is already an HTTPS Cloudinary URL", async () => {
      const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");
      const cloudinarySpy = vi.spyOn(cloudinaryClient, "cloudinaryUpload");

      const existingHttpsUrl = "https://res.cloudinary.com/test-cloud/video/upload/preexisting.mp4";

      const postSpy = vi.spyOn(axios, "post").mockResolvedValue({
        data: { jobId: "job-pre-existing" },
      });

      vi.spyOn(axios, "get").mockResolvedValue({
        data: {
          state: "completed",
          subtitles: [{ start: 0, end: 1, text: "Existing video" }],
        },
      });

      const editorState = createMockEditorState({
        videoUrl: existingHttpsUrl,
        savedDemoId: "demo-pre",
        duration: 10,
      });

      const { handleAddSubtitles } = renderHookHelper(editorState);

      await handleAddSubtitles();

      // Verified: no upload was performed
      expect(cloudinarySpy).not.toHaveBeenCalled();
      expect(gcsSpy).not.toHaveBeenCalled();

      // Verified: /api/subtitles/create received the preexisting HTTPS URL directly
      expect(postSpy).toHaveBeenCalledWith(
        "/api/subtitles/create",
        expect.objectContaining({
          videoUrl: existingHttpsUrl,
          demoId: "demo-pre",
        })
      );
    });
  });
});
