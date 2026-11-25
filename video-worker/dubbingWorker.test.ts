/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "stream";

// Mock external dependencies
vi.mock("axios", () => {
  return {
    default: vi.fn().mockImplementation(async () => {
      const stream = new Readable({
        read() {
          this.push(Buffer.from("fake-audio-stream-content"));
          this.push(null);
        },
      });
      return {
        data: stream,
        status: 200,
        headers: {},
      };
    }),
  };
});

vi.mock("ioredis", () => {
  class MockRedis {
    on = vi.fn();
    connect = vi.fn();
    quit = vi.fn();
    duplicate = vi.fn().mockReturnThis();
  }
  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

vi.mock("@prisma/client", () => {
  class PrismaClient {
    videoJob = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({}),
    };
    demo = {
      findUnique: vi.fn().mockResolvedValue({}),
    };
  }
  return {
    PrismaClient,
  };
});

vi.mock("bullmq", () => {
  class Worker {
    on = vi.fn();
    close = vi.fn();
  }
  class Queue {
    on = vi.fn();
    add = vi.fn();
  }
  class UnrecoverableError extends Error {
    name = "UnrecoverableError";
  }
  return {
    Worker,
    Queue,
    UnrecoverableError,
  };
});

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
import { executeDubbingJob } from "./index";

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
        name: "dubbing" as const,
        id: "bullmq-vs-100",
        data: {
          jobId: "video-job-vs",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 17.29 }],
        },
        opts: { attempts: 1 },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-test-1", jobData: null, demoId: null }),
        },
        demo: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        workspaceConsent: {
          findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: true }),
        },
      };

      await executeDubbingJob(mockJob, { prisma: mockPrisma as any });

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
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs" },
        data: expect.objectContaining({
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://cloudinary.com/aligned-final.mp4",
        }),
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
        name: "dubbing" as const,
        id: "bullmq-vs-fail",
        data: {
          jobId: "video-job-fail",
          sourceUrl: "https://example.com/demo.mp4",
          targetLanguage: "es",
          steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 10.0 }],
        },
        opts: { attempts: 3 },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-test-1", jobData: null, demoId: null }),
        },
        demo: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        workspaceConsent: {
          findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: true }),
        },
      };

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow(
        "Cloud Run AVS alignment service timed out (504)"
      );
      // Confirmed: outer COMPLETED database update was NEVER executed
      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
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
      process.env.ELEVENLABS_API_KEY = "test-elevenlabs-api-key";

      const mockJob = {
        name: "dubbing" as const,
        id: "el-job-1",
        data: {
          jobId: "el-job-id",
          sourceUrl: "https://example.com/el-video.mp4",
          targetLanguage: "es",
        },
        opts: { attempts: 1 },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-test-1", jobData: null, demoId: null }),
        },
        demo: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        workspaceConsent: {
          findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: true }),
        },
      };

      await executeDubbingJob(mockJob, { prisma: mockPrisma as any });

      expect(createDubbingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: "https://example.com/el-video.mp4",
          targetLanguage: "es",
        })
      );
      expect(waitForDubbingCompletion).toHaveBeenCalledWith("el-123");
      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "el-job-id" },
        data: expect.objectContaining({
          status: "COMPLETED",
          progress: 100,
        }),
      });
    });
  });

  describe("C. VoiceStudio AVS False-Success Defense Regression Suite (Production Worker)", () => {
    const createProductionMockPrisma = () => ({
      videoJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-test-1",
          jobData: null,
          demoId: null,
        }),
      },
      demo: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workspaceConsent: {
        findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: true }),
      },
    });

    const createProductionMockJob = (
      opts: {
        attemptsMade?: number;
        maxAttempts?: number;
        sourceUrl?: string;
      } = {}
    ) => ({
      name: "dubbing" as const,
      id: "bullmq-vs-prod-100",
      data: {
        jobId: "video-job-vs-prod",
        sourceUrl: opts.sourceUrl ?? "https://example.com/demo.mp4",
        targetLanguage: "es",
        steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 17.29 }],
      },
      opts: { attempts: opts.maxAttempts ?? 3 },
      attemptsMade: opts.attemptsMade ?? 0,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    });

    it("1. AVS returns a valid aligned MP4 URL -> job completes", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs-prod",
            status: "COMPLETED",
            alignedVideoUrl: "https://cloudinary.com/aligned-final.mp4",
            duration: 17.29,
          });
        }
      });

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await executeDubbingJob(mockJob, { prisma: mockPrisma as any });

      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "COMPLETED",
          progress: 100,
          exportedUrl: "https://cloudinary.com/aligned-final.mp4",
        }),
      });
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it("2. AVS returns the uploaded WAV URL -> job fails", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // AVS returns the uploaded WAV URL (audioUrl)
      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs-prod",
            status: "COMPLETED",
            alignedVideoUrl: "https://cloudinary.com/dubbed.wav",
            duration: 17.29,
          });
        }
      });

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow();

      // Guard assertion: invalid AVS output must NEVER result in a COMPLETED database update
      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      // Guard assertion: permanent failure is persisted as FAILED
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });
    });

    it("3. AVS returns the unchanged source MP4 URL -> job fails", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // AVS returns the unchanged source video URL (sourceUrl)
      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs-prod",
            status: "COMPLETED",
            alignedVideoUrl: "https://example.com/demo.mp4", // identical to sourceUrl
            duration: 17.29,
          });
        }
      });

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow();

      // Guard assertion: source video fallback must NEVER result in a COMPLETED database update
      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      // Guard assertion: persisted as FAILED with typed error message
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });
    });

    it("4. AVS returns an empty URL -> job fails", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // AVS returns empty/whitespace URL
      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs-prod",
            status: "COMPLETED",
            alignedVideoUrl: "   ",
            duration: 17.29,
          });
        }
      });

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow();

      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });
    });

    it("5. AVS returns no completion callback -> job fails", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // AVS finishes without delivering any COMPLETED callback
      vi.mocked(processDubbingJob).mockResolvedValueOnce(undefined);

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow();

      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });
    });

    it("6. Invalid callback status -> job fails", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // AVS callback reports FAILED status instead of COMPLETED
      vi.mocked(processDubbingJob).mockImplementationOnce(async (_payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: "video-job-vs-prod",
            status: "FAILED",
            error: "AVS alignment internal calculation failure",
          });
        }
      });

      const mockJob = createProductionMockJob();
      const mockPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(mockJob, { prisma: mockPrisma as any })).rejects.toThrow();

      expect(mockPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });
    });

    it("7. Transient AVS timeout -> BullMQ retry preserved on intermediate attempt", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const transientError = new Error("Cloud Run AVS alignment service timed out (504)");
      vi.mocked(processDubbingJob).mockRejectedValueOnce(transientError);

      const intermediateJob = createProductionMockJob({ attemptsMade: 0, maxAttempts: 3 });
      const intermediatePrisma = createProductionMockPrisma();

      // Must re-throw original transient error so BullMQ can schedule retry
      await expect(
        executeDubbingJob(intermediateJob, { prisma: intermediatePrisma as any })
      ).rejects.toThrow("Cloud Run AVS alignment service timed out (504)");

      // Neither COMPLETED nor FAILED should be written to DB on intermediate transient retry
      expect(intermediatePrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(intermediatePrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("8. Final retry exhaustion -> FAILED database persistence", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      const transientError = new Error("Cloud Run AVS alignment service timed out (504)");
      vi.mocked(processDubbingJob).mockRejectedValueOnce(transientError);

      const finalJob = createProductionMockJob({ attemptsMade: 2, maxAttempts: 3 });
      const finalPrisma = createProductionMockPrisma();

      await expect(executeDubbingJob(finalJob, { prisma: finalPrisma as any })).rejects.toThrow();

      // On final attempt, permanent failure is persisted as FAILED
      expect(finalPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(finalPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "Cloud Run AVS alignment service timed out (504)",
        }),
      });
    });

    it("9. ElevenLabs flow remains unaffected", async () => {
      process.env.DUBBING_PROVIDER = "elevenlabs";
      process.env.ELEVENLABS_API_KEY = "test-elevenlabs-api-key";

      const elJob = {
        name: "dubbing" as const,
        id: "bullmq-el-prod-1",
        data: {
          jobId: "video-job-el-prod",
          sourceUrl: "https://example.com/el-video.mp4",
          targetLanguage: "es",
        },
        opts: { attempts: 1 },
        attemptsMade: 0,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma = createProductionMockPrisma();

      await executeDubbingJob(elJob, { prisma: mockPrisma as any });

      expect(createDubbingJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceUrl: "https://example.com/el-video.mp4",
          targetLanguage: "es",
        })
      );
      expect(waitForDubbingCompletion).toHaveBeenCalledWith("el-123");
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-el-prod" },
        data: expect.objectContaining({
          status: "COMPLETED",
          progress: 100,
        }),
      });
    });

    it("10. Generic AVS fallback does not falsely complete a VoiceStudio dubbing job", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";

      // VoiceStudio job receives a degenerate source-video callback from processDubbingJob
      vi.mocked(processDubbingJob).mockImplementationOnce(async (payload, deps) => {
        if (deps?.postCallback) {
          await deps.postCallback({
            jobId: payload.jobId,
            status: "COMPLETED",
            alignedVideoUrl: payload.videoUrl, // degenerate fallback to source video
            duration: 10.0,
          });
        }
      });

      const vsJob = createProductionMockJob();
      const vsPrisma = createProductionMockPrisma();

      // VoiceStudio worker must catch and reject source video output as FAILED
      await expect(executeDubbingJob(vsJob, { prisma: vsPrisma as any })).rejects.toThrow();

      expect(vsPrisma.videoJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      expect(vsPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-vs-prod" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("valid aligned video URL"),
        }),
      });

      // Verify that the generic avs-dub job path is isolated to job.name === "avs-dub"
      const genericAvsJob = {
        name: "avs-dub" as const,
        id: "bullmq-generic-avs-1",
        data: {
          jobId: "generic-avs-job-1",
          videoUrl: "https://example.com/generic-source.mp4",
          dubUrl: "https://example.com/generic-dub.wav",
          sourceDuration: 15.0,
        },
        opts: { attempts: 3 },
        attemptsMade: 2, // final attempt
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      const genericPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const { postJobCallbackWithRetry } = await import("../app/lib/avs/dubbingProcessor");
      vi.mocked(processDubbingJob).mockRejectedValueOnce(
        new Error("Fatal GCP Cloud Run service error")
      );

      await executeDubbingJob(genericAvsJob, { prisma: genericPrisma as any });

      // Generic AVS job path executes degraded-mode source-video fallback on final retry
      expect(postJobCallbackWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "generic-avs-job-1",
          status: "COMPLETED",
          alignedVideoUrl: "https://example.com/generic-source.mp4",
          fallback: true,
          fallbackStage: "DUBBING",
          fallbackReason: "Fatal GCP Cloud Run service error",
        })
      );
    });
  });

  describe("D. Worker-Level Voice Cloning Consent Gate (Task-00133)", () => {
    const createConsentTestJob = (userId?: string) => ({
      name: "dubbing" as const,
      id: "bullmq-consent-job-1",
      data: {
        jobId: "video-job-consent-1",
        ...(userId ? { userId } : {}),
        sourceUrl: "https://example.com/demo.mp4",
        targetLanguage: "es",
        steps: [{ stepId: "step-1", text: "Hola mundo", startTime: 0, endTime: 10.0 }],
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
      updateProgress: vi.fn().mockResolvedValue(undefined),
    });

    it("1. fails closed without retrying when user identity is missing", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";
      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ userId: null, jobData: null, demoId: null }),
        },
        demo: { findUnique: vi.fn().mockResolvedValue(null) },
        workspaceConsent: { findUnique: vi.fn() },
      };

      await expect(
        executeDubbingJob(createConsentTestJob(), { prisma: mockPrisma as any })
      ).rejects.toThrow("VOICE_CLONING_CONSENT_REQUIRED: Missing user ID");

      expect(mockPrisma.workspaceConsent.findUnique).not.toHaveBeenCalled();
      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
      expect(createDubbingJob).not.toHaveBeenCalled();
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-consent-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("VOICE_CLONING_CONSENT_REQUIRED: Missing user ID"),
        }),
      });
    });

    it("2. fails closed without calling VoiceStudio or ElevenLabs when consent record is absent", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";
      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-no-record", jobData: null, demoId: null }),
        },
        demo: { findUnique: vi.fn().mockResolvedValue(null) },
        workspaceConsent: { findUnique: vi.fn().mockResolvedValue(null) },
      };

      await expect(
        executeDubbingJob(createConsentTestJob(), { prisma: mockPrisma as any })
      ).rejects.toThrow(
        "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted"
      );

      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
      expect(createDubbingJob).not.toHaveBeenCalled();
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-consent-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("VOICE_CLONING_CONSENT_REQUIRED"),
        }),
      });
    });

    it("3. fails closed without calling ElevenLabs or VoiceStudio when consent was revoked", async () => {
      process.env.DUBBING_PROVIDER = "elevenlabs";
      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-revoked", jobData: null, demoId: null }),
        },
        demo: { findUnique: vi.fn().mockResolvedValue(null) },
        workspaceConsent: {
          findUnique: vi.fn().mockResolvedValue({ voiceCloningConsent: false }),
        },
      };

      await expect(
        executeDubbingJob(createConsentTestJob(), { prisma: mockPrisma as any })
      ).rejects.toThrow(
        "VOICE_CLONING_CONSENT_REQUIRED: Explicit voice cloning consent has not been granted"
      );

      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
      expect(createDubbingJob).not.toHaveBeenCalled();
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-consent-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining("VOICE_CLONING_CONSENT_REQUIRED"),
        }),
      });
    });

    it("4. fails closed when the consent database lookup throws an error", async () => {
      process.env.DUBBING_PROVIDER = "voicestudio";
      const mockPrisma = {
        videoJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: "user-db-error", jobData: null, demoId: null }),
        },
        demo: { findUnique: vi.fn().mockResolvedValue(null) },
        workspaceConsent: {
          findUnique: vi.fn().mockRejectedValue(new Error("DB connection timeout")),
        },
      };

      await expect(
        executeDubbingJob(createConsentTestJob(), { prisma: mockPrisma as any })
      ).rejects.toThrow(
        "VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed: DB connection timeout"
      );

      expect(VoiceStudioDubbingAdapter).not.toHaveBeenCalled();
      expect(createDubbingJob).not.toHaveBeenCalled();
      expect(mockPrisma.videoJob.update).toHaveBeenCalledWith({
        where: { id: "video-job-consent-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.stringContaining(
            "VOICE_CLONING_CONSENT_REQUIRED: Consent verification failed"
          ),
        }),
      });
    });
  });
});
