import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadBlobToCloudinary } from "./cloudinaryClientUpload";

describe("uploadBlobToCloudinary", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("throws a clear error when NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is missing", async () => {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test_preset";

    const dummyBlob = new Blob(["fake video content"], { type: "video/mp4" });
    await expect(uploadBlobToCloudinary(dummyBlob)).rejects.toThrow(
      "Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  });

  it("throws a clear error when NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET is missing", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test_cloud";
    delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    const dummyBlob = new Blob(["fake video content"], { type: "video/mp4" });
    await expect(uploadBlobToCloudinary(dummyBlob)).rejects.toThrow(
      "Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"
    );
  });

  it("throws a useful error when Cloudinary returns an unsuccessful HTTP response", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test_cloud";
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test_preset";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "Invalid upload_preset" },
      }),
    });

    const dummyBlob = new Blob(["fake video content"], { type: "video/mp4" });
    await expect(uploadBlobToCloudinary(dummyBlob)).rejects.toThrow(
      "Invalid upload_preset"
    );
  });

  it("falls back to HTTP status when error body has no error message", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test_cloud";
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test_preset";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const dummyBlob = new Blob(["fake video content"], { type: "video/mp4" });
    await expect(uploadBlobToCloudinary(dummyBlob)).rejects.toThrow(
      "Cloudinary upload failed with status 500"
    );
  });

  it("throws when response is ok but secure_url is missing", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test_cloud";
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "test_preset";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ public_id: "test_id" }),
    });

    const dummyBlob = new Blob(["fake video content"], { type: "video/mp4" });
    await expect(uploadBlobToCloudinary(dummyBlob)).rejects.toThrow(
      "Cloudinary upload failed with status 200"
    );
  });

  it("successfully uploads and returns secure_url with proper FormData and endpoint", async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "my_cloud";
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = "my_preset";

    let calledUrl = "";
    let calledBody: any = null;

    global.fetch = vi.fn().mockImplementation((url, init) => {
      calledUrl = String(url);
      calledBody = init.body as FormData;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          secure_url: "https://res.cloudinary.com/my_cloud/video/upload/v12345/reframe_sources/video.mp4",
        }),
      });
    });

    const dummyBlob = new Blob(["dummy video bytes"], { type: "video/mp4" });
    const resultUrl = await uploadBlobToCloudinary(dummyBlob);

    expect(resultUrl).toBe(
      "https://res.cloudinary.com/my_cloud/video/upload/v12345/reframe_sources/video.mp4"
    );
    expect(calledUrl).toBe("https://api.cloudinary.com/v1_1/my_cloud/video/upload");
    expect(calledBody).not.toBeNull();
    expect(calledBody?.get("upload_preset")).toBe("my_preset");
    expect(calledBody?.get("folder")).toBe("reframe_sources");
    const attachedFile = calledBody?.get("file") as Blob;
    expect(attachedFile).toBeInstanceOf(Blob);
    expect(attachedFile.size).toBe(dummyBlob.size);
    expect(attachedFile.type).toBe("video/mp4");
  });
});
