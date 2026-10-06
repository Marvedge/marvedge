import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import { getReusableDubbingJob, runDubbingJobWithRetry } from "./dubbingRetry";

describe("legacy dubbing worker retry handling", () => {
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
});
