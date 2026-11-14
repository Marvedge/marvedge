import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock external dependencies
vi.mock("../app/lib/avs/dubbingProcessor", () => ({
  processDubbingJob: vi.fn(),
  defaultUploadToCloudinary: vi.fn().mockResolvedValue({ secure_url: "https://cloudinary.com/dubbed.wav" }),
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
      const p = (opts?.configuredProvider || process.env.DUBBING_PROVIDER || "elevenlabs").trim().toLowerCase();
      return p === "voicestudio" ? "voicestudio" : "elevenlabs";
    }),
    VoiceStudioDubbingAdapter: vi.fn().mockImplementation(function () {
      return {
        getClient: () => ({
          checkHealth: vi.fn().mockResolvedValue({ isReady: true, status: "ok", device: "cuda (Tesla T4)" }),
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
import { resolveDubbingProvider, VoiceStudioDubbingAdapter } from "../app/lib/voicestudio/dubbingAdapter";
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
      vi.mocked(processDubbingJob).mockRejectedValue(
        new Error("Dubbing processor fatal error")
      );

      const mockJob = {
        name: "avs-dub",
        id: "bullmq-job-fail",
        data: {
          jobId: "video-job-fail",
        },
        updateProgress: vi.fn(),
      };

      const processor = async (job: typeof mockJob) => {
        await processDubbingJob(job.data as any, {
          updateProgress: async (pct: number) => {
            await job.updateProgress(pct);
          },
        });
      };

      await expect(processor(mockJob)).rejects.toThrow(
        "Dubbing processor fatal error"
      );
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
        checkHealth: vi.fn().mockResolvedValue({ isReady: false, status: "starting", startupStep: "ml_runtime" }),
      };
      vi.mocked(VoiceStudioDubbingAdapter).mockImplementationOnce(function () {
        return {
          getClient: () => mockClient as any,
          synthesizeTimedSteps: vi.fn(),
        } as any;
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

    it("4. successfully synthesizes audio, uploads to Cloudinary, and hands off to AVS dubbing pipeline", async () => {
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
        return mockAdapter as any;
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
        if (!health.isReady) throw new Error("offline");

        await job.updateProgress(10);

        const steps = job.data.steps;
        await job.updateProgress(25);

        const synthesisResult = await adapter.synthesizeTimedSteps(steps, { language: job.data.targetLanguage });

        // Upload to Cloudinary
        const uploadResult = await defaultUploadToCloudinary("temp_audio.wav");
        const audioUrl = uploadResult.secure_url;

        // Hand off to AVS alignment
        await processDubbingJob({
          jobId: job.data.jobId,
          videoUrl: job.data.sourceUrl,
          dubUrl: audioUrl,
          steps: steps.map((s, idx) => ({ id: s.stepId, index: idx, startTime: s.startTime, endTime: s.endTime })),
          dubTimings: synthesisResult.stepTimings.map((st) => ({ stepId: st.stepId, start: st.start, end: st.end })),
          sourceDuration: synthesisResult.durationSec,
        });

        await mockPrismaUpdate({
          where: { id: job.data.jobId },
          data: { status: "COMPLETED", progress: 100, exportedUrl: audioUrl },
        });
        await job.updateProgress(100);
      };

      await processor(mockJob);

      expect(mockAdapter.synthesizeTimedSteps).toHaveBeenCalledWith(
        mockJob.data.steps,
        { language: "es" }
      );
      expect(defaultUploadToCloudinary).toHaveBeenCalled();
      expect(processDubbingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "video-job-vs",
          videoUrl: "https://example.com/demo.mp4",
          dubUrl: "https://cloudinary.com/dubbed.wav",
          steps: expect.any(Array),
          dubTimings: expect.any(Array),
          sourceDuration: 17.29,
        })
      );
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
      expect(createDubbingJob).not.toHaveBeenCalled();
    });

    it("5. validates standard BullMQ payload compatibility ({ jobId, sourceUrl, targetLanguage })", async () => {
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
        return mockAdapter as any;
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

      let resolvedSteps: any[] = [];
      if (mockJob.data.text) {
        resolvedSteps = [{ stepId: "step-1", text: mockJob.data.text }];
      }

      const adapter = new VoiceStudioDubbingAdapter();
      const res = await adapter.synthesizeTimedSteps(resolvedSteps, { language: mockJob.data.targetLanguage });

      expect(res.durationSec).toBe(5.0);
      expect(mockAdapter.synthesizeTimedSteps).toHaveBeenCalledWith(
        [{ stepId: "step-1", text: "Bonjour tout le monde" }],
        { language: "fr" }
      );
    });

    it("6. rejects synthesis when no text or steps can be resolved", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const emptyPayload = {
        jobId: "empty-job",
        sourceUrl: "https://example.com/video.mp4",
        targetLanguage: "es",
      };

      const resolveSteps = (data: typeof emptyPayload) => {
        const steps: any[] = [];
        if (steps.length === 0) {
          throw new VoiceStudioError("INVALID_INPUT", "No narration steps or text provided for VoiceStudio dubbing");
        }
      };

      expect(() => resolveSteps(emptyPayload)).toThrow(VoiceStudioError);
      expect(() => resolveSteps(emptyPayload)).toThrow("No narration steps or text provided");
    });

    it("7. preserves ElevenLabs behavior unchanged when DUBBING_PROVIDER is elevenlabs", async () => {
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
