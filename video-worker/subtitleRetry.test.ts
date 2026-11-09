import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSubtitleJobWithRetry } from "./subtitleRetry";

describe("subtitle worker retry handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rethrows an intermediate failure without persisting FAILED", async () => {
    const originalError = new Error("Deepgram request timed out");
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runSubtitleJobWithRetry({
        jobId: "subtitle-job",
        attemptsMade: 0,
        maxAttempts: 3,
        process,
        persistFailure,
      })
    ).rejects.toBe(originalError);

    expect(process).toHaveBeenCalledOnce();
    expect(persistFailure).not.toHaveBeenCalled();
  });

  it("persists FAILED and rethrows the original error on the final attempt", async () => {
    const originalError = new Error("Deepgram request timed out");
    const process = vi.fn().mockRejectedValue(originalError);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runSubtitleJobWithRetry({
        jobId: "subtitle-job",
        attemptsMade: 2,
        maxAttempts: 3,
        process,
        persistFailure,
      })
    ).rejects.toBe(originalError);

    expect(persistFailure).toHaveBeenCalledOnce();
    expect(persistFailure).toHaveBeenCalledWith("Deepgram request timed out");
  });

  it("preserves the processing and persistence errors when final FAILED cannot be stored", async () => {
    const processingError = new Error("Deepgram request timed out");
    const persistenceError = new Error("Database unavailable");

    await expect(
      runSubtitleJobWithRetry({
        jobId: "subtitle-job",
        attemptsMade: 2,
        maxAttempts: 3,
        process: vi.fn().mockRejectedValue(processingError),
        persistFailure: vi.fn().mockRejectedValue(persistenceError),
      })
    ).rejects.toMatchObject({
      errors: [processingError, persistenceError],
    });
  });

  it("preserves successful caption processing without marking the job failed", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const persistFailure = vi.fn().mockResolvedValue(undefined);

    await expect(
      runSubtitleJobWithRetry({
        jobId: "subtitle-job",
        attemptsMade: 0,
        maxAttempts: 3,
        process,
        persistFailure,
      })
    ).resolves.toBeUndefined();

    expect(process).toHaveBeenCalledOnce();
    expect(persistFailure).not.toHaveBeenCalled();
  });
});
