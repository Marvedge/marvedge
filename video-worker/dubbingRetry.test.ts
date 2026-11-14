import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { getReusableDubbingJob, runDubbingJobWithRetry } from "./dubbingRetry";

describe("legacy dubbing worker retry handling", () => {
  it("skips processing when a late delivery cannot claim the job", async () => {
    const claim = vi.fn().mockResolvedValue(false);
    const process = vi.fn().mockResolvedValue(undefined);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await runDubbingJobWithRetry({
      jobId: "dubbing-job",
      attemptsMade: 0,
      maxAttempts: 1,
      claim,
      process,
      persistFailure,
    });

    expect(claim).toHaveBeenCalledOnce();
    expect(process).not.toHaveBeenCalled();
    expect(persistFailure).not.toHaveBeenCalled();
  });

  it("processes a retry when the job can still be claimed", async () => {
    const claim = vi.fn().mockResolvedValue(true);
    const process = vi.fn().mockResolvedValue(undefined);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await runDubbingJobWithRetry({
      jobId: "dubbing-job",
      attemptsMade: 1,
      maxAttempts: 2,
      claim,
      process,
      persistFailure,
    });

    expect(claim).toHaveBeenCalledOnce();
    expect(process).toHaveBeenCalledOnce();
    expect(persistFailure).not.toHaveBeenCalled();
  });

  it("reuses a persisted provider job for retries of the same dubbing input", () => {
    expect(
      getReusableDubbingJob(
        {
          kind: "DUBBING",
          sourceUrl: "https://example.com/source.mp4",
          targetLanguage: "ta",
          dubbingId: "elevenlabs-job",
          providerStatus: "processing",
        },
        "https://example.com/source.mp4",
        "ta"
      )
    ).toEqual({ dubbingId: "elevenlabs-job", status: "processing" });
  });

  it("does not reuse provider jobs belonging to different inputs", () => {
    expect(
      getReusableDubbingJob(
        {
          kind: "DUBBING",
          sourceUrl: "https://example.com/source.mp4",
          targetLanguage: "ta",
          dubbingId: "elevenlabs-job",
        },
        "https://example.com/another.mp4",
        "ta"
      )
    ).toBeUndefined();
  });

  it("rethrows intermediate failures without persisting FAILED", async () => {
    const originalError = new Error("ElevenLabs polling timed out");
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDubbingJobWithRetry({
        jobId: "dubbing-job",
        attemptsMade: 0,
        maxAttempts: 2,
        process,
        persistFailure,
      })
    ).rejects.toBe(originalError);

    expect(persistFailure).not.toHaveBeenCalled();
  });

  it("persists FAILED on the final attempt and rethrows the original error", async () => {
    const originalError = new Error("ElevenLabs polling timed out");
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDubbingJobWithRetry({
        jobId: "dubbing-job",
        attemptsMade: 1,
        maxAttempts: 2,
        process,
        persistFailure,
      })
    ).rejects.toBe(originalError);

    expect(persistFailure).toHaveBeenCalledOnce();
    expect(persistFailure).toHaveBeenCalledWith("ElevenLabs polling timed out");
  });

  it("does not retry deterministic ElevenLabs client errors", async () => {
    const originalError = new Error("ElevenLabs request failed (400): unsupported media");
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    const thrown = await runDubbingJobWithRetry({
      jobId: "dubbing-job",
      attemptsMade: 0,
      maxAttempts: 2,
      process,
      persistFailure,
    }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(UnrecoverableError);
    expect(thrown).toMatchObject({
      message: originalError.message,
      cause: originalError,
    });

    expect(process).toHaveBeenCalledOnce();
    expect(persistFailure).toHaveBeenCalledWith(originalError.message);
    expect(persistFailure).toHaveBeenCalledOnce();
  });

  it("preserves both processing and persistence errors when FAILED cannot be stored", async () => {
    const originalError = new Error("ElevenLabs polling timed out");
    const persistenceError = new Error("Database unavailable");

    await expect(
      runDubbingJobWithRetry({
        jobId: "dubbing-job",
        attemptsMade: 1,
        maxAttempts: 2,
        process: vi.fn().mockRejectedValue(originalError),
        persistFailure: vi.fn().mockRejectedValue(persistenceError),
      })
    ).rejects.toMatchObject({
      errors: [originalError, persistenceError],
    });
  });
  it("does not retry when ElevenLabs dubbing fails with detailed provider error", async () => {
    const originalError = new Error(
      "ElevenLabs dubbing failed with status: failed: Source audio could not be separated"
    );
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    const thrown = await runDubbingJobWithRetry({
      jobId: "dubbing-job",
      attemptsMade: 0,
      maxAttempts: 3,
      process,
      persistFailure,
    }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(UnrecoverableError);
    expect(thrown).toMatchObject({
      message: originalError.message,
      cause: originalError,
    });

    expect(process).toHaveBeenCalledOnce();
    expect(persistFailure).toHaveBeenCalledWith(originalError.message);
  });

  describe("VoiceStudio retry and error classification (Task-00132)", () => {
    it("classifies VoiceStudioUnavailableError as retryable", async () => {
      const { VoiceStudioUnavailableError } = await import("../app/lib/voicestudio/errors");
      const err = new VoiceStudioUnavailableError("VoiceStudio service warming up", 5);
      const { isRetryableDubbingError } = await import("./dubbingRetry");
      expect(isRetryableDubbingError(err)).toBe(true);

      const process = vi.fn().mockRejectedValue(err);
      const persistFailure = vi.fn().mockResolvedValue(undefined);

      await expect(
        runDubbingJobWithRetry({
          jobId: "vs-dubbing-job",
          attemptsMade: 0,
          maxAttempts: 2,
          process,
          persistFailure,
        })
      ).rejects.toBe(err);

      expect(persistFailure).not.toHaveBeenCalled();
    });

    it("classifies VoiceStudioAuthError as unrecoverable", async () => {
      const { VoiceStudioAuthError } = await import("../app/lib/voicestudio/errors");
      const err = new VoiceStudioAuthError("Invalid VoiceStudio API key", 401);
      const { isRetryableDubbingError } = await import("./dubbingRetry");
      expect(isRetryableDubbingError(err)).toBe(false);

      const process = vi.fn().mockRejectedValue(err);
      const persistFailure = vi.fn().mockResolvedValue(undefined);

      const thrown = await runDubbingJobWithRetry({
        jobId: "vs-dubbing-job",
        attemptsMade: 0,
        maxAttempts: 3,
        process,
        persistFailure,
      }).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(UnrecoverableError);
      expect(thrown).toMatchObject({
        message: err.message,
        cause: err,
      });
      expect(persistFailure).toHaveBeenCalledWith(err.message);
    });

    it("classifies VoiceStudio validation errors (INVALID_INPUT) as unrecoverable", async () => {
      const { VoiceStudioError } = await import("../app/lib/voicestudio/errors");
      const err = new VoiceStudioError("INVALID_INPUT", "No narration steps provided");
      const { isRetryableDubbingError } = await import("./dubbingRetry");
      expect(isRetryableDubbingError(err)).toBe(false);

      const process = vi.fn().mockRejectedValue(err);
      const persistFailure = vi.fn().mockResolvedValue(undefined);

      const thrown = await runDubbingJobWithRetry({
        jobId: "vs-dubbing-job",
        attemptsMade: 0,
        maxAttempts: 3,
        process,
        persistFailure,
      }).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(UnrecoverableError);
      expect(persistFailure).toHaveBeenCalledWith(err.message);
    });
  });
});
