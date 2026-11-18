import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CropTargetData } from "../app/types/editor/crop-target";
import type { MlInferenceRequest, JobCallbackPayload } from "./client";
import type { RenderReframedVideoOptions } from "./render";
import { processReframeJob, type ReframeJobContext } from "./orchestrator";

const sampleCropTargets: CropTargetData = {
  schema_version: 1,
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 10 },
  output: { aspect_ratio: "9:16" },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 420, y: 0, width: 608, height: 1080 },
    },
  ],
};

describe("Task-00133: Reframe Worker Face Tracking Execution-Time Consent Hardening", () => {
  let mockExecuteMl: (request: MlInferenceRequest) => Promise<CropTargetData>;
  let mockRenderVideo: (
    videoUrl: string,
    cropTargets: CropTargetData,
    options?: RenderReframedVideoOptions
  ) => Promise<string>;
  let mockSendCallback: (payload: JobCallbackPayload) => Promise<{ success: boolean }>;
  let context: ReframeJobContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteMl = vi.fn().mockResolvedValue(sampleCropTargets);
    mockRenderVideo = vi.fn().mockResolvedValue("https://res.cloudinary.com/test/reframed.mp4");
    mockSendCallback = vi.fn().mockResolvedValue({ success: true });

    context = {
      jobId: "job-ft-test",
      attemptsMade: 0,
      maxAttempts: 3,
    };
  });

  it("falls back to AutoFlip-only (enableFaceTracking: false) when consent was granted at queue time but revoked before execution", async () => {
    const mockCheckConsent = vi.fn().mockResolvedValue({ faceTrackingConsent: false });

    const result = await processReframeJob(
      {
        jobId: "job-ft-1",
        userId: "user-revoked",
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        enableFaceTracking: true, // was true in the queue payload
      },
      context,
      {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        checkConsent: mockCheckConsent,
      }
    );

    expect(mockCheckConsent).toHaveBeenCalledWith("user-revoked");
    expect(mockExecuteMl).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFaceTracking: false, // overridden to false by execution-time check
      })
    );
    expect(result.success).toBe(true);
    expect(mockSendCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-ft-1",
        status: "COMPLETED",
      })
    );
  });

  it("falls back to AutoFlip-only (enableFaceTracking: false) when consent is absent at execution time", async () => {
    const mockCheckConsent = vi.fn().mockResolvedValue({ faceTrackingConsent: false });

    const result = await processReframeJob(
      {
        jobId: "job-ft-2",
        userId: "user-unconfigured",
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        enableFaceTracking: true,
      },
      context,
      {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        checkConsent: mockCheckConsent,
      }
    );

    expect(mockCheckConsent).toHaveBeenCalledWith("user-unconfigured");
    expect(mockExecuteMl).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFaceTracking: false,
      })
    );
    expect(result.success).toBe(true);
    expect(mockSendCallback).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });

  it("fails closed to AutoFlip-only (enableFaceTracking: false) and completes ordinary reframing when database lookup fails", async () => {
    const mockCheckConsent = vi
      .fn()
      .mockRejectedValue(new Error("Database connection pool exhausted"));

    const result = await processReframeJob(
      {
        jobId: "job-ft-3",
        userId: "user-db-err",
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        enableFaceTracking: true,
      },
      context,
      {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        checkConsent: mockCheckConsent,
      }
    );

    expect(mockCheckConsent).toHaveBeenCalledWith("user-db-err");
    // Fails closed to safe AutoFlip-only pipeline
    expect(mockExecuteMl).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFaceTracking: false,
      })
    );
    // Ordinary reframing continues and completes successfully
    expect(result.success).toBe(true);
    expect(mockSendCallback).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });

  it("permits TalkNet and face-fusion (enableFaceTracking: true) when consent remains granted at execution time", async () => {
    const mockCheckConsent = vi.fn().mockResolvedValue({ faceTrackingConsent: true });

    const result = await processReframeJob(
      {
        jobId: "job-ft-4",
        userId: "user-consented",
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        enableFaceTracking: true,
      },
      context,
      {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        checkConsent: mockCheckConsent,
      }
    );

    expect(mockCheckConsent).toHaveBeenCalledWith("user-consented");
    expect(mockExecuteMl).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFaceTracking: true,
      })
    );
    expect(result.success).toBe(true);
    expect(mockSendCallback).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });

  it("continues ordinary AutoFlip-only reframing when enableFaceTracking is false without requiring face tracking", async () => {
    const mockCheckConsent = vi.fn();

    const result = await processReframeJob(
      {
        jobId: "job-ft-5",
        userId: "user-regular",
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        enableFaceTracking: false,
      },
      context,
      {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        sendCallback: mockSendCallback,
        checkConsent: mockCheckConsent,
      }
    );

    // When face tracking is not enabled in payload, no unnecessary consent check needed
    expect(mockCheckConsent).not.toHaveBeenCalled();
    expect(mockExecuteMl).toHaveBeenCalledWith(
      expect.objectContaining({
        enableFaceTracking: false,
      })
    );
    expect(result.success).toBe(true);
    expect(mockSendCallback).toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });
});
