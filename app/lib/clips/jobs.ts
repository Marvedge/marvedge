// Background job handlers for the transcript virality scoring and clip generation feature (Task-00050).
//
// These run in the BullMQ worker (video-worker/index.ts) — never inline in the
// request/response cycle.
//
// Uses relative imports only (the worker resolves no `@/` aliases), and takes its
// DB client and scoring function as arguments so unit tests can inject mocks.

import { scoreTranscriptClips } from "./scorer";
import { detectSceneCuts } from "./scenes";
import type { ClipCandidate, ClipScoringInput, ClipScoringOptions, SceneBoundary } from "./types";
import { resolveTranscriptCues } from "./service";
import type { SubtitleCue } from "../subtitles/types";

export interface ClipJobPayload {
  jobId: string;
  userId?: string;
  demoId?: string | null;
  videoUrl?: string;
  cues?: SubtitleCue[];
  duration?: number;
  options?: ClipScoringOptions;
}

export interface ClipJobDbClient {
  videoJob: {
    findUnique?: (args: { where: { id: string } }) => Promise<{
      id: string;
      status: string;
      jobData: unknown;
    } | null>;
    update: (args: {
      where: { id: string };
      data: {
        status?: string;
        progress?: number;
        jobData?: unknown;
        error?: string | null;
      };
    }) => Promise<unknown>;
  };
  demo?: {
    findUnique: (args: {
      where: { id: string };
      select: { id: string; subtitles: unknown; duration: number | null; videoUrl: string };
    }) => Promise<{ id: string; subtitles: unknown; duration: number | null; videoUrl: string } | null>;
  };
  subtitleTrack?: {
    findFirst: (args: {
      where: { demoId: string; status: string };
      select: { cues: unknown };
    }) => Promise<{ cues: unknown } | null>;
  };
}

export interface RunClipScoringJobOptions {
  scoringFn?: (input: ClipScoringInput) => Promise<ClipCandidate[]>;
  sceneDetectionFn?: (videoPath: string) => Promise<SceneBoundary[]>;
  updateProgress?: (progress: number) => Promise<void>;
}

/** Small retry wrapper for DB writes (Neon cold-starts, same as worker standard). */
async function withDbRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isConnErr =
        error instanceof Error &&
        (error.message.includes("Can't reach database") || error.message.includes("connect"));
      if (isConnErr && attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
      } else {
        throw error;
      }
    }
  }
}

/**
 * Executes the clip-scoring job lifecycle inside the worker process.
 */
export async function runClipScoringJob(
  payload: ClipJobPayload,
  db: ClipJobDbClient,
  opts: RunClipScoringJobOptions = {}
): Promise<ClipCandidate[]> {
  const { jobId, demoId, videoUrl, cues: suppliedCues, duration: suppliedDuration, options } = payload;
  const scorer = opts.scoringFn || scoreTranscriptClips;
  const updateProgress = opts.updateProgress || (async () => {});

  console.log(`[clip-scoring] Starting job ${jobId} (demoId=${demoId || "none"})...`);

  try {
    // 1. Mark VideoJob as PROCESSING
    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: { status: "PROCESSING", progress: 10 },
      })
    );
    await updateProgress(10);

    // 2. Resolve transcript cues and video duration
    const { cues, duration, resolvedVideoUrl } = await resolveTranscriptCues(db, {
      demoId,
      videoUrl,
      suppliedCues,
      suppliedDuration,
    });

    console.log(`[clip-scoring] Resolved ${cues.length} cues, duration=${duration.toFixed(2)}s for job ${jobId}`);
    await updateProgress(30);

    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: { progress: 30 },
      })
    );

    // 3. Optional visual scene detection if video file/path is available
    let scenes: SceneBoundary[] = [];
    const targetVideo = resolvedVideoUrl || videoUrl;
    if (targetVideo && (targetVideo.startsWith("file://") || targetVideo.startsWith("/") || targetVideo.includes(":\\"))) {
      try {
        const sceneFn = opts.sceneDetectionFn || detectSceneCuts;
        scenes = await sceneFn(targetVideo);
        console.log(`[clip-scoring] Detected ${scenes.length} visual scenes for job ${jobId}`);
      } catch (sceneErr) {
        console.warn(`[clip-scoring] Scene detection skipped for ${jobId}:`, sceneErr);
      }
    }

    await updateProgress(50);
    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: { progress: 50 },
      })
    );

    // 4. Run virality scoring and boundary alignment
    console.log(`[clip-scoring] Invoking scoring engine with ${cues.length} cues...`);
    const candidates = await scorer({
      cues,
      totalDuration: duration,
      scenes,
      options,
    });

    console.log(`[clip-scoring] Scoring completed: generated ${candidates.length} ranked candidates for ${jobId}`);
    await updateProgress(90);

    // 5. Persist candidates to VideoJob.jobData and mark COMPLETED
    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          jobData: {
            kind: "CLIP_SCORING",
            candidates,
          },
        },
      })
    );
    await updateProgress(100);

    return candidates;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[clip-scoring] Job ${jobId} failed:`, errorMsg);

    // Mark VideoJob as FAILED
    await withDbRetry(() =>
      db.videoJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          error: errorMsg,
        },
      })
    ).catch((dbErr) => {
      console.error(`[clip-scoring] Failed to mark job ${jobId} as FAILED:`, dbErr);
    });

    throw err;
  }
}
