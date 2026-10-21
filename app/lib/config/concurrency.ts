// Worker concurrency configuration and benchmark validation (Task-00094).
//
// Enforces that in production environments, concurrency must match an approved setting:
// - Concurrency 1 for initial validation and safe startup (Sprint 1 / Task-00094)
// - Concurrency 4 for full benchmark-approved throughput without VRAM collision
//   (Sprint 1 / Task-00081 / docs/GPU_COST_CONCURRENCY.md)
//
// In development/test environments, does NOT silently raise defaults (defaults to 1).
// Rejects invalid values (NaN, negative, zero, non-integer, >4) across all environments.

export const INITIAL_VALIDATION_CONCURRENCY = 1;
export const BENCHMARK_APPROVED_CONCURRENCY = 4;
export const APPROVED_CONCURRENCIES = [
  INITIAL_VALIDATION_CONCURRENCY,
  BENCHMARK_APPROVED_CONCURRENCY,
] as const;

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
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  const requireBenchmarkApproved = options.requireBenchmarkApproved ?? isProduction;
  const defaultNonProd = options.defaultNonProd ?? INITIAL_VALIDATION_CONCURRENCY;

  // If value is explicitly provided
  if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
    const str = String(rawVal).trim();
    // Validate integer format (reject floats like 1.5, scientific notation, strings like "abc")
    if (!/^-?\d+$/.test(str)) {
      throw new Error(`Invalid ${varName}: "${rawVal}". Concurrency must be a positive integer.`);
    }

    const parsed = Number.parseInt(str, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(
        `Invalid ${varName}: "${rawVal}". Concurrency must be a positive integer greater than or equal to 1.`
      );
    }

    if (
      requireBenchmarkApproved &&
      parsed !== INITIAL_VALIDATION_CONCURRENCY &&
      parsed !== BENCHMARK_APPROVED_CONCURRENCY
    ) {
      throw new Error(
        `Production concurrency misconfiguration for ${varName}: received ${parsed}. Approved settings are ${INITIAL_VALIDATION_CONCURRENCY} (initial validation) or ${BENCHMARK_APPROVED_CONCURRENCY} (benchmark-approved). (See docs/GPU_COST_CONCURRENCY.md)`
      );
    }

    return parsed;
  }

  // Value is omitted / empty
  if (requireBenchmarkApproved) {
    throw new Error(
      `Missing required production concurrency setting: ${varName} must be explicitly set to an approved value (${INITIAL_VALIDATION_CONCURRENCY} for initial validation or ${BENCHMARK_APPROVED_CONCURRENCY} for benchmark load).`
    );
  }

  return defaultNonProd;
}
