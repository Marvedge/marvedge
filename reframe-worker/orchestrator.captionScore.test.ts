import { describe, it, expect, vi, beforeEach } from "vitest";
process.env.CALLBACK_SECRET = process.env.CALLBACK_SECRET || "test-callback-secret";

import type { CropTargetData } from "../app/types/editor/crop-target";
import type { ReframeJobPayload } from "../app/lib/reframe/service";
import {
  processReframeJob,
  type ReframeJobContext,
} from "./orchestrator";
import type { JobCallbackPayload, MlInferenceRequest } from "./client";
import type { ClipScore } from "../cloudrun-worker/renderScore";

const sampleCropTargets: CropTargetData = {
  schema_version: 1,
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 5 },
  output: { aspect_ratio: "9:16" },
  crop_targets: [
    {
      timestamp_sec: 0,
      crop: { x: 420, y: 0, width: 608, height: 1080 },
    },
  ],
};

const sampleJobPayload: ReframeJobPayload = {
  jobId: "job-ref-caption-score-1",
  videoUrl: "https://storage.example.com/video.mp4",
  targetAspectRatio: "9:16",
  source: { width: 1920, height: 1080, fps: 30, durationSec: 5 },
};

describe("Reframe Worker Captioning & Scoring Orchestration (Task 112)", () => {
  let mockExecuteMl: any;
  let mockRenderVideo: any;
  let mockGenerateCaptions: any;
  let mockScoreVideo: any;
  let mockSendCallback: any;
  let localCache: Map<string, CropTargetData>;

  beforeEach(() => {
    mockExecuteMl = vi
      .fn<(request: MlInferenceRequest) => Promise<CropTargetData>>()
      .mockResolvedValue(sampleCropTargets);

    mockRenderVideo = vi
      .fn<(videoUrl: string, cropTargets: CropTargetData) => Promise<string>>()
      .mockResolvedValue("https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4");

    mockGenerateCaptions = vi.fn().mockResolvedValue({
      captionUrl: "http://localhost:3000/api/subtitles/file/job-ref-caption-score-1",
      captionPath: "/tmp/captions/job-ref-caption-score-1.ass",
    });

    mockScoreVideo = vi.fn().mockResolvedValue({
      durationScore: 88,
      bitrateScore: 94,
      overlapScore: 12,
    });

    mockSendCallback = vi
      .fn<(payload: JobCallbackPayload) => Promise<{ success: boolean }>>()
      .mockResolvedValue({ success: true });

    localCache = new Map<string, CropTargetData>();
  });

  it("completes reframe job with reframed video, captionUrl, and score in callback payload", async () => {
    const context: ReframeJobContext = {
      jobId: "job-ref-caption-score-1",
      attemptsMade: 0,
      maxAttempts: 3,
    };

    const result = await processReframeJob(sampleJobPayload, context, {
      executeMl: mockExecuteMl,
      renderVideo: mockRenderVideo,
      generateCaptions: mockGenerateCaptions,
      scoreVideo: mockScoreVideo,
      sendCallback: mockSendCallback,
      resultCache: localCache,
    });

    expect(result.success).toBe(true);
    expect(result.exportedUrl).toBe("https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4");
    expect(result.captionUrl).toBe("http://localhost:3000/api/subtitles/file/job-ref-caption-score-1");
    expect(result.score).toEqual({
      durationScore: 88,
      bitrateScore: 94,
      overlapScore: 12,
    });

    expect(mockRenderVideo).toHaveBeenCalledTimes(1);
    expect(mockGenerateCaptions).toHaveBeenCalledTimes(1);
    expect(mockGenerateCaptions).toHaveBeenCalledWith({
      videoUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      jobId: "job-ref-caption-score-1",
      demoId: undefined,
    });

    expect(mockScoreVideo).toHaveBeenCalledTimes(1);
    expect(mockScoreVideo).toHaveBeenCalledWith(
      "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      "/tmp/captions/job-ref-caption-score-1.ass"
    );

    expect(mockSendCallback).toHaveBeenCalledTimes(1);
    expect(mockSendCallback).toHaveBeenCalledWith({
      jobId: "job-ref-caption-score-1",
      status: "COMPLETED",
      cropTargets: sampleCropTargets,
      exportedUrl: "https://res.cloudinary.com/test-cloud/video/upload/reframed.mp4",
      captionUrl: "http://localhost:3000/api/subtitles/file/job-ref-caption-score-1",
      score: {
        durationScore: 88,
        bitrateScore: 94,
        overlapScore: 12,
      },
    });
  });

  it("retries on intermediate attempt when caption generation fails transiently without sending FAILED callback", async () => {
    mockGenerateCaptions.mockRejectedValueOnce(new Error("Deepgram network timeout"));

    const context: ReframeJobContext = {
      jobId: "job-ref-caption-score-1",
      attemptsMade: 0,
      maxAttempts: 3,
    };

    await expect(
      processReframeJob(sampleJobPayload, context, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        generateCaptions: mockGenerateCaptions,
        scoreVideo: mockScoreVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      })
    ).rejects.toThrow("Deepgram network timeout");

    expect(mockSendCallback).not.toHaveBeenCalled();
  });

  it("sends FAILED callback on final attempt when caption generation fails permanently", async () => {
    mockGenerateCaptions.mockRejectedValueOnce(new Error("Deepgram quota exhausted"));

    const context: ReframeJobContext = {
      jobId: "job-ref-caption-score-1",
      attemptsMade: 2,
      maxAttempts: 3,
    };

    await expect(
      processReframeJob(sampleJobPayload, context, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        generateCaptions: mockGenerateCaptions,
        scoreVideo: mockScoreVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      })
    ).rejects.toThrow("Deepgram quota exhausted");

    expect(mockSendCallback).toHaveBeenCalledTimes(1);
    expect(mockSendCallback).toHaveBeenCalledWith({
      jobId: "job-ref-caption-score-1",
      status: "FAILED",
      error: "Caption/scoring failed: Deepgram quota exhausted",
    });
  });

  it("sends FAILED callback on final attempt when scoring fails permanently", async () => {
    mockScoreVideo.mockRejectedValueOnce(new Error("FFprobe decoding failed"));

    const context: ReframeJobContext = {
      jobId: "job-ref-caption-score-1",
      attemptsMade: 2,
      maxAttempts: 3,
    };

    await expect(
      processReframeJob(sampleJobPayload, context, {
        executeMl: mockExecuteMl,
        renderVideo: mockRenderVideo,
        generateCaptions: mockGenerateCaptions,
        scoreVideo: mockScoreVideo,
        sendCallback: mockSendCallback,
        resultCache: localCache,
      })
    ).rejects.toThrow("FFprobe decoding failed");

    expect(mockSendCallback).toHaveBeenCalledTimes(1);
    expect(mockSendCallback).toHaveBeenCalledWith({
      jobId: "job-ref-caption-score-1",
      status: "FAILED",
      error: "Caption/scoring failed: FFprobe decoding failed",
    });
  });
});

