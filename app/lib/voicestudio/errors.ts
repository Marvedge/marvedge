/**
 * VoiceStudio Typed Error Definitions (Task-00103)
 * Provides structured, classified errors with strict secret redaction.
 */

import type { VoiceStudioErrorCode, VoiceStudioErrorDetails } from "./types";

/**
 * Sanitizes messages to guarantee API keys or credentials never leak in logs or stack traces.
 */
export function sanitizeMessage(raw: string, sensitiveValues: (string | undefined)[]): string {
  let cleaned = raw;
  for (const secret of sensitiveValues) {
    if (secret && secret.trim().length > 3) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(escaped, "g"), "[REDACTED_API_KEY]");
    }
  }
  return cleaned;
}

export class VoiceStudioError extends Error implements VoiceStudioErrorDetails {
  public readonly code: VoiceStudioErrorCode;
  public readonly statusCode?: number;
  public readonly retryAfterSec?: number;
  public readonly isRetryable: boolean;

  constructor(
    code: VoiceStudioErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      retryAfterSec?: number;
      isRetryable?: boolean;
      sensitiveValues?: (string | undefined)[];
      cause?: unknown;
    }
  ) {
    const sanitized = sanitizeMessage(message, options?.sensitiveValues || []);
    super(sanitized);
    this.name = "VoiceStudioError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryAfterSec = options?.retryAfterSec;
    this.isRetryable = options?.isRetryable ?? false;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export class VoiceStudioAuthError extends VoiceStudioError {
  constructor(message: string, statusCode: number = 401, sensitiveValues?: (string | undefined)[]) {
    super(statusCode === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message, {
      statusCode,
      isRetryable: false,
      sensitiveValues,
    });
    this.name = "VoiceStudioAuthError";
  }
}

export class VoiceStudioRateLimitError extends VoiceStudioError {
  constructor(message: string, retryAfterSec: number = 30, sensitiveValues?: (string | undefined)[]) {
    super("RATE_LIMITED", message, {
      statusCode: 429,
      retryAfterSec,
      isRetryable: true,
      sensitiveValues,
    });
    this.name = "VoiceStudioRateLimitError";
  }
}

export class VoiceStudioUnavailableError extends VoiceStudioError {
  constructor(message: string, retryAfterSec: number = 5, sensitiveValues?: (string | undefined)[]) {
    super("SERVICE_UNAVAILABLE", message, {
      statusCode: 503,
      retryAfterSec,
      isRetryable: true,
      sensitiveValues,
    });
    this.name = "VoiceStudioUnavailableError";
  }
}

export class VoiceStudioTimeoutError extends VoiceStudioError {
  constructor(message: string, timeoutMs: number) {
    super("TIMEOUT", `${message} (timed out after ${timeoutMs}ms)`, {
      isRetryable: false,
    });
    this.name = "VoiceStudioTimeoutError";
  }
}

export class VoiceStudioAudioValidationError extends VoiceStudioError {
  constructor(message: string) {
    super("AUDIO_VALIDATION_FAILED", message, {
      isRetryable: false,
    });
    this.name = "VoiceStudioAudioValidationError";
  }
}

export class VoiceStudioInferenceError extends VoiceStudioError {
  constructor(message: string, statusCode: number = 500, sensitiveValues?: (string | undefined)[]) {
    super("INFERENCE_FAILED", message, {
      statusCode,
      isRetryable: false,
      sensitiveValues,
    });
    this.name = "VoiceStudioInferenceError";
  }
}
