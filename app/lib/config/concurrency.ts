// Worker concurrency configuration and benchmark validation (Task-00094).
//
// Enforces that in production environments, concurrency must match the benchmark-approved
// value of 4 (Sprint 1 / Task-00081 / docs/GPU_COST_CONCURRENCY.md) for safe GPU throughput
// without VRAM collision.
//
// In development/test environments, does NOT silently raise defaults (defaults to 1).
// Rejects invalid values (NaN, negative, zero, non-integer) across all environments.

export const BENCHMARK_APPROVED_CONCURRENCY = 4;

export interface ValidateConcurrencyOptions {
  isProduction?: boolean;
  requireBenchmarkApproved?: boolean;
  defaultNonProd?: number;
}

/**
 * Validates and parses worker concurrency setting.
 *
 * @param rawVal Value from process.env (or number)
 * @param varName Variable name for clear error reporting (e.g. "REFRAME_WORKER_CONCURRENCY")
 * @param options Validation options (environment, benchmark requirement)
 */
export function validateWorkerConcurrency(
  rawVal: string | number | undefined | null,
  varName: string,
  options: ValidateConcurrencyOptions = {}
): number {
  const isProduction =
    options.isProduction ?? (process.env.NODE_ENV === "production");
  const requireBenchmarkApproved =
    options.requireBenchmarkApproved ?? isProduction;
  const defaultNonProd = options.defaultNonProd ?? 1;

  // If value is explicitly provided
  if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
    const str = String(rawVal).trim();
    // Validate integer format (reject floats like 1.5, scientific notation, strings like "abc")
    if (!/^-?\d+$/.test(str)) {
      throw new Error(
        `Invalid ${varName}: "${rawVal}". Concurrency must be a positive integer.`
      );
    }

    const parsed = Number.parseInt(str, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(
        `Invalid ${varName}: "${rawVal}". Concurrency must be a positive integer greater than or equal to 1.`
      );
    }

    if (requireBenchmarkApproved && parsed !== BENCHMARK_APPROVED_CONCURRENCY) {
      throw new Error(
        `Production concurrency misconfiguration for ${varName}: received ${parsed}, but benchmark-approved setting is ${BENCHMARK_APPROVED_CONCURRENCY}. (See docs/GPU_COST_CONCURRENCY.md)`
      );
    }

    return parsed;
  }

  // Value is omitted / empty
  if (requireBenchmarkApproved) {
    throw new Error(
      `Missing required production concurrency setting: ${varName} must be explicitly set to the benchmark-approved value ${BENCHMARK_APPROVED_CONCURRENCY}.`
    );
  }

  return defaultNonProd;
}
