import { UnrecoverableError } from "bullmq";

interface DubbingRetryOptions {
  jobId: string;
  attemptsMade: number;
  maxAttempts: number;
  process: () => Promise<void>;
  persistFailure: (message: string) => Promise<void>;
}

function isRetryableDubbingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  if (
    error.message === "Missing ELEVENLABS_API_KEY" ||
    error.message === "ElevenLabs did not return a dubbing ID" ||
    error.message.startsWith("ElevenLabs dubbing failed with status:")
  ) {
    return false;
  }

  const status = /^ElevenLabs request failed \((\d{3})\):/.exec(error.message)?.[1];
  if (status) {
    const statusCode = Number(status);
    return statusCode < 400 || statusCode >= 500 || statusCode === 429;
  }

  return true;
}

export function getReusableDubbingJob(
  jobData: unknown,
  sourceUrl: string,
  targetLanguage: string
): { dubbingId: string; status: string } | undefined {
  if (!jobData || typeof jobData !== "object" || Array.isArray(jobData)) {
    return undefined;
  }

  const data = jobData as Record<string, unknown>;
  if (
    data.kind !== "DUBBING" ||
    data.sourceUrl !== sourceUrl ||
    data.targetLanguage !== targetLanguage ||
    typeof data.dubbingId !== "string" ||
    !data.dubbingId
  ) {
    return undefined;
  }

  return {
    dubbingId: data.dubbingId,
    status: typeof data.providerStatus === "string" ? data.providerStatus : "processing",
  };
}

export async function runDubbingJobWithRetry({
  jobId,
  attemptsMade,
  maxAttempts,
  process,
  persistFailure,
}: DubbingRetryOptions): Promise<void> {
  try {
    await process();
  } catch (error) {
    const isFinalAttempt = attemptsMade + 1 >= maxAttempts;
    const isRetryable = isRetryableDubbingError(error);
    const errorMessage = error instanceof Error && error.message ? error.message : "Dubbing failed";

    if (!isFinalAttempt && isRetryable) {
      console.warn(
        `[Dubbing ${jobId}] Failed on an intermediate attempt; BullMQ will retry:`,
        errorMessage
      );
      throw error;
    }

    try {
      await persistFailure(errorMessage);
    } catch (persistError) {
      throw new AggregateError(
        [error, persistError],
        `Dubbing failed and the final failure status could not be persisted for job ${jobId}`
      );
    }

    if (!isRetryable) {
      const unrecoverableError = new UnrecoverableError(errorMessage);
      unrecoverableError.cause = error;
      throw unrecoverableError;
    }

    throw error;
  }
}
