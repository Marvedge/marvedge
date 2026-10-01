// Start + poll dubbing jobs against the existing AVS endpoints:
//   - POST /api/avs/dub →  { success, jobId }            (schedules the job)
//   - GET  /api/jobs/[id] →  { success, state, progress, aligned?... }
//
// Poll cadence mirrors the AVS pipeline (useAvsPipeline) so the dubbing panel
// uses the same rhythm as time-alignment and export.

import axios from "axios";

import type { DubRequestBody } from "./request";
import { normalizeDubJobState, type DubJobState } from "./normalize";

export const DUB_POLL_INTERVAL_MS = 2500;
export const MAX_DUB_POLLS = 240; // ~10 minutes, matching the AVS alignment budget.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kick off a dub alignment job. Resolves with the job id to poll, or throws
 * when the route did not schedule a job.
 */
export async function startDubJob(body: DubRequestBody): Promise<string> {
  const res = await axios.post("/api/avs/dub", body);
  const jobId = (res.data ?? {}) as { jobId?: unknown };
  if (typeof jobId.jobId !== "string" || jobId.jobId.length === 0) {
    throw new Error("Dubbing did not start");
  }
  return jobId.jobId;
}

export interface PollDubResult {
  /** The aligned clip's url; empty when the backend did not surface one. */
  alignedVideoUrl: string;
  /** The aligned clip's duration; 0 when the backend did not surface one. */
  duration: number;
  progress: number | null;
}

export type PollOutcome =
  | ({ status: "completed" } & PollDubResult)
  | { status: "failed"; error: string; progress: number | null }
  | { status: "cancelled"; progress: number | null }
  | { status: "stopped"; progress: number | null }
  | { status: "timed_out"; lastState: DubJobState; progress: number | null };

export interface PollDubOptions {
  intervalMs?: number;
  maxPolls?: number;
  /** Short-circuit for the owner (unmount / cancelled / new run started). */
  shouldStop?: () => boolean;
  /** Called every poll with the latest normalized state + real progress. */
  onState?: (state: DubJobState, progress: number | null) => void;
}

function toHttpError(e: unknown): string {
  if (axios.isAxiosError(e) && typeof e.response?.data?.error === "string") {
    return e.response.data.error;
  }
  return e instanceof Error ? e.message : "Dubbing job failed";
}

/**
 * Poll GET /api/jobs/[id] until a terminal state, `shouldStop`, or the poll
 * budget is exhausted. Every `state` spelling (upper/lower/aliased) is folded
 * by normalizeDubJobState before it is acted on. Progress is the job's own
 * `progress` value from the backend — never fabricated client-side.
 */
export async function pollDubJob(
  jobId: string,
  options: PollDubOptions = {}
): Promise<PollOutcome> {
  const intervalMs = options.intervalMs ?? DUB_POLL_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? MAX_DUB_POLLS;
  const shouldStop = options.shouldStop ?? (() => false);

  let progress: number | null = null;
  let lastState: DubJobState = "unknown";

  for (let poll = 0; poll < maxPolls; poll++) {
    if (shouldStop()) {
      return { status: "stopped", progress };
    }

    let data: Record<string, unknown>;
    try {
      const res = await axios.get(`/api/jobs/${jobId}`);
      data = (res.data ?? {}) as Record<string, unknown>;
    } catch (e: unknown) {
      // A transient network error is counted as a failed poll attempt rather
      // than killing the loop; only the final attempt surfaces the error.
      if (poll === maxPolls - 1) {
        return { status: "failed", error: toHttpError(e), progress };
      }
      await sleep(intervalMs);
      continue;
    }

    const state = normalizeDubJobState(data.state);
    lastState = state;
    progress = typeof data.progress === "number" ? data.progress : progress;
    options.onState?.(state, progress);

    if (state === "completed") {
      const aligned =
        data.aligned && typeof data.aligned === "object"
          ? (data.aligned as Record<string, unknown>)
          : {};
      const alignedVideoUrl =
        typeof aligned.alignedVideoUrl === "string" ? aligned.alignedVideoUrl : "";
      const duration = typeof aligned.duration === "number" ? aligned.duration : 0;
      return { status: "completed", alignedVideoUrl, duration, progress };
    }
    if (state === "failed") {
      return {
        status: "failed",
        error: typeof data.error === "string" ? data.error : "Dubbing job failed",
        progress,
      };
    }
    if (state === "cancelled") {
      return { status: "cancelled", progress };
    }

    await sleep(intervalMs);
  }

  return { status: "timed_out", lastState, progress };
}
