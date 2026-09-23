import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { renderReframedVideo, type RenderReframedVideoDeps } from "./render";
import type { CropTargetData } from "../app/types/editor/crop-target";

const validCropTargets: CropTargetData = {
  schema_version: 1,
  video_id: "test-video",
  source: {
    width: 1920,
    height: 1080,
    fps: 30,
    duration_sec: 10,
  },
  output: {
    aspect_ratio: "9:16",
    width: 608,
    height: 1080,
  },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 656, y: 0, width: 608, height: 1080 },
    },
    {
      timestamp_sec: 2.0,
      crop: { x: 700, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("reframe-worker/render", () => {
  let mockDownloadVideo: NonNullable<RenderReframedVideoDeps["downloadVideo"]>;
  let mockRunFfmpeg: NonNullable<RenderReframedVideoDeps["runFfmpeg"]>;
  let mockUploadToCloudinary: NonNullable<RenderReframedVideoDeps["uploadToCloudinary"]>;

  beforeEach(() => {
    mockDownloadVideo = vi.fn().mockImplementation(async (_url: string, destPath: string) => {
      fs.writeFileSync(destPath, "fake-source-content");
    });

    mockRunFfmpeg = vi.fn().mockImplementation(
      async (_input: string, outputPath: string, _cropFilter: string) => {
        fs.writeFileSync(outputPath, "fake-rendered-mp4");
      }
    );

    mockUploadToCloudinary = vi.fn().mockResolvedValue({
      secure_url: "https://res.cloudinary.com/test-cloud/video/upload/v1234/reframed_exports/out.mp4",
    });
  });

  it("successfully downloads, applies crop filter to FFmpeg, uploads to Cloudinary, and returns secure_url", async () => {
    let capturedTempDir = "";

    const secureUrl = await renderReframedVideo(
      "https://storage.googleapis.com/test-bucket/source.mp4",
      validCropTargets,
      {},
      {
        downloadVideo: mockDownloadVideo,
        runFfmpeg: vi.fn().mockImplementation(
          async (inputPath: string, outputPath: string, cropFilter: string) => {
            capturedTempDir = inputPath.substring(0, inputPath.lastIndexOf(/[/\\]/.exec(inputPath)![0]));
            expect(cropFilter).toContain("crop=");
            expect(cropFilter).toContain("exact=1");
            fs.writeFileSync(outputPath, "fake-rendered-mp4");
          }
        ),
        uploadToCloudinary: mockUploadToCloudinary,
      }
    );

    expect(secureUrl).toBe(
      "https://res.cloudinary.com/test-cloud/video/upload/v1234/reframed_exports/out.mp4"
    );
    expect(mockDownloadVideo).toHaveBeenCalledTimes(1);
    expect(mockUploadToCloudinary).toHaveBeenCalledTimes(1);

    // Verify temp files were cleaned up
    if (capturedTempDir) {
      expect(fs.existsSync(capturedTempDir)).toBe(false);
    }
  });

  it("throws clear error when videoUrl is missing", async () => {
    await expect(
      renderReframedVideo("", validCropTargets, {}, {})
    ).rejects.toThrow("missing videoUrl");
  });

  it("throws clear error when crop_targets is empty", async () => {
    const emptyTargets: CropTargetData = {
      ...validCropTargets,
      crop_targets: [],
    };

    await expect(
      renderReframedVideo("https://example.com/video.mp4", emptyTargets, {}, {})
    ).rejects.toThrow("cropTargetData contains no crop_targets");
  });

  it("propagates FFmpeg error and cleans up temp directory", async () => {
    let capturedTempDir = "";

    await expect(
      renderReframedVideo(
        "https://example.com/video.mp4",
        validCropTargets,
        {},
        {
          downloadVideo: vi.fn().mockImplementation(async (_u, dest) => {
            capturedTempDir = dest.substring(0, dest.lastIndexOf(/[/\\]/.exec(dest)![0]));
            fs.writeFileSync(dest, "source");
          }),
          runFfmpeg: vi.fn().mockRejectedValue(new Error("FFmpeg exited with code 1")),
          uploadToCloudinary: mockUploadToCloudinary,
        }
      )
    ).rejects.toThrow("FFmpeg exited with code 1");

    expect(mockUploadToCloudinary).not.toHaveBeenCalled();
    if (capturedTempDir) {
      expect(fs.existsSync(capturedTempDir)).toBe(false);
    }
  });

  it("propagates Cloudinary upload error and cleans up temp directory", async () => {
    let capturedTempDir = "";

    await expect(
      renderReframedVideo(
        "https://example.com/video.mp4",
        validCropTargets,
        {},
        {
          downloadVideo: mockDownloadVideo,
          runFfmpeg: vi.fn().mockImplementation(async (_in, out) => {
            capturedTempDir = out.substring(0, out.lastIndexOf(/[/\\]/.exec(out)![0]));
            fs.writeFileSync(out, "rendered");
          }),
          uploadToCloudinary: vi.fn().mockRejectedValue(new Error("Cloudinary rate limit")),
        }
      )
    ).rejects.toThrow("Cloudinary rate limit");

    if (capturedTempDir) {
      expect(fs.existsSync(capturedTempDir)).toBe(false);
    }
  });

  describe("AutoFlip high-density crop target rendering regression (Task-00035)", () => {
    it("successfully processes realistic 192-target AutoFlip dataset and constructs valid filter", async () => {
      // Simulate real 192-target AutoFlip payload (24 fps across 8 seconds)
      const highDensityTargets: CropTargetData = {
        schema_version: 1,
        source: { width: 404, height: 720, fps: 24, duration_sec: 8.0 },
        output: { aspect_ratio: "9:16" },
        timeline: { timebase: "seconds", sampling: "keyframes_interpolated" },
        crop_targets: Array.from({ length: 192 }, (_, i) => ({
          timestamp_sec: Number((i * 0.0417).toFixed(4)),
          frame: i,
          crop: { x: 6, y: 24, width: 392, height: 696 },
          source: "autoflip",
        })),
      };

      let passedFilter = "";
      const secureUrl = await renderReframedVideo(
        "https://res.cloudinary.com/test/video/upload/demo.mp4",
        highDensityTargets,
        {},
        {
          downloadVideo: mockDownloadVideo,
          runFfmpeg: vi.fn().mockImplementation(async (_in, out, filter) => {
            passedFilter = filter;
            fs.writeFileSync(out, "fake-rendered-mp4");
          }),
          uploadToCloudinary: mockUploadToCloudinary,
        }
      );

      expect(secureUrl).toContain("reframed_exports");
      expect(passedFilter).toContain("crop=392:696:");
      expect(passedFilter).toContain(":exact=1");
      // Must contain single quotes around x and y to be valid FFmpeg syntax
      expect(passedFilter).toContain("'min(max(");
      // Because targets are stationary, it must simplify down and not have 192 nested if conditions
      expect(passedFilter.length).toBeLessThan(1000);
    });

    it("renders valid video with real FFmpeg executing the generated filtergraph (Issue A regression)", async () => {
      import("ffmpeg-static");
      const { spawnSync } = await import("child_process");
      const ffmpegStatic = (await import("ffmpeg-static")).default;
      if (!ffmpegStatic) return;

      const { buildFfmpegCropFilter } = await import("../app/types/editor/crop-target");

      // 192 targets dataset
      const highDensityTargets = Array.from({ length: 192 }, (_, i) => ({
        timestamp_sec: Number((i * 0.0417).toFixed(4)),
        frame: i,
        crop: { x: 6, y: 24, width: 392, height: 696 },
        source: "autoflip",
      }));

      const filter = buildFfmpegCropFilter(highDensityTargets);
      expect(filter).toBeDefined();

      // Test real filtergraph initialization on synthetic 1-second video
      const res = spawnSync(
        ffmpegStatic,
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc=duration=1:size=404x720:rate=24",
          "-vf",
          filter!,
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(res.stderr).toBe("");
    });
  });
});
