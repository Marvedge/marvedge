import { describe, expect, it } from "vitest";
import {
  BENCHMARK_APPROVED_CONCURRENCY,
  validateWorkerConcurrency,
} from "./concurrency";

describe("Worker Concurrency Configuration (Task-00094)", () => {
  describe("Valid numeric inputs in non-production", () => {
    it("parses valid integer strings", () => {
      expect(validateWorkerConcurrency("1", "TEST_CONCURRENCY", { isProduction: false })).toBe(1);
      expect(validateWorkerConcurrency("4", "TEST_CONCURRENCY", { isProduction: false })).toBe(4);
      expect(validateWorkerConcurrency("8", "TEST_CONCURRENCY", { isProduction: false })).toBe(8);
      expect(validateWorkerConcurrency(2, "TEST_CONCURRENCY", { isProduction: false })).toBe(2);
    });

    it("defaults to 1 when omitted in non-production", () => {
      expect(validateWorkerConcurrency(undefined, "TEST_CONCURRENCY", { isProduction: false })).toBe(1);
      expect(validateWorkerConcurrency("", "TEST_CONCURRENCY", { isProduction: false })).toBe(1);
    });

    it("respects custom defaultNonProd", () => {
      expect(validateWorkerConcurrency(undefined, "TEST_CONCURRENCY", { isProduction: false, defaultNonProd: 2 })).toBe(2);
    });
  });

  describe("Rejection of invalid inputs", () => {
    it("rejects non-numeric string values", () => {
      expect(() => validateWorkerConcurrency("abc", "WORKER_CONCURRENCY")).toThrowError(
        /Invalid WORKER_CONCURRENCY.*must be a positive integer/i
      );
    });

    it("rejects floating point strings", () => {
      expect(() => validateWorkerConcurrency("2.5", "WORKER_CONCURRENCY")).toThrowError(
        /Invalid WORKER_CONCURRENCY.*must be a positive integer/i
      );
    });

    it("rejects zero", () => {
      expect(() => validateWorkerConcurrency("0", "WORKER_CONCURRENCY")).toThrowError(
        /Invalid WORKER_CONCURRENCY.*greater than or equal to 1/
      );
    });

    it("rejects negative numbers", () => {
      expect(() => validateWorkerConcurrency("-4", "WORKER_CONCURRENCY")).toThrowError(
        /Invalid WORKER_CONCURRENCY.*must be a positive integer/i
      );
    });
  });

  describe("Production benchmark-approved enforcement", () => {
    it("accepts benchmark-approved concurrency 4 in production", () => {
      const val = validateWorkerConcurrency("4", "REFRAME_WORKER_CONCURRENCY", {
        isProduction: true,
      });
      expect(val).toBe(BENCHMARK_APPROVED_CONCURRENCY);
    });

    it("throws in production when concurrency is not 4", () => {
      expect(() =>
        validateWorkerConcurrency("1", "REFRAME_WORKER_CONCURRENCY", {
          isProduction: true,
        })
      ).toThrowError(/Production concurrency misconfiguration for REFRAME_WORKER_CONCURRENCY.*received 1, but benchmark-approved setting is 4/);

      expect(() =>
        validateWorkerConcurrency("8", "WORKER_CONCURRENCY", {
          isProduction: true,
        })
      ).toThrowError(/Production concurrency misconfiguration for WORKER_CONCURRENCY.*received 8, but benchmark-approved setting is 4/);
    });

    it("throws in production when concurrency is omitted", () => {
      expect(() =>
        validateWorkerConcurrency(undefined, "WORKER_CONCURRENCY", {
          isProduction: true,
        })
      ).toThrowError(/Missing required production concurrency setting: WORKER_CONCURRENCY/);
    });
  });
});
