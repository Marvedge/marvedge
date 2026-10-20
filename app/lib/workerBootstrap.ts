import * as fs from "node:fs";
import * as path from "node:path";

export interface EnvFileUpdateOptions {
  envFilePath: string;
  newEntries: Record<string, string>;
  mode?: number;
}

/**
 * Safely and idempotently writes or updates an environment file.
 * - Replaces existing keys cleanly without creating duplicate keys
 * - Appends new keys that were not previously present
 * - Sets strict file permissions (default 0o600: read/write by owner only)
 * - Writes via temporary file before replacing to prevent corruption
 */
export function updateEnvFileIdempotent(options: EnvFileUpdateOptions): void {
  const { envFilePath, newEntries, mode = 0o600 } = options;
  const dir = path.dirname(envFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  let lines: string[] = [];
  if (fs.existsSync(envFilePath)) {
    const existingContent = fs.readFileSync(envFilePath, "utf-8");
    lines = existingContent.split(/\r?\n/);
  }

  const updatedKeys = new Set<string>();
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      newLines.push(line);
      continue;
    }

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      newLines.push(line);
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    if (Object.prototype.hasOwnProperty.call(newEntries, key)) {
      const val = newEntries[key];
      newLines.push(`${key}="${val}"`);
      updatedKeys.add(key);
    } else {
      newLines.push(line);
    }
  }

  // Append remaining entries that were not in existing file
  for (const [key, val] of Object.entries(newEntries)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}="${val}"`);
    }
  }

  const finalContent = newLines.join("\n") + "\n";
  const tmpPath = `${envFilePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, finalContent, { encoding: "utf-8", mode });
  try { fs.chmodSync(tmpPath, mode); } catch {}
  fs.renameSync(tmpPath, envFilePath);
  try { fs.chmodSync(envFilePath, mode); } catch {}
}

/**
 * Represents the raw|filtered SSM parameters retrieved from AWS SSM Parameter Store.
 */
export interface SsmWorkerParameters {
  WORKER_SECRET: string;
  DEEPGRAM_API_KEY: string;
  CALLBACK_SECRET: string;
  REDIS_URL: string;
  BACKEND_URL: string;
  WORKER_CONCURRENCY?: string;
}

/**
 * Parses raw SSM get-parameters-by-path output (aws cli JSON shape).
 * Handles shapes such as { Parameters: [{ Name, Value }, ...], NextToken: string }
 * or raw arrays [{ Name, Value }, ...].
 * Throws if NextToken is present (unhandled pagination means the list may be truncated).
 */
export function parseSsmCliOutput(rawInput: unknown): Partial<SsmWorkerParameters> {
  let params: Array<{ Name?: string; Value?: string }> = [];

  if (Array.isArray(rawInput)) {
    params = rawInput;
  } else if (rawInput && typeof rawInput === "object") {
    const obj = rawInput as Record<string, unknown>;
    if (obj.NextToken) {
      throw new Error(
        "SSM parameter query result was truncated (NextToken was returned). Pagination is required to guarantee all secrets are loaded."
      );
    }
    if (Array.isArray(obj.Parameters)) {
      params = obj.Parameters as Array<{ Name?: string; Value?: string }>;
    }
  }

  const result: Record<string, string> = {};
  for (const param of params) {
    if (!param.Name || param.Value === undefined) continue;
    const parts = param.Name.split("/");
    const key = parts[parts.length - 1];
    if (key) {
      result[key] = param.Value.trim();
    }
  }
  return result as Partial<SsmWorkerParameters>;
}

/**
 * Alias for backwards compatibility with earlier tests.
 */
export const parseSsmParameters = parseSsmCliOutput;

/**
 * Validates and writes complete worker configuration.
 * Throws if required secrets are missing or empty.
 */
export function bootstrapWorkerConfig(
  envFilePath: string,
  parameters: Partial<SsmWorkerParameters>,
  additionalEntries: Record<string, string> = {},
  options: { requireAllProdSecrets?: boolean } = {}
): void {
  const missing: string[] = [];

  const workerSecret = parameters.WORKER_SECRET?.trim();
  if (!workerSecret) missing.push("WORKER_SECRET");

  const deepgramKey = parameters.DEEPGRAM_API_KEY?.trim();
  if (!deepgramKey) missing.push("DEEPGRAM_API_KEY");

  if (options.requireAllProdSecrets) {
    if (!parameters.CALLBACK_SECRET?.trim()) missing.push("CALLBACK_SECRET");
    if (!parameters.REDIS_URL?.trim()) missing.push("REDIS_URL");
    if (!parameters.BACKEND_URL?.trim()) missing.push("BACKEND_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Worker bootstrap failed: missing required secret parameters: ${missing.join(", ")}`
    );
  }

  const entriesToUpdate: Record<string, string> = {
    ...additionalEntries,
    WORKER_SECRET: workerSecret!,
    DEEPGRAM_API_KEY: deepgramKey!,
  };

  if (parameters.REDIS_URL?.trim()) {
    entriesToUpdate.REDIS_URL = parameters.REDIS_URL.trim();
  }
  if (parameters.BACKEND_URL?.trim()) {
    entriesToUpdate.BACKEND_URL = parameters.BACKEND_URL.trim();
  }
  if (parameters.CALLBACK_SECRET?.trim()) {
    entriesToUpdate.CALLBACK_SECRET = parameters.CALLBACK_SECRET.trim();
  }
  if (parameters.WORKER_CONCURRENCY?.trim()) {
    entriesToUpdate.WORKER_CONCURRENCY = parameters.WORKER_CONCURRENCY.trim();
  }

  updateEnvFileIdempotent({
    envFilePath,
    newEntries: entriesToUpdate,
    mode: 0o600,
  });
}
