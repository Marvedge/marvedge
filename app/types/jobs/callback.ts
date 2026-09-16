// Shared callback contract types for background job completion (Task-00026).
//
// Defines discriminated unions for callbacks sent to POST /api/jobs/callback.
// Usable by both backend API routes and external/worker processes.
// ZERO Prisma/Postgres imports.

import type { CropTargetData } from "../editor/crop-target";

export type ReframeProcessingCallbackPayload = {
  jobId: string;
  status: "PROCESSING";
  progress: number;
};

export type ReframeCompletedCallbackPayload = {
  jobId: string;
  status: "COMPLETED";
  cropTargets: CropTargetData;
};

export type ReframeFailedCallbackPayload = {
  jobId: string;
  status: "FAILED";
  error: string;
};

export type ReframeCallbackPayload =
  | ReframeProcessingCallbackPayload
  | ReframeCompletedCallbackPayload
  | ReframeFailedCallbackPayload;

export type ExportCompletedCallbackPayload = {
  jobId: string;
  status: "COMPLETED";
  exportedUrl?: string;
};

export type ExportFailedCallbackPayload = {
  jobId: string;
  status: "FAILED";
  error?: string;
};

export type ExportCallbackPayload =
  | ExportCompletedCallbackPayload
  | ExportFailedCallbackPayload;

/**
 * Union of all valid callback payloads sent to POST /api/jobs/callback.
 */
export type JobCallbackPayload =
  | ReframeProcessingCallbackPayload
  | ReframeCompletedCallbackPayload
  | ReframeFailedCallbackPayload
  | ExportCompletedCallbackPayload
  | ExportFailedCallbackPayload;

export interface JobCallbackSuccessResponse {
  success: true;
  ignored?: boolean;
  message?: string;
}

export interface JobCallbackErrorResponse {
  error: string;
}

export type JobCallbackResponse =
  | JobCallbackSuccessResponse
  | JobCallbackErrorResponse;
