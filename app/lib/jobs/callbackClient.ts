// Reusable HTTP client for delivering authenticated background job callbacks (Task-00026).
//
// Handles:
// - Callback endpoint URL formatting
// - Bearer authentication using CALLBACK_SECRET
// - Request timeout management
// - Exponential backoff retry for transient network and 5xx errors
// - Fast fail on 4xx client errors (validation failures, unauthorized)
//
// ZERO Prisma / Postgres imports.

import type {
  JobCallbackPayload,
  JobCallbackSuccessResponse,
} from "../../types/jobs/callback";

export class CallbackHttpError extends Error {
  readonly status: number;
  readonly isClientError: boolean;

  constructor(status: number, message: string) {
    super(`Callback request failed with status ${status}: ${message}`);
    this.name = "CallbackHttpError";
    this.status = status;
    this.isClientError = status >= 400 && status < 500;
  }
}

export interface CallbackRequestOptions {
  timeoutMs?: number;
}

export interface CallbackRetryOptions {
  retries?: number;
  delayMs?: number;
  timeoutMs?: number;
}

/**
 * Builds the canonical callback URL for POST /api/jobs/callback.
 */
export function buildCallbackUrl(backendUrl: string): string {
  const normalized = backendUrl.trim().replace(/\/+$/, "");
  return `${normalized}/api/jobs/callback`;
}

/**
 * Sends a single authenticated callback to POST /api/jobs/callback.
 * Throws CallbackHttpError on non-2xx responses.
 */
export async function postJobCallback(
  backendUrl: string,
  callbackSecret: string,
  payload: JobCallbackPayload,
  options: CallbackRequestOptions = {}
): Promise<JobCallbackSuccessResponse> {
  const endpoint = buildCallbackUrl(backendUrl);
  const timeoutMs = options.timeoutMs ?? 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (callbackSecret) {
      headers["authorization"] = `Bearer ${callbackSecret}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errMessage = "";
      try {
        const body = (await response.json()) as Record<string, unknown>;
        errMessage = String(body.error || body.message || JSON.stringify(body));
      } catch {
        errMessage = await response.text().catch(() => "");
      }
      throw new CallbackHttpError(
        response.status,
        errMessage || response.statusText
      );
    }

    const resBody = (await response.json().catch(() => ({ success: true }))) as JobCallbackSuccessResponse;
    return {
      success: true,
      ...(resBody.ignored ? { ignored: resBody.ignored } : {}),
      ...(resBody.message ? { message: resBody.message } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Callback request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Delivers the callback with retry for transient failures (network errors, 5xx).
 * Does NOT retry 4xx errors (e.g. 400 validation error, 401 unauthorized),
 * as those are authoritative client/contract rejections from the backend.
 */
export async function postJobCallbackWithRetry(
  backendUrl: string,
  callbackSecret: string,
  payload: JobCallbackPayload,
  options: CallbackRetryOptions = {}
): Promise<JobCallbackSuccessResponse> {
  const retries = options.retries ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const timeoutMs = options.timeoutMs;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await postJobCallback(backendUrl, callbackSecret, payload, {
        timeoutMs,
      });
    } catch (error) {
      // 4xx errors are not transient; fail immediately without retry
      if (error instanceof CallbackHttpError && error.isClientError) {
        throw error;
      }

      if (attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } else {
        throw error;
      }
    }
  }

  throw new Error("Callback delivery retries exhausted");
}
