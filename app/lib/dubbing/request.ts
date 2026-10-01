// Client-side request builder for POST /api/avs/dub.
//
// The body is sanitized against exactly the same rules the route's own parsers
// apply (parseSteps / parseDubTimings / toHttpUrl), so invalid entries are
// silently dropped rather than rejected — matching the backend's graceful
// degrade behaviour when dubUrl or dubTimings are absent.
//
// Source-length note: the route reads the request's `duration` field as the
// source video length, while the product contract documents it as
// `sourceDuration`. Both keys are sent with the same value so either spelling
// works without changing the backend.

import type { DubTiming, Step } from "@/app/types/avs";

export interface DubRequestInput {
  videoUrl: unknown;
  dubUrl: unknown;
  steps: unknown;
  dubTimings: unknown;
  duration: unknown;
  /** Original source video length in seconds (used when no alignment happens). */
  sourceDuration?: unknown;
  demoId: unknown;
}

export interface DubRequestBody {
  videoUrl: string;
  dubUrl: string;
  steps: Step[];
  dubTimings: DubTiming[];
  duration: number;
  sourceDuration: number;
  demoId: string | null;
}

/** Read + sanitize the `steps` field into {id,index,startTime,endTime} entries. */
export function sanitizeDubSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const steps: Step[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const startTime = typeof rec.startTime === "number" ? rec.startTime : NaN;
    const endTime = typeof rec.endTime === "number" ? rec.endTime : NaN;
    const index = typeof rec.index === "number" ? rec.index : steps.length;
    if (id && Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime) {
      steps.push({ id, index, startTime, endTime });
    }
  }
  return steps;
}

/** Read + sanitize the `dubTimings` field into {stepId,start,end} entries. */
export function sanitizeDubTimings(value: unknown): DubTiming[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const timings: DubTiming[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const stepId = typeof rec.stepId === "string" ? rec.stepId : "";
    const start = typeof rec.start === "number" ? rec.start : NaN;
    const end = typeof rec.end === "number" ? rec.end : NaN;
    if (stepId && Number.isFinite(start) && Number.isFinite(end) && end > start) {
      timings.push({ stepId, start, end });
    }
  }
  return timings;
}

/** Normalize a gs:// URL to a public https URL; everything else passes through. */
export function dubToHttpsUrl(url: string): string {
  if (url.startsWith("gs://")) {
    return url.replace("gs://", "https://storage.googleapis.com/");
  }
  return url;
}

function asPositiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export type BuildDubRequestResult =
  | { ok: true; body: DubRequestBody }
  | { ok: false; error: string };

/**
 * Build a validated request body. Fails only when the video URL is missing or
 * the source duration is not a positive number — the two fields alignment
 * cannot live without. Everything else degrades like the route does.
 */
export function buildDubRequest(input: DubRequestInput): BuildDubRequestResult {
  if (typeof input.videoUrl !== "string" || input.videoUrl.trim().length === 0) {
    return { ok: false, error: "Missing videoUrl" };
  }

  const duration = asPositiveNumber(input.duration);
  if (duration <= 0) {
    return { ok: false, error: "Missing source duration" };
  }

  const rawDubUrl = typeof input.dubUrl === "string" ? input.dubUrl.trim() : "";
  const sourceDuration = asPositiveNumber(input.sourceDuration) || duration;
  const demoId = typeof input.demoId === "string" && input.demoId.length > 0 ? input.demoId : null;

  return {
    ok: true,
    body: {
      videoUrl: dubToHttpsUrl(input.videoUrl.trim()),
      dubUrl: rawDubUrl ? dubToHttpsUrl(rawDubUrl) : "",
      steps: sanitizeDubSteps(input.steps),
      dubTimings: sanitizeDubTimings(input.dubTimings),
      duration,
      sourceDuration,
      demoId,
    },
  };
}
