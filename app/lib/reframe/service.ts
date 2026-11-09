// Service layer for the video reframing feature (Task-00023).
//
// Owns the business rules, queue submission, and payload typing for reframing jobs.
// Follows the same pattern as app/lib/audio/service.ts.
// The queue is injectable so handlers are unit-testable without a running Redis server.

import { reframeQueue } from "../queue";
import type { ReframeJobPayload } from "./validation";

export {
  type ReframeSourceMetadata,
  type ReframeJobPayload,
  ApiError,
  ReframePayloadValidationError,
  validateSourceMetadata,
  validateReframeInput,
  validateReframeJobPayload,
} from "./validation";

export interface ReframeJobQueue {
  add(
    kind: "reframe",
    payload: ReframeJobPayload,
    opts?: { jobId?: string }
  ): Promise<unknown>;
}

/** Default queue: BullMQ "reframe-processing", 3 retries, exponential backoff. */
export const reframeJobQueue: ReframeJobQueue = {
  add(kind, payload, opts) {
    return reframeQueue.add(kind, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
      jobId: opts?.jobId || payload.jobId,
    });
  },
};
