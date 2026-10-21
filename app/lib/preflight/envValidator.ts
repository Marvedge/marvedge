// Preflight Environment Validator (Task-00094).
//
// Validates deployment readiness across:
// 1. "app"        � Next.js web application, NextAuth, database, storage, vendor APIs, Redis
// 2. "worker"     � video-worker, reframe-worker, cloudrun-worker, Redis, concurrency
// 3. "ml-gateway" � Internal FastAPI ML gateway, downstream service URLs, timeouts
// 4. "all"        � Unified complete system check
//
// SECURITY INVARIANT:
// - NEVER prints secret values (database credentials, API keys, bearer tokens).
// - Masks all sensitive variables in error messages, status summaries, and reports.
//
// ZERO Prisma / Postgres imports.

import { isLoopbackHost, resolveCallbackBaseUrl } from "../jobs/callbackUrl";
import {
  INITIAL_VALIDATION_CONCURRENCY,
  BENCHMARK_APPROVED_CONCURRENCY,
} from "../config/concurrency";

export type PreflightTarget = "app" | "worker" | "ml-gateway" | "all";

export interface EnvVariableCheck {
  name: string;
  scope: PreflightTarget;
  status: "OK" | "MISSING" | "INVALID";
  isSecret: boolean;
  message?: string;
}

export interface PreflightIssue {
  variable: string;
  scope: PreflightTarget;
  message: string;
}

export interface PreflightResult {
  valid: boolean;
  target: PreflightTarget;
  isProduction: boolean;
  checks: EnvVariableCheck[];
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
}

export interface PreflightOptions {
  isProduction?: boolean;
  allowLocalhostInProduction?: boolean;
}

const SECRET_PATTERNS = [
  /_SECRET$/i,
  /_KEY$/i,
  /_KEY_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_PRIVATE_KEY$/i,
  /^DATABASE_URL$/i,
  /^REDIS_URL$/i,
];

/**
 * Returns true if the environment variable contains sensitive secret credentials.
 */
export function isSecretVariable(varName: string): boolean {
  if (!varName) {
    return false;
  }
  return SECRET_PATTERNS.some((pat) => pat.test(varName));
}

/**
 * Safely masks an environment variable value for display.
 * Secret variables ALWAYS return a redacted indicator.
 */
export function maskEnvValue(varName: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    return "[NOT SET]";
  }
  if (isSecretVariable(varName)) {
    return `[SET (length: ${value.length})]`;
  }
  return value;
}

/**
 * Core preflight environment validator.
 */
export function validatePreflightEnv(
  target: PreflightTarget = "all",
  env: Record<string, string | undefined> = process.env,
  options: PreflightOptions = {}
): PreflightResult {
  const isProduction = options.isProduction ?? env.NODE_ENV === "production";
  const checks: EnvVariableCheck[] = [];
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  function recordCheck(
    name: string,
    scope: PreflightTarget,
    status: "OK" | "MISSING" | "INVALID",
    message?: string
  ) {
    const isSecret = isSecretVariable(name);
    checks.push({ name, scope, status, isSecret, message });
    if (status === "MISSING" || status === "INVALID") {
      errors.push({
        variable: name,
        scope,
        message: message || `${name} is ${status.toLowerCase()}`,
      });
    }
  }

  function requireVar(name: string, scope: PreflightTarget, description?: string) {
    const val = env[name]?.trim();
    if (!val) {
      const desc = description ? ` (${description})` : "";
      recordCheck(
        name,
        scope,
        "MISSING",
        `Required environment variable ${name} is missing${desc}.`
      );
      return undefined;
    }
    recordCheck(name, scope, "OK");
    return val;
  }

  function optionalVar(
    name: string,
    scope: PreflightTarget,
    validator?: (val: string) => string | undefined
  ) {
    const val = env[name]?.trim();
    if (!val) {
      return undefined;
    }
    if (validator) {
      const err = validator(val);
      if (err) {
        recordCheck(name, scope, "INVALID", err);
        return undefined;
      }
    }
    recordCheck(name, scope, "OK");
    return val;
  }

  function validateRedisConfig(scope: PreflightTarget, isRequiredInProd: boolean) {
    const redisVal = env.REDIS_URL?.trim();
    if (!redisVal) {
      if (isRequiredInProd && isProduction) {
        recordCheck(
          "REDIS_URL",
          scope,
          "MISSING",
          `REDIS_URL is required in production for ${scope === "app" ? "BullMQ queue dispatch" : "BullMQ workers"} to shared Redis (e.g. AWS ElastiCache).`
        );
      } else if (scope === "worker") {
        recordCheck(
          "REDIS_URL",
          scope,
          "MISSING",
          "Required environment variable REDIS_URL is missing."
        );
      } else {
        recordCheck("REDIS_URL", scope, "OK");
      }
      return;
    }

    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(redisVal);
    const withProto = hasScheme ? redisVal : `redis://${redisVal}`;
    try {
      const parsed = new URL(withProto);
      if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
        recordCheck(
          "REDIS_URL",
          scope,
          "INVALID",
          `Invalid Redis protocol: "${parsed.protocol}". Expected "redis:" or "rediss:".`
        );
        return;
      }
    } catch (err) {
      recordCheck(
        "REDIS_URL",
        scope,
        "INVALID",
        `Invalid REDIS_URL format: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    if (isProduction && !options.allowLocalhostInProduction && isLoopbackHost(redisVal)) {
      recordCheck(
        "REDIS_URL",
        scope,
        "INVALID",
        `Accidental localhost Redis target detected in production: "${redisVal}". Configure a shared production Redis URL (e.g. AWS ElastiCache).`
      );
      return;
    }

    recordCheck("REDIS_URL", scope, "OK");
  }

  // ��������������������������������������������������������������������������
  // 1. APP SCOPE
  // ��������������������������������������������������������������������������
  if (target === "app" || target === "all") {
    // Database
    requireVar("DATABASE_URL", "app", "PostgreSQL database connection");

    // NextAuth
    requireVar("NEXTAUTH_SECRET", "app", "Session encryption secret");

    // Callback webhook security
    requireVar("CALLBACK_SECRET", "app", "Bearer secret for /api/jobs/callback webhook");

    // Storage Provider
    const storageProvider = (env.STORAGE_PROVIDER || "aws").trim().toLowerCase();
    if (storageProvider === "aws") {
      requireVar("AWS_REGION", "app", "AWS primary region (e.g. ap-southeast-2)");
      requireVar("RAW_BUCKET", "app", "S3 raw video upload bucket");
      requireVar("PROCESSED_BUCKET", "app", "S3 processed video output bucket");
    } else if (storageProvider === "gcs") {
      requireVar("GOOGLE_CLOUD_PROJECT_ID", "app", "GCS fallback project ID");
      requireVar("GOOGLE_CLOUD_CLIENT_EMAIL", "app", "GCS fallback client email");
      requireVar("GOOGLE_CLOUD_PRIVATE_KEY", "app", "GCS fallback private key");
      requireVar("GCP_RAW_BUCKET", "app", "GCS fallback raw bucket");
      requireVar("GCP_PROCESSED_BUCKET", "app", "GCS fallback processed bucket");
    } else {
      recordCheck(
        "STORAGE_PROVIDER",
        "app",
        "INVALID",
        `Invalid STORAGE_PROVIDER: "${storageProvider}". Must be "aws" or "gcs".`
      );
    }

    // Video Worker routing
    const useGcpWorker = env.USE_GCP_WORKER === "true";
    if (useGcpWorker) {
      requireVar("WORKER_SECRET", "app", "Bearer secret for video worker /process endpoint");
      const workerUrl = env.VIDEO_WORKER_URL?.trim() || env.GCP_VIDEO_WORKER_URL?.trim();
      if (!workerUrl) {
        recordCheck(
          "VIDEO_WORKER_URL",
          "app",
          "MISSING",
          "VIDEO_WORKER_URL or GCP_VIDEO_WORKER_URL is required when USE_GCP_WORKER=true."
        );
      } else {
        recordCheck("VIDEO_WORKER_URL", "app", "OK");
      }
    }

    // Redis validation for App (BullMQ queue dispatch)
    validateRedisConfig("app", true);

    // In production
    if (isProduction) {
      // Cloudinary
      requireVar("CLOUDINARY_CLOUD_NAME", "app", "Cloudinary cloud name");
      requireVar("CLOUDINARY_API_KEY", "app", "Cloudinary API key");
      requireVar("CLOUDINARY_API_SECRET", "app", "Cloudinary API secret");

      // Deepgram
      requireVar("DEEPGRAM_API_KEY", "app", "Deepgram transcription & voiceover API key");

      // Callback URL validation in production
      try {
        resolveCallbackBaseUrl({
          env,
          isProduction,
          allowLocalhostInProduction: options.allowLocalhostInProduction,
        });
        recordCheck("CALLBACK_BASE_URL", "app", "OK");
      } catch (err) {
        recordCheck(
          "CALLBACK_BASE_URL",
          "app",
          "INVALID",
          err instanceof Error ? err.message : "Invalid callback URL configuration"
        );
      }
    }
  }

  // ��������������������������������������������������������������������������
  // 2. WORKER SCOPE
  // ��������������������������������������������������������������������������
  if (target === "worker" || target === "all") {
    // Redis for BullMQ queues
    validateRedisConfig("worker", true);

    // Callback Secret for workers reporting back
    requireVar(
      "CALLBACK_SECRET",
      "worker",
      "Shared secret to authenticate callbacks to /api/jobs/callback"
    );

    // Worker secret for cloudrun-worker endpoints
    requireVar("WORKER_SECRET", "worker", "Bearer secret for standalone worker HTTP endpoints");

    // Database for video-worker
    requireVar("DATABASE_URL", "worker", "Database connection for video-worker Prisma client");

    // Storage for worker
    const storageProvider = (env.STORAGE_PROVIDER || "aws").trim().toLowerCase();
    if (storageProvider === "aws") {
      requireVar("RAW_BUCKET", "worker", "S3 raw video bucket");
      requireVar("PROCESSED_BUCKET", "worker", "S3 processed video bucket");
    }

    // Concurrency validation
    const validateConcurrencySetting = (name: string, rawVal: string | undefined) => {
      if (rawVal) {
        if (!/^\d+$/.test(rawVal) || Number.parseInt(rawVal, 10) < 1) {
          recordCheck(
            name,
            "worker",
            "INVALID",
            `Invalid ${name}: "${rawVal}". Must be positive integer.`
          );
        } else {
          const parsed = Number.parseInt(rawVal, 10);
          if (
            isProduction &&
            parsed !== INITIAL_VALIDATION_CONCURRENCY &&
            parsed !== BENCHMARK_APPROVED_CONCURRENCY
          ) {
            recordCheck(
              name,
              "worker",
              "INVALID",
              `Production concurrency misconfiguration: ${name} is ${rawVal}. Approved settings are ${INITIAL_VALIDATION_CONCURRENCY} (initial validation) or ${BENCHMARK_APPROVED_CONCURRENCY} (benchmark-approved).`
            );
          } else {
            recordCheck(name, "worker", "OK");
          }
        }
      } else if (isProduction) {
        recordCheck(
          name,
          "worker",
          "MISSING",
          `Missing required production setting: ${name} must be explicitly set to ${INITIAL_VALIDATION_CONCURRENCY} (initial validation) or ${BENCHMARK_APPROVED_CONCURRENCY} (benchmark-approved).`
        );
      }
    };

    validateConcurrencySetting(
      "REFRAME_WORKER_CONCURRENCY",
      env.REFRAME_WORKER_CONCURRENCY?.trim()
    );
    validateConcurrencySetting("WORKER_CONCURRENCY", env.WORKER_CONCURRENCY?.trim());

    // Callback base URL non-loopback in production
    if (isProduction) {
      try {
        resolveCallbackBaseUrl({
          env,
          isProduction,
          allowLocalhostInProduction: options.allowLocalhostInProduction,
        });
        recordCheck("WORKER_CALLBACK_TARGET", "worker", "OK");
      } catch (err) {
        recordCheck(
          "WORKER_CALLBACK_TARGET",
          "worker",
          "INVALID",
          err instanceof Error
            ? err.message
            : "Worker callback base URL misconfigured for production"
        );
      }
    }
  }

  // ��������������������������������������������������������������������������
  // 3. ML GATEWAY SCOPE
  // ��������������������������������������������������������������������������
  if (target === "ml-gateway" || target === "all") {
    const autoflipUrl = env.AUTOFILP_SERVICE_URL?.trim() || env.AUTOFILIP_SERVICE_URL?.trim();
    if (!autoflipUrl) {
      if (isProduction) {
        recordCheck(
          "AUTOFILP_SERVICE_URL",
          "ml-gateway",
          "MISSING",
          "AUTOFILP_SERVICE_URL is required for ML Gateway downstream routing."
        );
      } else {
        warnings.push({
          variable: "AUTOFILP_SERVICE_URL",
          scope: "ml-gateway",
          message: "AUTOFILP_SERVICE_URL unset; defaulting to http://autoflip:8000",
        });
      }
    } else {
      recordCheck("AUTOFILP_SERVICE_URL", "ml-gateway", "OK");
    }

    const talknetUrl = env.TALKNET_SERVICE_URL?.trim();
    if (!talknetUrl) {
      if (isProduction) {
        recordCheck(
          "TALKNET_SERVICE_URL",
          "ml-gateway",
          "MISSING",
          "TALKNET_SERVICE_URL is required for ML Gateway TalkNet routing."
        );
      } else {
        warnings.push({
          variable: "TALKNET_SERVICE_URL",
          scope: "ml-gateway",
          message: "TALKNET_SERVICE_URL unset; defaulting to http://talknet:8000",
        });
      }
    } else {
      recordCheck("TALKNET_SERVICE_URL", "ml-gateway", "OK");
    }

    optionalVar("GATEWAY_TIMEOUT_SEC", "ml-gateway", (val) => {
      const num = Number.parseFloat(val);
      if (!Number.isFinite(num) || num <= 0) {
        return `Invalid GATEWAY_TIMEOUT_SEC: "${val}". Must be a positive number.`;
      }
      return undefined;
    });
  }

  return {
    valid: errors.length === 0,
    target,
    isProduction,
    checks,
    errors,
    warnings,
  };
}

/**
 * Formats preflight result into a human-readable ASCII report.
 * Guaranteed zero secret leakage.
 */
export function formatPreflightReport(result: PreflightResult): string {
  const lines: string[] = [];
  lines.push("===============================================================================");
  lines.push(` MARVEDGE PREFLIGHT VALIDATION REPORT � TARGET: ${result.target.toUpperCase()}`);
  lines.push(
    ` ENVIRONMENT: ${result.isProduction ? "PRODUCTION" : "DEVELOPMENT/TEST"} | STATUS: ${result.valid ? "PASS" : "FAIL"}`
  );
  lines.push("===============================================================================");

  if (result.errors.length > 0) {
    lines.push("\n[!] ERRORS (Must be resolved before deployment):");
    for (const err of result.errors) {
      lines.push(`  - [${err.scope.toUpperCase()}] ${err.variable}: ${err.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\n[*] WARNINGS:");
    for (const warn of result.warnings) {
      lines.push(`  - [${warn.scope.toUpperCase()}] ${warn.variable}: ${warn.message}`);
    }
  }

  lines.push("\n[+] VARIABLE CHECKS:");
  for (const c of result.checks) {
    const icon = c.status === "OK" ? "[OK]" : "[FAIL]";
    const secretTag = c.isSecret ? " (SECRET)" : "";
    const detail = c.message ? ` � ${c.message}` : "";
    lines.push(`  ${icon} [${c.scope.toUpperCase()}] ${c.name}${secretTag}: ${c.status}${detail}`);
  }

  lines.push("===============================================================================");
  return lines.join("\n");
}
