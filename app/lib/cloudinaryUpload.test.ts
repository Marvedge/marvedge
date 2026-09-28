import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cloudinaryResourceTypeFor,
  cloudinaryUpload,
  cloudinaryUploadBuffer,
  CloudinaryUploadError,
  getCloudinaryCloudName,
  getCloudinaryUploadPreset,
  isCloudinaryUploadConfigured,
} from "./cloudinaryUpload";

describe("cloudinaryUpload", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("configuration detection", () => {
    it("recognizes NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET", () => {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "my-test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "my-test-preset";

      expect(getCloudinaryCloudName()).toBe("my-test-cloud");
      expect(getCloudinaryUploadPreset()).toBe("my-test-preset");
      expect(isCloudinaryUploadConfigured()).toBe(true);
    });

    it("falls back to CLOUDINARY_CLOUD_NAME if NEXT_PUBLIC is not set", () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      process.env.CLOUDINARY_CLOUD_NAME = "backend-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "backend-preset";

      expect(getCloudinaryCloudName()).toBe("backend-cloud");
      expect(isCloudinaryUploadConfigured()).toBe(true);
    });

    it("returns false if cloud name or preset is missing", () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "some-preset";
      expect(isCloudinaryUploadConfigured()).toBe(false);

      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "some-cloud";
      delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      expect(isCloudinaryUploadConfigured()).toBe(false);
    });
  });

  describe("resource type detection", () => {
    it("maps video and audio MIME types to video", () => {
      expect(cloudinaryResourceTypeFor("video/webm")).toBe("video");
      expect(cloudinaryResourceTypeFor("video/mp4")).toBe("video");
      expect(cloudinaryResourceTypeFor("audio/wav")).toBe("video");
      expect(cloudinaryResourceTypeFor("audio/mpeg")).toBe("video");
    });

    it("maps image MIME types to image", () => {
      expect(cloudinaryResourceTypeFor("image/png")).toBe("image");
      expect(cloudinaryResourceTypeFor("image/jpeg")).toBe("image");
    });

    it("maps other types to raw", () => {
      expect(cloudinaryResourceTypeFor("application/octet-stream")).toBe("raw");
    });
  });

  describe("cloudinaryUpload function", () => {
    it("successfully uploads a Blob and returns the secure_url", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      const testBlob = new Blob(["video-data"], { type: "video/webm" });
      const expectedUrl = "https://res.cloudinary.com/test-cloud/video/upload/v12345/subtitles_source/test.webm";

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          secure_url: expectedUrl,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const url = await cloudinaryUpload(testBlob, {
        folder: "subtitles_source",
        filename: "test.webm",
        contentType: "video/webm",
      });

      expect(url).toBe(expectedUrl);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[0]).toBe("https://api.cloudinary.com/v1_1/test-cloud/video/upload");
      expect(callArgs[1].method).toBe("POST");
      expect(callArgs[1].body).toBeInstanceOf(FormData);
    });

    it("accepts options object with file property", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      const testBlob = new Blob(["video-data"], { type: "video/webm" });
      const expectedUrl = "https://res.cloudinary.com/test-cloud/video/upload/sample.webm";

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ secure_url: expectedUrl }),
        })
      );

      const url = await cloudinaryUpload({
        file: testBlob,
        folder: "subtitles_source",
      });

      expect(url).toBe(expectedUrl);
    });

    it("throws CloudinaryUploadError if configuration is missing", async () => {
      delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

      const testBlob = new Blob(["data"]);
      await expect(cloudinaryUpload(testBlob)).rejects.toThrow(CloudinaryUploadError);
    });

    it("throws CloudinaryUploadError if Cloudinary API returns error", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({
            error: { message: "Invalid preset" },
          }),
        })
      );

      const testBlob = new Blob(["data"]);
      await expect(cloudinaryUpload(testBlob)).rejects.toThrow("Invalid preset");
    });
  });

  describe("cloudinaryUploadBuffer function", () => {
    it("successfully uploads a Buffer", async () => {
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud";
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test-preset";

      const expectedUrl = "https://res.cloudinary.com/test-cloud/video/upload/audio.mp3";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ secure_url: expectedUrl }),
        })
      );

      const url = await cloudinaryUploadBuffer({
        buffer: Buffer.from("audio-bytes"),
        contentType: "audio/mpeg",
        folder: "audio",
        filename: "test.mp3",
      });

      expect(url).toBe(expectedUrl);
    });
  });
});
