import { describe, expect, it } from "vitest";
import {
  formatPreflightReport,
  isSecretVariable,
  maskEnvValue,
  validatePreflightEnv,
} from "./envValidator";

describe("Preflight Environment Validator (Task-00094)", () => {
  describe("Secret variable detection and masking", () => {
    it("identifies sensitive variables as secrets", () => {
      expect(isSecretVariable("DATABASE_URL")).toBe(true);
      expect(isSecretVariable("REDIS_URL")).toBe(true);
      expect(isSecretVariable("CALLBACK_SECRET")).toBe(true);
      expect(isSecretVariable("WORKER_SECRET")).toBe(true);
      expect(isSecretVariable("NEXTAUTH_SECRET")).toBe(true);
      expect(isSecretVariable("DEEPGRAM_API_KEY")).toBe(true);
      expect(isSecretVariable("CLOUDINARY_API_SECRET")).toBe(true);
      expect(isSecretVariable("GOOGLE_CLOUD_PRIVATE_KEY")).toBe(true);
    });

    it("identifies non-sensitive variables as public", () => {
      expect(isSecretVariable("AWS_REGION")).toBe(false);
      expect(isSecretVariable("RAW_BUCKET")).toBe(false);
      expect(isSecretVariable("PROCESSED_BUCKET")).toBe(false);
      expect(isSecretVariable("STORAGE_PROVIDER")).toBe(false);
      expect(isSecretVariable("REFRAME_WORKER_CONCURRENCY")).toBe(false);
      expect(isSecretVariable("GATEWAY_TIMEOUT_SEC")).toBe(false);
    });

    it("never exposes secret values via maskEnvValue", () => {
      const secretVal = "super-secret-password-12345";
      const masked = maskEnvValue("DATABASE_URL", secretVal);
      expect(masked).not.toContain(secretVal);
      expect(masked).toBe("[SET (length: 27)]");
    });
  });

  describe("Scope: App validation", () => {
    it("fails when core app variables are missing", () => {
      const result = validatePreflightEnv("app", {}, { isProduction: false });
      expect(result.valid).toBe(false);
      const errorVars = result.errors.map((e) => e.variable);
      expect(errorVars).toContain("DATABASE_URL");
      expect(errorVars).toContain("NEXTAUTH_SECRET");
      expect(errorVars).toContain("CALLBACK_SECRET");
      expect(errorVars).toContain("RAW_BUCKET");
      expect(errorVars).toContain("PROCESSED_BUCKET");
    });

    it("passes when all app variables are present in development", () => {
      const mockEnv = {
        DATABASE_URL: "postgresql://localhost:5432/marvedge",
        NEXTAUTH_SECRET: "test-auth-secret",
        CALLBACK_SECRET: "test-cb-secret",
        STORAGE_PROVIDER: "aws",
        AWS_REGION: "ap-southeast-2",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
      };
      const result = validatePreflightEnv("app", mockEnv, { isProduction: false });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("enforces production app requirements (Cloudinary, Deepgram, Redis, non-loopback callback)", () => {
      const devEnv = {
        DATABASE_URL: "postgresql://rds/marvedge",
        NEXTAUTH_SECRET: "prod-auth-secret",
        CALLBACK_SECRET: "prod-cb-secret",
        STORAGE_PROVIDER: "aws",
        AWS_REGION: "ap-southeast-2",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
      };
      const result = validatePreflightEnv("app", devEnv, { isProduction: true });
      expect(result.valid).toBe(false);
      const errorVars = result.errors.map((e) => e.variable);
      expect(errorVars).toContain("CLOUDINARY_CLOUD_NAME");
      expect(errorVars).toContain("DEEPGRAM_API_KEY");
      expect(errorVars).toContain("CALLBACK_BASE_URL");
      expect(errorVars).toContain("REDIS_URL");
    });

    it("detects unsafe localhost Redis configuration in production", () => {
      const prodEnvWithLocalhostRedis = {
        DATABASE_URL: "postgresql://rds/marvedge",
        NEXTAUTH_SECRET: "prod-auth-secret",
        CALLBACK_SECRET: "prod-cb-secret",
        STORAGE_PROVIDER: "aws",
        AWS_REGION: "ap-southeast-2",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
        CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "key",
        CLOUDINARY_API_SECRET: "sec",
        DEEPGRAM_API_KEY: "dg-key",
        BACKEND_URL: "https://api.marvedge.com",
        REDIS_URL: "redis://localhost:6379",
      };
      const result = validatePreflightEnv("app", prodEnvWithLocalhostRedis, { isProduction: true });
      expect(result.valid).toBe(false);
      const redisErr = result.errors.find((e) => e.variable === "REDIS_URL");
      expect(redisErr?.message).toContain(
        "Accidental localhost Redis target detected in production"
      );
    });
  });

  describe("Scope: Worker validation", () => {
    it("fails when worker variables are missing", () => {
      const result = validatePreflightEnv("worker", {}, { isProduction: false });
      expect(result.valid).toBe(false);
      const errorVars = result.errors.map((e) => e.variable);
      expect(errorVars).toContain("REDIS_URL");
      expect(errorVars).toContain("CALLBACK_SECRET");
      expect(errorVars).toContain("WORKER_SECRET");
      expect(errorVars).toContain("DATABASE_URL");
    });

    it("accepts initial validation concurrency 1 in production for workers", () => {
      const workerEnv = {
        REDIS_URL: "redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379",
        CALLBACK_SECRET: "cb-sec",
        WORKER_SECRET: "w-sec",
        DATABASE_URL: "postgresql://rds/marvedge",
        STORAGE_PROVIDER: "aws",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
        BACKEND_URL: "https://api.marvedge.com",
        WORKER_CONCURRENCY: "1",
        REFRAME_WORKER_CONCURRENCY: "1",
      };
      const result = validatePreflightEnv("worker", workerEnv, { isProduction: true });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts benchmark-approved concurrency 4 in production for workers", () => {
      const workerEnv = {
        REDIS_URL: "redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379",
        CALLBACK_SECRET: "cb-sec",
        WORKER_SECRET: "w-sec",
        DATABASE_URL: "postgresql://rds/marvedge",
        STORAGE_PROVIDER: "aws",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
        BACKEND_URL: "https://api.marvedge.com",
        WORKER_CONCURRENCY: "4",
        REFRAME_WORKER_CONCURRENCY: "4",
      };
      const result = validatePreflightEnv("worker", workerEnv, { isProduction: true });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects unapproved concurrency in production for workers", () => {
      const workerEnv = {
        REDIS_URL: "redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379",
        CALLBACK_SECRET: "cb-sec",
        WORKER_SECRET: "w-sec",
        DATABASE_URL: "postgresql://rds/marvedge",
        STORAGE_PROVIDER: "aws",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
        BACKEND_URL: "https://api.marvedge.com",
        WORKER_CONCURRENCY: "8", // Unapproved!
        REFRAME_WORKER_CONCURRENCY: "4",
      };
      const result = validatePreflightEnv("worker", workerEnv, { isProduction: true });
      expect(result.valid).toBe(false);
      const concurrencyErr = result.errors.find((e) => e.variable === "WORKER_CONCURRENCY");
      expect(concurrencyErr?.message).toContain(
        "Approved settings are 1 (initial validation) or 4 (benchmark-approved)"
      );
    });

    it("detects unsafe loopback Redis for worker in production", () => {
      const workerEnv = {
        REDIS_URL: "redis://127.0.0.1:6379",
        CALLBACK_SECRET: "cb-sec",
        WORKER_SECRET: "w-sec",
        DATABASE_URL: "postgresql://rds/marvedge",
        STORAGE_PROVIDER: "aws",
        RAW_BUCKET: "marvedge-raw-ap2",
        PROCESSED_BUCKET: "marvedge-processed-ap2",
        BACKEND_URL: "https://api.marvedge.com",
        WORKER_CONCURRENCY: "1",
        REFRAME_WORKER_CONCURRENCY: "1",
      };
      const result = validatePreflightEnv("worker", workerEnv, { isProduction: true });
      expect(result.valid).toBe(false);
      const redisErr = result.errors.find((e) => e.variable === "REDIS_URL");
      expect(redisErr?.message).toContain(
        "Accidental localhost Redis target detected in production"
      );
    });
  });

  describe("Scope: ML Gateway validation", () => {
    it("validates timeout and downstream service URLs", () => {
      const result = validatePreflightEnv(
        "ml-gateway",
        {
          AUTOFILP_SERVICE_URL: "http://autoflip:8000",
          TALKNET_SERVICE_URL: "http://talknet:8000",
          GATEWAY_TIMEOUT_SEC: "180.0",
        },
        { isProduction: true }
      );
      expect(result.valid).toBe(true);
    });

    it("fails on invalid timeout value", () => {
      const result = validatePreflightEnv(
        "ml-gateway",
        {
          AUTOFILP_SERVICE_URL: "http://autoflip:8000",
          TALKNET_SERVICE_URL: "http://talknet:8000",
          GATEWAY_TIMEOUT_SEC: "-5",
        },
        { isProduction: true }
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.variable === "GATEWAY_TIMEOUT_SEC")).toBe(true);
    });
  });

  describe("Report generation and zero secret disclosure", () => {
    it("generates formatted report without disclosing any secret values", () => {
      const sensitiveSecret = "MY_SUPER_CONFIDENTIAL_KEY_9999";
      const envWithSecret = {
        DATABASE_URL: `postgresql://user:${sensitiveSecret}@host/db`,
        CALLBACK_SECRET: sensitiveSecret,
        STORAGE_PROVIDER: "invalid_provider",
      };
      const result = validatePreflightEnv("all", envWithSecret, { isProduction: false });
      const report = formatPreflightReport(result);

      // Invariant: The confidential string must NEVER appear in the generated report
      expect(report).not.toContain(sensitiveSecret);
      expect(report).toContain("MARVEDGE PREFLIGHT VALIDATION REPORT");
      expect(report).toContain("STORAGE_PROVIDER");
    });
  });
});
