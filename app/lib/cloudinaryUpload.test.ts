import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cloudinaryResourceTypeFor,
  cloudinaryUploadBuffer,
  getCloudinaryCloudName,
  getCloudinaryUploadPreset,
  isCloudinaryUploadConfigured,
  isEditorCloudinaryUploadEnabled,
  uploadVideoToCloudinary,
  CloudinaryUploadError,
} from "./cloudinaryUpload";

describe("cloudinaryUpload", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Configuration & Environment Helpers", () => {
    it("reads cloud name from NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or CLOUDINARY_CLOUD_NAME", () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      expect(getCloudinaryCloudName()).toBe("");

      process.env.CLOUDINARY_CLOUD_NAME = "server-cloud";
      expect(getCloudinaryCloudName()).toBe("server-cloud");

      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "client-cloud";
      expect(getCloudinaryCloudName()).toBe("client-cloud");
    });

    it("reads upload preset from NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET or CLOUDINARY_UPLOAD_PRESET", () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      delete process.env.CLOUDINARY_UPLOAD_PRESET;
      expect(getCloudinaryUploadPreset()).toBe("");

      process.env.CLOUDINARY_UPLOAD_PRESET = "server-preset";
      expect(getCloudinaryUploadPreset()).toBe("server-preset");

      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "client-preset";
      expect(getCloudinaryUploadPreset()).toBe("client-preset");
    });

    it("checks if upload is configured correctly", () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      delete process.env.CLOUDINARY_UPLOAD_PRESET;
      expect(isCloudinaryUploadConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "my-cloud";
      expect(isCloudinaryUploadConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "my-preset";
      expect(isCloudinaryUploadConfigured()).toBe(true);
    });

    it("checks if local editor upload flag is enabled", () => {
      delete process.env.NEXT_PUBLIC_EDITOR_CLOUDINARY_VIDEO_UPLOAD;
      expect(isEditorCloudinaryUploadEnabled()).toBe(false);

      process.env.NEXT_PUBLIC_EDITOR_CLOUDINARY_VIDEO_UPLOAD = "true";
      expect(isEditorCloudinaryUploadEnabled()).toBe(true);
    });
  });

  describe("cloudinaryResourceTypeFor", () => {
    it("identifies video MIME types", () => {
      expect(cloudinaryResourceTypeFor("video/mp4")).toBe("video");
      expect(cloudinaryResourceTypeFor("video/webm")).toBe("video");
      expect(cloudinaryResourceTypeFor("video/quicktime")).toBe("video");
      expect(cloudinaryResourceTypeFor("audio/mpeg")).toBe("video");
    });

    it("identifies video formats by file extension even with blank/generic MIME", () => {
      expect(cloudinaryResourceTypeFor("", "sample.mp4")).toBe("video");
      expect(cloudinaryResourceTypeFor("", "recording.webm")).toBe("video");
      expect(cloudinaryResourceTypeFor("application/octet-stream", "clip.mov")).toBe("video");
      expect(cloudinaryResourceTypeFor("", "movie.mkv")).toBe("video");
      expect(cloudinaryResourceTypeFor("", "camera.avi")).toBe("video");
    });

    it("identifies image MIME types", () => {
      expect(cloudinaryResourceTypeFor("image/png")).toBe("image");
      expect(cloudinaryResourceTypeFor("image/jpeg")).toBe("image");
    });

    it("falls back to raw for unknown content", () => {
      expect(cloudinaryResourceTypeFor("application/pdf", "doc.pdf")).toBe("raw");
    });
  });

  describe("uploadVideoToCloudinary (Browser / Client-Side API)", () => {
    it("uploads video file with FormData and returns dynamic secure_url", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      const dynamicSecureUrl = `https://res.cloudinary.com/test-cloud/video/upload/v123456/user-video-${Date.now()}.mp4`;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ secure_url: dynamicSecureUrl }),
      });
      globalThis.fetch = fetchMock;

      const file = new File(["dummy-video-content"], "test-video.mp4", { type: "video/mp4" });
      const secureUrl = await uploadVideoToCloudinary({
        file,
        folder: "marvedge/test_folder",
        filename: "test-video.mp4",
      });

      expect(secureUrl).toBe(dynamicSecureUrl);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe("https://api.cloudinary.com/v1_1/test-cloud/video/upload");
      expect(calledOptions.method).toBe("POST");

      const body = calledOptions.body as FormData;
      expect(body.get("upload_preset")).toBe("test-preset");
      expect(body.get("folder")).toBe("marvedge/test_folder");
      expect(body.get("file")).toBeDefined();
    });

    it("throws CloudinaryUploadError when not configured", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;

      const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
      await expect(uploadVideoToCloudinary({ file })).rejects.toThrow(CloudinaryUploadError);
    });

    it("throws CloudinaryUploadError when upload response is not ok", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Invalid file type" } }),
      });

      const file = new File(["dummy"], "bad.mp4", { type: "video/mp4" });
      await expect(uploadVideoToCloudinary({ file })).rejects.toThrow("Invalid file type");
    });
  });

  describe("cloudinaryUploadBuffer (Server-Side Node Buffer API)", () => {
    it("uploads buffer separately via Node Buffer interface", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      const dynamicSecureUrl = `https://res.cloudinary.com/test-cloud/video/upload/v123456/buffer-video-${Date.now()}.mp4`;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ secure_url: dynamicSecureUrl }),
      });
      globalThis.fetch = fetchMock;

      const buffer = Buffer.from("test buffer content");
      const secureUrl = await cloudinaryUploadBuffer({
        buffer,
        contentType: "video/mp4",
        folder: "marvedge/audio",
        filename: "clip.mp4",
      });

      expect(secureUrl).toBe(dynamicSecureUrl);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
