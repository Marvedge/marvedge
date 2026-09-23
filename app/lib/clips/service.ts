// Service layer for the transcript virality scoring and clip generation feature (Task-00050).
//
// Owns input validation, transcript resolution from existing Demot/SubtitleTrack/VideoJob
// records, VideoJob record lifecycle, and queue dispatch onto the Marvedge BullMQ videoQueue.

import { videoQueue } from "../queue";
import type { SubtitleCue } from "../subtitles/types";
import { readCueList } from "../subtitles";
import type { ClipScoringOptions } from "./types";

export interface ClipScoringJobPayload {
  jobId: string;
  userId?: string;
  demoId?: string | null;
  videoUrl?: string;
  cues?: SubtitleCue[];
  duration: number;
  options?: ClipScoringOptions;
}

export interface ClipJobQueue {
  add(
    name: "clip-scoring",
    payload: ClipScoringJobPayload,
    opts?: { jobId?: string }
  ): Promise<unknown>;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/**
 * Default queue dispatcher using BullMQ "video-processing" queue with job name "clip-scoring".
 * Adheres to Marvedge worker retry conventions (3 attempts, exponential backoff).
 */
export const clipJobQueue: ClipJobQueue = {
  add(name, payload, opts) {
    return videoQueue.add(name, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
      jobId: opts?.jobId || payload.jobId,
    });
  },
};

export interface ValidatedClipScoringInput {
  demoId?: string | null;
  videoUrl?: string;
  cues?: SubtitleCue[];
  duration?: number;
  options?: ClipScoringOptions;
}

/**
 * Validates request input fields before creating a database record or enqueuing.
 */
export function validateClipScoringInput(data: unknown): ValidatedClipScoringInput {
  if (!data || typeof data !== "object") {
    throw new ApiError(400, "Request body must be an object");
  }

  const record = data as Record<string, unknown>;

  let demoId: string | null | undefined = undefined;
  if (record.demoId !== undefined) {
    if (record.demoId !== null && (typeof record.demoId !== "string" || !record.demoId.trim())) {
      throw new ApiError(400, "demoId must be a non-empty string if provided");
    }
    demoId = record.demoId ? (record.demoId as string).trim() : null;
  }

  let videoUrl: string | undefined = undefined;
  if (record.videoUrl !== undefined) {
    if (typeof record.videoUrl !== "string" || !record.videoUrl.trim()) {
      throw new ApiError(400, "videoUrl must be a non-empty string if provided");
    }
    videoUrl = record.videoUrl.trim();
  }

  let cues: SubtitleCue[] | undefined = undefined;
  if (record.cues !== undefined) {
    if (!Array.isArray(record.cues)) {
      throw new ApiError(400, "cues must be an array if provided");
    }
    const rawCues = readCueList(record.cues);
    if (rawCues.length === 0 && record.cues.length > 0) {
      throw new ApiError(400, "cues array contains invalid subtitle cue objects");
    }
    cues = rawCues;
  }

  let duration: number | undefined = undefined;
  if (record.duration !== undefined) {
    if (typeof record.duration !== "number" || !Number.isFinite(record.duration) || record.duration <= 0) {
      throw new ApiError(400, "duration must be a positive number if provided");
    }
    duration = record.duration;
  }

  let options: ClipScoringOptions | undefined = undefined;
  if (record.options !== undefined && record.options !== null) {
    if (typeof record.options !== "object") {
      throw new ApiError(400, "options must be an object if provided");
    }
    const opt = record.options as Record<string, unknown>;

    if (
      opt.minDurationSeconds !== undefined &&
      (typeof opt.minDurationSeconds !== "number" || opt.minDurationSeconds <= 0)
    ) {
      throw new ApiError(400, "options.minDurationSeconds must be a positive number");
    }
    if (
      opt.maxDurationSeconds !== undefined &&
      (typeof opt.maxDurationSeconds !== "number" || opt.maxDurationSeconds <= 0)
    ) {
      throw new ApiError(400, "options.maxDurationSeconds must be a positive number");
    }
    if (
      opt.minDurationSeconds !== undefined &&
      opt.maxDurationSeconds !== undefined &&
      opt.minDurationSeconds > opt.maxDurationSeconds
    ) {
      throw new ApiError(400, "options.minDurationSeconds cannot exceed options.maxDurationSeconds");
    }
    if (
      opt.targetClipCount !== undefined &&
      (typeof opt.targetClipCount !== "number" || opt.targetClipCount <= 0 || !Number.isInteger(opt.targetClipCount))
    ) {
      throw new ApiError(400, "options.targetClipCount must be a positive integer");
    }
    if (
      opt.platform !== undefined &&
      !["tiktok", "reels", "shorts", "general"].includes(String(opt.platform))
    ) {
      throw new ApiError(400, "options.platform must be one of: tiktok, reels, shorts, general");
    }
    if (opt.model !== undefined && (typeof opt.model !== "string" || !opt.model.trim())) {
      throw new ApiError(400, "options.model must be a string");
    }
    if (
      opt.temperature !== undefined &&
      (typeof opt.temperature !== "number" || opt.temperature < 0 || opt.temperature > 2)
    ) {
      throw new ApiError(400, "options.temperature must be a number between 0 and 2");
    }

    options = {
      ...(opt.minDurationSeconds !== undefined ? { minDurationSeconds: opt.minDurationSeconds as number } : {}),
      ...(opt.maxDurationSeconds !== undefined ? { maxDurationSeconds: opt.maxDurationSeconds as number } : {}),
      ...(opt.targetClipCount !== undefined ? { targetClipCount: opt.targetClipCount as number } : {}),
      ...(opt.platform !== undefined ? { platform: opt.platform as ClipScoringOptions["platform"] } : {}),
      ...(opt.apiKey !== undefined ? { apiKey: String(opt.apiKey).trim() } : {}),
      ...(opt.model !== undefined ? { model: String(opt.model).trim() } : {}),
      ...(opt.temperature !== undefined ? { temperature: opt.temperature as number } : {}),
    };
  }

  if (!demoId && !videoUrl && (!cues || cues.length === 0)) {
    throw new ApiError(400, "At least one of demoId, videoUrl, or cues must be provided");
  }

  return {
    demoId,
    videoUrl,
    cues,
    duration,
    options,
  };
}

/** Minimal database query interface for transcript resolution. */
export interface TranscriptResolverDb {
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
  videoJob?: {
    findFirst: (args: {
      where: {
        status: string;
        OR?: Array<{ demoId?: string; videoUrl?: string }>;
        demoId?: string;
        videoUrl?: string;
      };
      select: { jobData: unknown };
    }) => Promise<{ jobData: unknown } | null>;
  };
}

/**
 * Resolves existing transcript cues without re-transcribing.
 * Checks in order:
 * 1. explicitly supplied cues
 * 2. Demo.subtitles
 * 3. SubtitleTrack.cues
 * 4. VideoJob.jobData.subtitles
 */
export async function resolveTranscriptCues(
  db: TranscriptResolverDb,
  input: {
    demoId?: string | null;
    videoUrl?: string;
    suppliedCues?: SubtitleCue[];
    suppliedDuration?: number;
  }
): Promise<{ cues: SubtitleCue[]; duration: number; resolvedVideoUrl?: string }> {
  const { demoId, videoUrl, suppliedCues, suppliedDuration } = input;

  // 1. Explicitly supplied cues
  if (Array.isArray(suppliedCues) && suppliedCues.length > 0) {
    const duration =
      suppliedDuration && suppliedDuration > 0
        ? suppliedDuration
        : Math.max(...suppliedCues.map((c) => c.end), 1.0);
    return { cues: suppliedCues, duration, resolvedVideoUrl: videoUrl };
  }

  let resolvedVideoUrl = videoUrl;
  let duration = suppliedDuration || 0;

  // 2. Demo.subtitles or SubtitleTrack.cues
  if (demoId && db.demo) {
    const demo = await db.demo.findUnique({
      where: { id: demoId },
      select: { id: true, subtitles: true, duration: true, videoUrl: true },
    });

    if (demo) {
      if (!resolvedVideoUrl && demo.videoUrl) {
        resolvedVideoUrl = demo.videoUrl;
      }
      if (!duration && demo.duration && demo.duration > 0) {
        duration = demo.duration;
      }

      const demoCues = readCueList(demo.subtitles);
      if (demoCues.length > 0) {
        if (!duration) {
          duration = Math.max(...demoCues.map((c) => c.end), 1.0);
        }
        return { cues: demoCues, duration, resolvedVideoUrl };
      }
    }

    if (db.subtitleTrack) {
      const track = await db.subtitleTrack.findFirst({
        where: { demoId, status: "READY" },
        select: { cues: true },
      });
      if (track) {
        const trackCues = readCueList(track.cues);
        if (trackCues.length > 0) {
          if (!duration) {
            duration = Math.max(...trackCues.map((c) => c.end), 1.0);
          }
          return { cues: trackCues, duration, resolvedVideoUrl };
        }
      }
    }
  }

  // 3. VideoJob.jobData.subtitles
  if (db.videoJob && (demoId || resolvedVideoUrl)) {
    const whereConditions: Array<{ demoId?: string; videoUrl?: string }> = [];
    if (demoId) whereConditions.push({ demoId });
    if (resolvedVideoUrl) whereConditions.push({ videoUrl: resolvedVideoUrl });

    const job = await db.videoJob.findFirst({
      where: {
        status: "COMPLETED",
        OR: whereConditions,
      },
      select: { jobData: true },
    });

    if (job && job.jobData && typeof job.jobData === "object") {
      const jd = job.jobData as Record<string, unknown>;
      const jobCues = readCueList(jd.subtitles);
      if (jobCues.length > 0) {
        if (!duration) {
          duration = Math.max(...jobCues.map((c) => c.end), 1.0);
        }
        return { cues: jobCues, duration, resolvedVideoUrl };
      }
    }
  }

  throw new ApiError(
    400,
    "No transcript cues found for clip scoring. Please transcribe the video or add subtitles first."
  );
}
