import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_DUBBING_QUEUE_NAME,
  DEFAULT_REFRAME_QUEUE_NAME,
  isStagingEnvironment,
  resolveDubbingQueueName,
  resolveReframeQueueName,
} from "./dubbingQueue";

describe("dubbingQueue and reframeQueue configuration", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isStagingEnvironment", () => {
    it("returns true only when APP_ENV is 'staging' (trimmed, case-insensitive)", () => {
      expect(isStagingEnvironment({ APP_ENV: "staging" })).toBe(true);
      expect(isStagingEnvironment({ APP_ENV: "  STAGING  " })).toBe(true);
    });

    it("does not infer staging from NODE_ENV !== 'production'", () => {
      expect(isStagingEnvironment({ NODE_ENV: "development" })).toBe(false);
      expect(isStagingEnvironment({ NODE_ENV: "test" })).toBe(false);
      expect(isStagingEnvironment({ NODE_ENV: "production" })).toBe(false);
      expect(isStagingEnvironment({})).toBe(false);
    });
  });

  describe("resolveDubbingQueueName", () => {
    it("defaults to 'dubbing-processing' when DUBBING_QUEUE_NAME is unset in non-staging", () => {
      delete process.env.APP_ENV;
      delete process.env.DUBBING_QUEUE_NAME;
      expect(resolveDubbingQueueName()).toBe(DEFAULT_DUBBING_QUEUE_NAME);
      expect(resolveDubbingQueueName({})).toBe("dubbing-processing");
    });

    it("preserves production default when NODE_ENV=production and APP_ENV is unset", () => {
      expect(resolveDubbingQueueName({ NODE_ENV: "production" })).toBe("dubbing-processing");
    });

    it("preserves development and test defaults when APP_ENV is unset", () => {
      expect(resolveDubbingQueueName({ NODE_ENV: "development" })).toBe("dubbing-processing");
      expect(resolveDubbingQueueName({ NODE_ENV: "test", DUBBING_QUEUE_NAME: "   " })).toBe(
        "dubbing-processing"
      );
    });

    it("falls back to 'dubbing-processing' when DUBBING_QUEUE_NAME is empty or whitespace in non-staging", () => {
      expect(resolveDubbingQueueName({ DUBBING_QUEUE_NAME: "" })).toBe("dubbing-processing");
      expect(resolveDubbingQueueName({ DUBBING_QUEUE_NAME: "   \t\n  " })).toBe(
        "dubbing-processing"
      );
    });

    it("uses custom queue name when DUBBING_QUEUE_NAME is set", () => {
      expect(resolveDubbingQueueName({ DUBBING_QUEUE_NAME: "dubbing-task115" })).toBe(
        "dubbing-task115"
      );
    });

    it("trims surrounding whitespace from custom DUBBING_QUEUE_NAME", () => {
      expect(resolveDubbingQueueName({ DUBBING_QUEUE_NAME: "  dubbing-preview  " })).toBe(
        "dubbing-preview"
      );
    });

    it("fails closed when APP_ENV=staging and DUBBING_QUEUE_NAME is missing", () => {
      expect(() => resolveDubbingQueueName({ APP_ENV: "staging" })).toThrow(
        "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
      );
    });

    it("fails closed when APP_ENV=staging and DUBBING_QUEUE_NAME is empty or whitespace-only", () => {
      expect(() => resolveDubbingQueueName({ APP_ENV: "staging", DUBBING_QUEUE_NAME: "" })).toThrow(
        "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
      );
      expect(() =>
        resolveDubbingQueueName({ APP_ENV: "staging", DUBBING_QUEUE_NAME: "   " })
      ).toThrow(
        "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
      );
    });

    it("fails closed when APP_ENV=staging and DUBBING_QUEUE_NAME uses production default", () => {
      expect(() =>
        resolveDubbingQueueName({
          APP_ENV: "staging",
          DUBBING_QUEUE_NAME: "dubbing-processing",
        })
      ).toThrow('DUBBING_QUEUE_NAME must not use production default "dubbing-processing"');
    });

    it("returns trimmed isolated queue name when APP_ENV=staging and DUBBING_QUEUE_NAME is valid", () => {
      expect(
        resolveDubbingQueueName({
          APP_ENV: "staging",
          NODE_ENV: "production",
          DUBBING_QUEUE_NAME: "  dubbing-task115  ",
        })
      ).toBe("dubbing-task115");
    });
  });

  describe("resolveReframeQueueName", () => {
    it("defaults to 'reframe-processing' in production/development/test when APP_ENV is unset", () => {
      expect(resolveReframeQueueName({})).toBe(DEFAULT_REFRAME_QUEUE_NAME);
      expect(resolveReframeQueueName({ NODE_ENV: "production" })).toBe("reframe-processing");
      expect(resolveReframeQueueName({ NODE_ENV: "development", REFRAME_QUEUE_NAME: "   " })).toBe(
        "reframe-processing"
      );
    });

    it("fails closed when APP_ENV=staging and REFRAME_QUEUE_NAME is missing or whitespace-only", () => {
      expect(() => resolveReframeQueueName({ APP_ENV: "staging" })).toThrow(
        "REFRAME_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
      );
      expect(() =>
        resolveReframeQueueName({ APP_ENV: "staging", REFRAME_QUEUE_NAME: "   " })
      ).toThrow(
        "REFRAME_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
      );
    });

    it("fails closed when APP_ENV=staging and REFRAME_QUEUE_NAME uses production default", () => {
      expect(() =>
        resolveReframeQueueName({
          APP_ENV: "staging",
          REFRAME_QUEUE_NAME: "reframe-processing",
        })
      ).toThrow('REFRAME_QUEUE_NAME must not use production default "reframe-processing"');
    });

    it("returns trimmed isolated queue name when APP_ENV=staging and REFRAME_QUEUE_NAME is valid", () => {
      expect(
        resolveReframeQueueName({
          APP_ENV: "staging",
          REFRAME_QUEUE_NAME: "  reframe-task115  ",
        })
      ).toBe("reframe-task115");
    });
  });
});
