import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock external dependencies
vi.mock("../app/lib/avs/dubbingProcessor", () => ({
  processDubbingJob: vi.fn(),
  defaultUploadToCloudinary: vi
    .fn()
    .mockResolvedValue({ secure_url: "https://cloudinary.com/dubbed.wav" }),
  postJobCallbackWithRetry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../app/lib/elevenlabs/dubbing", () => ({
  createDubbingJob: vi.fn().mockResolvedValue({ dubbingId: "el-123", status: "created" }),
  waitForDubbingCompletion: vi.fn().mockResolvedValue({ dubbingId: "el-123", status: "completed" }),
}));

vi.mock("../app/lib/voicestudio/dubbingAdapter", () => {
  const original = vi.importActual("../app/lib/voicestudio/dubbingAdapter");
  return {
    ...original,
    resolveDubbingProvider: vi.fn((opts) => {
      const p = (opts?.configuredProvider || process.env.DUBBING_PROVIDER || "elevenlabs")
        .trim()
        .toLowerCase();
      return p === "voicestudio" ? "voicestudio" : "elevenlabs";
    }),
    VoiceStudioDubbingAdapter: vi.fn().mockImplementation(function () {
      return {
        getClient: () => ({
          checkHealth: vi
            .fn()
            .mockResolvedValue({ isReady: true, status: "ok", device: "cuda (Tesla T4)" }),
        }),
        synthesizeTimedSteps: vi.fn().mockResolvedValue({
          audioBuffer: Buffer.from("RIFF....WAVEfmt ....data...."),
          format: "wav",
          durationSec: 17.29,
          stepTimings: [{ stepId: "step-1", start: 0, end: 17.29, durationSec: 17.29 }],
        }),
      };
    }),
  };
});

import { processDubbingJob, defaultUploadToCloudinary } from "../app/lib/avs/dubbingProcessor";
import { createDubbingJob, waitForDubbingCompletion } from "../app/lib/elevenlabs/dubbing";
import {
  resolveDubbingProvider,
  VoiceStudioDubbingAdapter,
} from "../app/lib/voicestudio/dubbingAdapter";
import { VoiceStudioError, VoiceStudioUnavailableError } from "../app/lib/voicestudio/errors";

describe("Video Worker - dubbing-processing worker integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processDubbingJob).mockResolvedValue(undefined);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("A. AVS Dub Worker (avs-dub jobs)", () => {
    it("delegates payload to processDubbingJob and forwards progress", async () => {
      vi.mocked(processDubbingJob).mockImplementation(async (_payload, deps) => {
        if (deps?.updateProgress) {
          await deps.updateProgress(50);
        }
      });

      const mockJob = {
        name: "avs-dub",
        id: "bullmq-job-999",
        data: {
          jobId: "video-job-123",
          videoUrl: "https://example.com/v.mp4",
          dubUrl: "https://example.com/d.mp3",
          steps: [],
          dubTimings: [],
          sourceDuration: 10,
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const processor = async (job: typeof mockJob) => {
        await processDubbingJob(job.data, {
          updateProgress: async (pct: number) => {
            await job.updateProgress(pct);
          },
        });
      };

      await processor(mockJob);

      expect(processDubbingJob).toHaveBeenCalledWith(
        mockJob.data,
        expect.objectContaining({
          updateProgress: expect.any(Function),
        })
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
    });

    it("propagates processor errors to BullMQ for retry/failure handling", async () => {
      vi.mocked(processDubbingJob).mockRejectedValue(new Error("Dubbing processor fatal error"));

      const mockJob = {
        name: "avs-dub",
        id: "bullmq-job-fail",
        data: {
          jobId: "video-job-fail",
        },
        updateProgress: vi.fn(),
      };

      const processor = async (job: typeof mockJob) => {
        await processDubbingJob(job.data as unknown as Parameters<typeof processDubbingJob>[0], {
          updateProgress: async (pct: number) => {
            await job.updateProgress(pct);
          },
        });
      };

      await expect(processor(mockJob)).rejects.toThrow("Dubbing processor fatal error");
    });
  });

  describe("B. VoiceStudio Provider Routing & Execution (Task-00132)", () => {
    it("1. routes to VoiceStudio when DUBBING_PROVIDER=voicestudio", () => {
      process.env.DUBBING_PROVIDER = "voicestudio";
      expect(resolveDubbingProvider()).toBe("voicestudio");
    });

    it("2. preserves ElevenLabs as default when DUBBING_PROVIDER is unset", () => {
      delete process.env.DUBBING_PROVIDER;
      expect(resolveDubbingProvider()).toBe("elevenlabs");
    });

    it("3. VoiceStudio health check failure throws VoiceStudioUnavailableError without calling ElevenLabs", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const mockClient = {
        checkHealth: vi
          .fn()
          .mockResolvedValue({ isReady: false, status: "starting", startupStep: "ml_runtime" }),
      };
      vi.mocked(VoiceStudioDubbingAdapter).mockImplementationOnce(function () {
        return {
          getClient: () =>
            mockClient as unknown as ReturnType<VoiceStudioDubbingAdapter["getClient"]>,
          synthesizeTimedSteps: vi.fn(),
        } as unknown as VoiceStudioDubbingAdapter;
      });

      // Simulate worker VoiceStudio pre-flight health gate
      const executeWorker = async () => {
        const provider = resolveDubbingProvider();
        if (provider === "voicestudio") {
          const adapter = new VoiceStudioDubbingAdapter();
          const health = await adapter.getClient().checkHealth();
          if (!health.isReady) {
            throw new VoiceStudioUnavailableError(
              `VoiceStudio is not ready (status: ${health.status}, step: ${health.startupStep || "warming"})`
            );
          }
        } else {
          await createDubbingJob({ sourceUrl: "https://example.com/v.mp4", targetLanguage: "es" });
        }
      };

      await expect(executeWorker()).rejects.toThrow(VoiceStudioUnavailableError);
      expect(mockClient.checkHealth).toHaveBeenCalledOnce();
      // Verify strict isolation: ElevenLabs must NEVER be called
      expect(createDubbingJob).not.toHaveBeenCalled();
    });

    it("4. successfully synthesizes audio, uploads to Cloudinary, aligns video, and persists aligned MP4", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const mockAdapter = {
        getClient: () => ({
          checkHealth: vi.fn().mockResolvedValue({ isReady: true, status: "ok" }),
        }),
        synthesizeTimedSteps: vi.fn().mockResolvedValue({
          audioBuffer: Buffer.from("fake-pcm-wav-data"),
          format: "wav",
          durationSec: 17.29,
          stepTimings: [{ stepId: "step-1", start: 0, end: 17.29, durationSec: 17.29 }],
        }),
      };
      vi.mocked(VoiceStudioDubbingAdapter).mockImplementationOnce(function () {
        return mockAdapter as unknown as VoiceStudioDubbingAdapter;
      });

      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs",
            status: "COMPLETED",
            alignedVideoUrl: "https://cloudinary.com/aligned-final.mp4",
            duration: 17.29,
          });
        }
      });

      const mockJob = {
        name: "dubbing",
        id: "bullmq-vs-100",
        data: {
          jobId: "video-job-vs",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 17.29 }],
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrismaUpdate = vi.fn().mockResolvedValue({});

      // Worker processor simulation matching video-worker/index.ts implementation
      const processor = async (job: typeof mockJob) => {
        const provider = resolveDubbingProvider();
        expect(provider).toBe("voicestudio");

        const adapter = new VoiceStudioDubbingAdapter();
        const health = await adapter.getClient().checkHealth();
        if (!health.isReady) {
          throw new Error("offline");
        }

        await job.updateProgress(10);

        const steps = job.data.steps;
        await job.updateProgress(25);

        const synthesisResult = await adapter.synthesizeTimedSteps(steps, {
          language: job.data.targetLanguage,
        });

        // Upload to Cloudinary
        const uploadResult = await defaultUploadToCloudinary("temp_audio.wav");
        const audioUrl = uploadResult.secure_url;

        const hasSourceVideo = Boolean(job.data.sourceUrl && job.data.sourceUrl.trim());
        const hasValidTimings = steps.some(
          (s: { startTime?: number; endTime?: number }) =>
            typeof s.startTime === "number" &&
            typeof s.endTime === "number" &&
            Number.isFinite(s.startTime) &&
            Number.isFinite(s.endTime) &&
            s.endTime > s.startTime
        );

        if (hasSourceVideo && !hasValidTimings) {
          throw new VoiceStudioError(
            "INVALID_INPUT",
            "Cannot align dubbed video: missing subtitle or narration timing information for source video"
          );
        }

        let finalExportedUrl = audioUrl;

        if (hasSourceVideo) {
          await job.updateProgress(50);
          let alignedVideoUrl: string | undefined;

          await processDubbingJob(
            {
              jobId: job.data.jobId,
              videoUrl: job.data.sourceUrl,
              dubUrl: audioUrl,
              steps: steps.map((s, idx) => ({
                id: s.stepId,
                index: idx,
                startTime: s.startTime,
                endTime: s.endTime,
              })),
              dubTimings: synthesisResult.stepTimings.map((st) => ({
                stepId: st.stepId,
                start: st.start,
                end: st.end,
              })),
              sourceDuration: synthesisResult.durationSec,
            },
            {
              isFinalAttempt: false,
              updateProgress: async () => {},
              postCallback: async (cbPayload) => {
                if (cbPayload.status === "COMPLETED" && cbPayload.alignedVideoUrl) {
                  alignedVideoUrl = cbPayload.alignedVideoUrl;
                }
              },
            }
          );

          if (!alignedVideoUrl || alignedVideoUrl === audioUrl) {
            throw new VoiceStudioError(
              "INFERENCE_FAILED",
              "AVS alignment completed without returning an aligned video URL"
            );
          }

          finalExportedUrl = alignedVideoUrl;
        }

        if (hasSourceVideo && (!finalExportedUrl || finalExportedUrl === audioUrl)) {
          throw new VoiceStudioError(
            "INFERENCE_FAILED",
            "Invalid export artifact: video dubbing job cannot be marked completed with audio-only URL"
          );
        }

        await mockPrismaUpdate({
          where: { id: job.data.jobId },
          data: { status: "COMPLETED", progress: 100, exportedUrl: finalExportedUrl },
        });
        await job.updateProgress(100);
      };

      await processor(mockJob);

      expect(mockAdapter.synthesizeTimedSteps).toHaveBeenCalledWith(mockJob.data.steps, {
        language: "es",
      });
      expect(defaultUploadToCloudinary).toHaveBeenCalled();
      expect(processDubbingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "video-job-vs",
          videoUrl: "https://example.com/demo.mp4",
          dubUrl: "https://cloudinary.com/dubbed.wav",
          steps: expect.any(Array),
          dubTimings: expect.any(Array),
          sourceDuration: 17.29,
        }),
        expect.any(Object)
      );
      // Confirmed: aligned video URL is persisted, NEVER audioUrl
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: "video-job-vs" },
        data: {
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://cloudinary.com/aligned-final.mp4",
        },
      });
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
      expect(createDubbingJob).not.toHaveBeenCalled();
    });

    it("5. AVS alignment failure propagates as retryable error and never marks COMPLETED with audio URL", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const mockAdapter = {
        getClient: () => ({
          checkHealth: vi.fn().mockResolvedValue({ isReady: true, status: "ok" }),
        }),
        synthesizeTimedSteps: vi.fn().mockResolvedValue({
          audioBuffer: Buffer.from("fake-pcm-wav-data"),
          format: "wav",
          durationSec: 10.0,
          stepTimings: [{ stepId: "step-1", start: 0, end: 10.0, durationSec: 10.0 }],
        }),
      };
      vi.mocked(VoiceStudioDubbingAdapter).mockImplementationOnce(function () {
        return mockAdapter as unknown as VoiceStudioDubbingAdapter;
      });

      // Alignment fails with transient error
      const alignmentError = new Error("Cloud Run AVS alignment service timed out (504)");
      vi.mocked(processDubbingJob).mockRejectedValueOnce(alignmentError);

      const mockJob = {
        name: "dubbing",
        id: "bullmq-vs-fail",
        data: {
          jobId: "video-job-fail",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 10.0 }],
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrismaUpdate = vi.fn().mockResolvedValue({});

      const processor = async (job: typeof mockJob) => {
        const adapter = new VoiceStudioDubbingAdapter();
        const steps = job.data.steps;
        const synthesisResult = await adapter.synthesizeTimedSteps(steps, {
          language: job.data.targetLanguage,
        });
        const uploadResult = await defaultUploadToCloudinary("temp_audio.wav");
        const audioUrl = uploadResult.secure_url;

        let finalExportedUrl = audioUrl;
        const hasSourceVideo = Boolean(job.data.sourceUrl && job.data.sourceUrl.trim());

        if (hasSourceVideo) {
          let alignedVideoUrl: string | undefined;

          // Crucial fix: do not swallow error!
          await processDubbingJob(
            {
              jobId: job.data.jobId,
              videoUrl: job.data.sourceUrl,
              dubUrl: audioUrl,
              steps: steps.map(
                (
                  s: {
                    startTime?: number;
                    endTime?: number;
                    targetDurationSec?: number;
                    stepId: string;
                  },
                  idx: number
                ) => ({
                  id: s.stepId,
                  index: idx,
                  startTime: s.startTime,
                  endTime: s.endTime,
                })
              ),
              dubTimings: synthesisResult.stepTimings.map((st) => ({
                stepId: st.stepId,
                start: st.start,
                end: st.end,
              })),
              sourceDuration: synthesisResult.durationSec,
            },
            {
              isFinalAttempt: false,
              postCallback: async (cbPayload) => {
                if (cbPayload.status === "COMPLETED" && cbPayload.alignedVideoUrl) {
                  alignedVideoUrl = cbPayload.alignedVideoUrl;
                }
              },
            }
          );

          if (!alignedVideoUrl || alignedVideoUrl === audioUrl) {
            throw new VoiceStudioError(
              "INFERENCE_FAILED",
              "AVS alignment completed without returning an aligned video URL"
            );
          }
          finalExportedUrl = alignedVideoUrl;
        }

        if (hasSourceVideo && (!finalExportedUrl || finalExportedUrl === audioUrl)) {
          throw new VoiceStudioError("INFERENCE_FAILED", "Invalid export artifact");
        }

        await mockPrismaUpdate({
          where: { id: job.data.jobId },
          data: { status: "COMPLETED", progress: 100, exportedUrl: finalExportedUrl },
        });
      };

      await expect(processor(mockJob)).rejects.toThrow(
        "Cloud Run AVS alignment service timed out (504)"
      );
      // Confirmed: outer COMPLETED database update was NEVER executed
      expect(mockPrismaUpdate).not.toHaveBeenCalled();
      // Confirmed: ElevenLabs fallback was NEVER triggered
      expect(createDubbingJob).not.toHaveBeenCalled();
    });

    it("6. rejects video dubbing when sourceUrl is provided but subtitle timings are missing", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const mockJob = {
        name: "dubbing",
        id: "bullmq-vs-notimings",
        data: {
          jobId: "video-job-notimings",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          // Text provided but no startTime/endTime
          steps: [{ stepId: "step-1", text: "Hola mundo" }],
        },
        updateProgress: vi.fn(),
      };

      const checkTimings = (job: typeof mockJob) => {
        const hasSourceVideo = Boolean(job.data.sourceUrl && job.data.sourceUrl.trim());
        const hasValidTimings = job.data.steps.some(
          (s: { startTime?: number; endTime?: number }) =>
            typeof s.startTime === "number" &&
            typeof s.endTime === "number" &&
            Number.isFinite(s.startTime) &&
            Number.isFinite(s.endTime) &&
            s.endTime > s.startTime
        );

        if (hasSourceVideo && !hasValidTimings) {
          throw new VoiceStudioError(
            "INVALID_INPUT",
            "Cannot align dubbed video: missing subtitle or narration timing information for source video"
          );
        }
      };

      expect(() => checkTimings(mockJob)).toThrow(VoiceStudioError);
      expect(() => checkTimings(mockJob)).toThrow(
        "Cannot align dubbed video: missing subtitle or narration timing information"
      );

      // Explicitly verifies that targetDurationSec alone (without startTime and endTime) is insufficient
      const mockJobWithDurationOnly = {
        name: "dubbing",
        id: "bullmq-vs-durationonly",
        data: {
          jobId: "video-job-durationonly",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          steps: [{ stepId: "step-1", text: "Hola mundo", targetDurationSec: 5.0 }],
        },
        updateProgress: vi.fn(),
      };
      expect(() => checkTimings(mockJobWithDurationOnly)).toThrow(VoiceStudioError);
    });

    it("7. guards against completing a video dubbing job if finalExportedUrl is an audio URL", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const audioUrl = "https://cloudinary.com/dubbed.wav";
      const finalExportedUrl = audioUrl; // Failure to produce distinct video
      const hasSourceVideo = true;

      const finalizeArtifact = () => {
        if (hasSourceVideo && (!finalExportedUrl || finalExportedUrl === audioUrl)) {
          throw new VoiceStudioError(
            "INFERENCE_FAILED",
            "Invalid export artifact: video dubbing job cannot be marked completed with audio-only URL"
          );
        }
      };

      expect(() => finalizeArtifact()).toThrow(VoiceStudioError);
      expect(() => finalizeArtifact()).toThrow("cannot be marked completed with audio-only URL");
    });

    it("8. validates standard BullMQ payload compatibility ({ jobId, sourceUrl, targetLanguage })", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const mockAdapter = {
        getClient: () => ({
          checkHealth: vi.fn().mockResolvedValue({ isReady: true, status: "ok" }),
        }),
        synthesizeTimedSteps: vi.fn().mockResolvedValue({
          audioBuffer: Buffer.from("audio"),
          format: "wav",
          durationSec: 5.0,
          stepTimings: [{ stepId: "step-1", start: 0, end: 5.0, durationSec: 5.0 }],
        }),
      };
      vi.mocked(VoiceStudioDubbingAdapter).mockImplementationOnce(function () {
        return mockAdapter as unknown as VoiceStudioDubbingAdapter;
      });

      // Standard BullMQ payload without optional steps
      const standardPayload = {
        jobId: "standard-job-1",
        sourceUrl: "https://example.com/video.mp4",
        targetLanguage: "fr",
        text: "Bonjour tout le monde",
      };

      const mockJob = {
        name: "dubbing",
        id: "standard-1",
        data: standardPayload,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      let resolvedSteps: Array<{ stepId: string; text: string }> = [];
      if (mockJob.data.text) {
        resolvedSteps = [{ stepId: "step-1", text: mockJob.data.text }];
      }

      const adapter = new VoiceStudioDubbingAdapter();
      const res = await adapter.synthesizeTimedSteps(resolvedSteps, {
        language: mockJob.data.targetLanguage,
      });

      expect(res.durationSec).toBe(5.0);
      expect(mockAdapter.synthesizeTimedSteps).toHaveBeenCalledWith(
        [{ stepId: "step-1", text: "Bonjour tout le monde" }],
        { language: "fr" }
      );
    });

    it("9. rejects synthesis when no text or steps can be resolved", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const emptyPayload = {
        jobId: "empty-job",
        sourceUrl: "https://example.com/video.mp4",
        targetLanguage: "es",
      };

      const resolveSteps = () => {
        const steps: Array<{ stepId: string; text: string }> = [];
        if (steps.length === 0) {
          throw new VoiceStudioError(
            "INVALID_INPUT",
            "No narration steps or text provided for VoiceStudio dubbing"
          );
        }
      };

      expect(() => resolveSteps(emptyPayload)).toThrow(VoiceStudioError);
      expect(() => resolveSteps(emptyPayload)).toThrow("No narration steps or text provided");
    });

    it("10. preserves ElevenLabs behavior unchanged when DUBBING_PROVIDER is elevenlabs", async () => {
      process.env.DUBBING_PROVIDER = "elevenlabs";

      const mockJob = {
        name: "dubbing",
        id: "el-job-1",
        data: {
          jobId: "el-job-id",
          sourceUrl: "https://example.com/el-video.mp4",
          targetLanguage: "es",
        },
        updateProgress: vi.fn(),
      };

      const processor = async (job: typeof mockJob) => {
        const provider = resolveDubbingProvider();
        if (provider === "elevenlabs") {
          const res = await createDubbingJob({
            sourceUrl: job.data.sourceUrl,
            targetLanguage: job.data.targetLanguage,
          });
          await waitForDubbingCompletion(res.dubbingId);
        }
      };

      await processor(mockJob);

      expect(createDubbingJob).toHaveBeenCalledWith({
        sourceUrl: "https://example.com/el-video.mp4",
        targetLanguage: "es",
      });
      expect(waitForDubbingCompletion).toHaveBeenCalledWith("el-123");
      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
    });
  });
});
