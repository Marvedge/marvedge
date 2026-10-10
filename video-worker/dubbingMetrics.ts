import { performance } from "node:perf_hooks";
import { dubbingDurationSeconds, jobsTotal } from "../app/lib/monitoring/metrics";

interface DubbingWorkerJob {
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}

export async function runDubbingJobWithMetrics<T>(
  process: () => Promise<T>,
  onDuration?: (status: "success" | "failure", durationSeconds: number) => void
): Promise<T> {
  const startedAt = performance.now();
  let status: "success" | "failure" = "failure";

  try {
    const result = await process();
    status = "success";
    return result;
  } finally {
    const durationSeconds = (performance.now() - startedAt) / 1000;
    dubbingDurationSeconds.observe({ status }, durationSeconds);
    try {
      onDuration?.(status, durationSeconds);
    } catch (error) {
      console.error("[monitoring] Failed to record dubbing latency observation:", error);
    }
  }
}

export function withDubbingJobMetrics<TJob, TResult>(
  process: (job: TJob) => Promise<TResult>,
  onDuration?: (status: "success" | "failure", durationSeconds: number) => void
): (job: TJob) => Promise<TResult> {
  return (job) => runDubbingJobWithMetrics(() => process(job), onDuration);
}

export function recordDubbingJobCompleted(): void {
  jobsTotal.inc({ pipeline: "dubbing", status: "completed" });
}

export function recordFinalDubbingJobFailure(job: DubbingWorkerJob, error: Error): boolean {
  const configuredAttempts = job.opts.attempts;
  const maxAttempts = configuredAttempts && configuredAttempts > 0 ? configuredAttempts : 1;
  const isFinalFailure = error.name === "UnrecoverableError" || job.attemptsMade >= maxAttempts;

  if (isFinalFailure) {
    jobsTotal.inc({ pipeline: "dubbing", status: "failed" });
  }

  return isFinalFailure;
}
