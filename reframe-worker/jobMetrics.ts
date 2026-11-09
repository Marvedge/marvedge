interface FailedReframeJob {
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}

export function isFinalReframeJobFailure(
  job: FailedReframeJob,
  error: Error,
  wasDiscarded: boolean
): boolean {
  const configuredAttempts = job.opts.attempts;
  const maxAttempts = configuredAttempts && configuredAttempts > 0 ? configuredAttempts : 1;

  return wasDiscarded || error.name === "UnrecoverableError" || job.attemptsMade >= maxAttempts;
}
