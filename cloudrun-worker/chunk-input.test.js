import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { prepareChunkInput } = require("./chunk-input.cjs");

describe("Cloud Run chunk input security", () => {
  it("downloads an HTTP source through the hardened URL downloader", async () => {
    const downloadFromGsUri = vi.fn();
    const downloadFromUrl = vi.fn().mockResolvedValue(undefined);

    const handled = await prepareChunkInput({
      videoUrl: "https://media.example.com/video.mp4",
      destinationPath: "/tmp/input.webm",
      downloadFromGsUri,
      downloadFromUrl,
    });

    expect(handled).toBe(true);
    expect(downloadFromUrl).toHaveBeenCalledWith({
      url: "https://media.example.com/video.mp4",
      destinationPath: "/tmp/input.webm",
    });
    expect(downloadFromGsUri).not.toHaveBeenCalled();
  });

  it("downloads a GCS source through the GCS downloader", async () => {
    const downloadFromGsUri = vi.fn().mockResolvedValue(undefined);
    const downloadFromUrl = vi.fn();

    const handled = await prepareChunkInput({
      videoUrl: "gs://raw-bucket/source/video.mp4",
      destinationPath: "/tmp/input.webm",
      downloadFromGsUri,
      downloadFromUrl,
    });

    expect(handled).toBe(true);
    expect(downloadFromGsUri).toHaveBeenCalledWith({
      uri: "gs://raw-bucket/source/video.mp4",
      destinationPath: "/tmp/input.webm",
    });
    expect(downloadFromUrl).not.toHaveBeenCalled();
  });

  it("allows the caller to use its raw-object fallback when videoUrl is absent", async () => {
    const downloadFromGsUri = vi.fn();
    const downloadFromUrl = vi.fn();

    const handled = await prepareChunkInput({
      videoUrl: undefined,
      destinationPath: "/tmp/input.webm",
      downloadFromGsUri,
      downloadFromUrl,
    });

    expect(handled).toBe(false);
    expect(downloadFromGsUri).not.toHaveBeenCalled();
    expect(downloadFromUrl).not.toHaveBeenCalled();
  });

  it("propagates a hardened-downloader rejection without invoking FFmpeg", async () => {
    const downloadFromGsUri = vi.fn();
    const downloadFromUrl = vi
      .fn()
      .mockRejectedValue(new Error("Refusing to fetch private address"));

    await expect(
      prepareChunkInput({
        videoUrl: "https://redirect.example.com/video.mp4",
        destinationPath: "/tmp/input.webm",
        downloadFromGsUri,
        downloadFromUrl,
      })
    ).rejects.toThrow("Refusing to fetch private address");

    expect(downloadFromGsUri).not.toHaveBeenCalled();
  });
});
