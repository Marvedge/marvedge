import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSubtitleSourceUrl } from "./useSubtitles";
import * as gcsClient from "@/app/lib/gcsUploadClient";

describe("useSubtitles: Subtitle Source Resolution & GCS Bypass (Task-00044)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("GCS BYPASS: passes Cloudinary HTTPS URL directly to subtitle generation without invoking GCS", async () => {
    const dynamicCloudinaryUrl = `https://res.cloudinary.com/test-cloud/video/upload/v12345/user-video-${Date.now()}.mp4`;

    const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");

    const resolved = await resolveSubtitleSourceUrl(dynamicCloudinaryUrl);

    // 1. Returns the exact Cloudinary URL
    expect(resolved).toBe(dynamicCloudinaryUrl);

    // 2. uploadBlobToGcs is NEVER called
    expect(gcsSpy).not.toHaveBeenCalled();
  });

  it("GCS BYPASS: passes any HTTPS video URL directly without invoking GCS", async () => {
    const genericHttpsUrl = "https://cdn.example.com/videos/demo_presentation.mp4";
    const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");

    const resolved = await resolveSubtitleSourceUrl(genericHttpsUrl);

    expect(resolved).toBe(genericHttpsUrl);
    expect(gcsSpy).not.toHaveBeenCalled();
  });

  it("PRODUCTION FALLBACK PRESERVED: calls uploadBlobToGcs when videoUrl is a blob URL", async () => {
    const blobUrl = "blob:http://localhost:3000/mock-recording-blob";
    const gcsResultUrl = "https://storage.googleapis.com/marvedge-raw-us-fast/subtitle_source.webm";

    const mockBlob = new Blob(["mock-video-bytes"], { type: "video/webm" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs").mockResolvedValue({
      url: gcsResultUrl,
      bucket: "marvedge-raw-us-fast",
      object: "subtitle_source.webm",
    });

    const resolved = await resolveSubtitleSourceUrl(blobUrl);

    // 1. GCS upload WAS called for blob URL
    expect(gcsSpy).toHaveBeenCalledTimes(1);
    expect(gcsSpy).toHaveBeenCalledWith({
      blob: mockBlob,
      filename: "subtitle_source.webm",
      kind: "subtitle-source",
    });

    // 2. Returns the GCS URL
    expect(resolved).toBe(gcsResultUrl);
  });

  it("throws if reading recorded video blob fails", async () => {
    const blobUrl = "blob:http://localhost:3000/corrupt-blob";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const gcsSpy = vi.spyOn(gcsClient, "uploadBlobToGcs");

    await expect(resolveSubtitleSourceUrl(blobUrl)).rejects.toThrow("Failed to read recorded video blob");
    expect(gcsSpy).not.toHaveBeenCalled();
  });
});
