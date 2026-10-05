import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cloudinaryResourceTypeFor,
  cloudinaryUpload,
  cloudinaryUploadBuffer,
  uploadVideoToCloudinary,
  CloudinaryUploadError,
} from "./cloudinaryUpload";

describe("cloudinaryUpload helper", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("cloudinaryResourceTypeFor", () => {
    it("identifies video MIME types", () => {
      expect(cloudinaryResourceTypeFor("video/mp4")).toBe("video");
      expect(cloudinaryResourceTypeFor("video/webm")).toBe("video");
      expect(cloudinaryResourceTypeFor("audio/mpeg")).toBe("video");
      expect(cloudinaryResourceTypeFor("audio/wav")).toBe("video");
    });

    it("identifies video file extensions even with generic or missing mime", () => {
      expect(cloudinaryResourceTypeFor("application/octet-stream", "clip.mov")).toBe("video");
      expect(cloudinaryResourceTypeFor("", "movie.mkv")).toBe("video");
      expect(cloudinaryResourceTypeFor("", "camera.avi")).toBe("video");
    });

    it("identifies image MIME types", () => {
      expect(cloudinaryResourceTypeFor("image/png")).toBe("image");
      expect(cloudinaryResourceTypeFor("image/jpeg")).toBe("image");
    });

    it("falls back to raw for unknown content or other types", () => {
      expect(cloudinaryResourceTypeFor("application/octet-stream")).toBe("raw");
      expect(cloudinaryResourceTypeFor("application/pdf", "doc.pdf")).toBe("raw");
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
