interface SubtitleRetryOptions {
  jobId: string;
  attemptsMade: number;
  maxAttempts: number;
  process: () => Promise<void>;
  persistFailure: (message: string) => Promise<void>;
}

export async function runSubtitleJobWithRetry({
  jobId,
  attemptsMade,
  maxAttempts,
  process,
  persistFailure,
}: SubtitleRetryOptions): Promise<void> {
  try {
    await process();
  } catch (error) {
    const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
    const errorMessage =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message
        ? error.message
        : "Subtitle generation failed";

    if (isFinalAttempt) {
      try {
        await persistFailure(errorMessage);
      } catch (persistError) {
        throw new AggregateError(
          [error, persistError],
          `Subtitle generation failed and the final failure status could not be persisted for job ${jobId}`
        );
      }
    } else {
      console.warn(
        `[${jobId}] Subtitle job failed on an intermediate attempt; BullMQ will retry:`,
        errorMessage
      );
    }

    throw error;
  }
}
