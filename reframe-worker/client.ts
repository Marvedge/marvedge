// HTTP Clients for the lightweight Reframe Worker (Task-00023).
//
// Handles:
// 1. Calling the pure ML inference service over HTTP POST /reframe
// 2. Calling the backend authenticated callback at /api/jobs/callback
// Contains ZERO Prisma / Postgres imports.

import {
  type CropTargetData,
  validateCropTargetData,
  CropTargetValidationError,
} from "../app/types/editor/crop-target";

export interface MlInferenceRequest {
  videoUrl: string;
  targetAspectRatio: string;
  source?: {
    width: number;
    height: number;
    fps?: number;
    durationSec?: number;
  } | null;
}

export interface MlInferenceEnvelope {
  cropTargets?: CropTargetData;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

import type { JobCallbackPayload } from "../app/types/jobs/callback";
import {
  CallbackHttpError,
  postJobCallback,
  postJobCallbackWithRetry,
} from "../app/lib/jobs/callbackClient";

export {
  type JobCallbackPayload,
  CallbackHttpError,
  CropTargetValidationError,
  postJobCallback,
  postJobCallbackWithRetry,
};

/**
 * Invokes the pure, stateless ML inference service over HTTP POST /reframe.
 * Authoritatively validates the extracted CropTargetData using validateCropTargetData()
 * before returning it to the orchestrator to prevent malformed crop data from reaching FFmpeg.
 */
export async function callMlInference(
  mlServiceUrl: string,
  request: MlInferenceRequest,
  options: { timeoutMs?: number } = {}
): Promise<CropTargetData> {
  const endpoint = `${mlServiceUrl.replace(/\/+$/, "")}/reframe`;
  const timeoutMs = options.timeoutMs ?? 180000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errDetail = "";
      try {
        const errJson = (await response.json()) as Record<string, unknown>;
        errDetail = String(errJson.error || errJson.message || JSON.stringify(errJson));
      } catch {
        errDetail = await response.text().catch(() => "");
      }
      throw new Error(
        `ML inference HTTP ${response.status}${errDetail ? `: ${errDetail}` : ""}`
      );
    }

    const data = (await response.json()) as MlInferenceEnvelope;
    if (!data || typeof data !== "object") {
      throw new Error("ML inference returned non-object response");
    }

    if (data.ok === false) {
      throw new Error(
        `ML inference error: ${data.error || "Service reported failure"}`
      );
    }

    let extracted: unknown;

    // Direct CropTargetData root envelope support (Task-00016 schema)
    if (
      "crop_targets" in data &&
      Array.isArray((data as unknown as Record<string, unknown>).crop_targets)
    ) {
      extracted = data;
    } else if (
      // Canonical response: { ok: true, crop_targets: CropTargetData }
      "crop_targets" in data &&
      data.crop_targets !== null &&
      typeof data.crop_targets === "object" &&
      !Array.isArray(data.crop_targets)
    ) {
      extracted = data.crop_targets;
    } else if (
      // Alternate envelope: { cropTargets: CropTargetData }
      "cropTargets" in data &&
      data.cropTargets !== null &&
      typeof data.cropTargets === "object" &&
      !Array.isArray(data.cropTargets)
    ) {
      extracted = data.cropTargets;
    } else if ("schema_version" in data) {
      extracted = data;
    } else {
      throw new Error(
        "ML inference response envelope missing 'crop_targets' object"
      );
    }

    validateCropTargetData(extracted);
    return extracted;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ML inference timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

