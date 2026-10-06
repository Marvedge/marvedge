import { describe, expect, it } from "vitest";
import { UnrecoverableError } from "bullmq";
import {
  validateReframeJobPayload,
  validateReframeInput,
  ReframePayloadValidationError,
  ApiError,
} from "./validation";

describe("validateReframeJobPayload", () => {
  const valid = {
    jobId: "job-valid-1",
    videoUrl: "https://example.com/video.mp4",
    targetAspectRatio: "9:16",
    userId: "user-123",
    demoId: "demo-456",
    source: { width: 1920, height: 1080, fps: 30, durationSec: 15 },
  };

  it("accepts a fully specified valid payload", () => {
    const res = validateReframeJobPayload(valid);
    expect(res).toEqual(valid);
  });

  it("accepts minimal valid payload", () => {
    const res = validateReframeJobPayload({
      jobId: "job-min",
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "1:1",
    });
    expect(res.jobId).toBe("job-min");
    expect(res.videoUrl).toBe("https://example.com/video.mp4");
    expect(res.targetAspectRatio).toBe("1:1");
    expect(res.userId).toBeUndefined();
    expect(res.demoId).toBeUndefined();
    expect(res.source).toBeUndefined();
  });

  it("throws ReframePayloadValidationError (UnrecoverableError) on null or non-object", () => {
    expect(() => validateReframeJobPayload(null)).toThrow(ReframePayloadValidationError);
    expect(() => validateReframeJobPayload(undefined)).toThrow(ReframePayloadValidationError);
    expect(() => validateReframeJobPayload("string")).toThrow(ReframePayloadValidationError);
    expect(() => validateReframeJobPayload([1, 2, 3])).toThrow(ReframePayloadValidationError);

    try {
      validateReframeJobPayload(null);
    } catch (err) {
      expect(err).toBeInstanceOf(UnrecoverableError);
    }
  });

  it("validates jobId", () => {
    expect(() => validateReframeJobPayload({ ...valid, jobId: undefined })).toThrow("jobId is required");
    expect(() => validateReframeJobPayload({ ...valid, jobId: "" })).toThrow("jobId is required");
    expect(() => validateReframeJobPayload({ ...valid, jobId: "   " })).toThrow("jobId is required");
    expect(() => validateReframeJobPayload({ ...valid, jobId: 123 })).toThrow("jobId is required");
  });

  it("validates videoUrl and safety", () => {
    expect(() => validateReframeJobPayload({ ...valid, videoUrl: undefined })).toThrow("videoUrl is required");
    expect(() => validateReframeJobPayload({ ...valid, videoUrl: "   " })).toThrow("videoUrl is required");
    expect(() => validateReframeJobPayload({ ...valid, videoUrl: "http://127.0.0.1/video.mp4" })).toThrow("videoUrl is unsafe");
    expect(() => validateReframeJobPayload({ ...valid, videoUrl: "http://localhost:3000/video.mp4" })).toThrow("videoUrl is unsafe");
    expect(() => validateReframeJobPayload({ ...valid, videoUrl: "javascript:alert(1)" })).toThrow("videoUrl is unsafe");
  });

  it("validates targetAspectRatio", () => {
    expect(() => validateReframeJobPayload({ ...valid, targetAspectRatio: undefined })).toThrow("targetAspectRatio is required");
    expect(() => validateReframeJobPayload({ ...valid, targetAspectRatio: "   " })).toThrow("targetAspectRatio is required");
  });

  it("validates userId when present", () => {
    expect(() => validateReframeJobPayload({ ...valid, userId: "" })).toThrow("userId must be a non-empty string");
    expect(() => validateReframeJobPayload({ ...valid, userId: 123 })).toThrow("userId must be a non-empty string");
  });

  it("validates demoId when present", () => {
    expect(() => validateReframeJobPayload({ ...valid, demoId: 123 })).toThrow("demoId must be a string");
    expect(validateReframeJobPayload({ ...valid, demoId: null }).demoId).toBeNull();
  });

  it("validates source metadata dimensions and finite checks", () => {
    expect(() => validateReframeJobPayload({ ...valid, source: "invalid" })).toThrow("source must be an object");
    expect(() => validateReframeJobPayload({ ...valid, source: [] })).toThrow("source must be an object");
    expect(() => validateReframeJobPayload({ ...valid, source: { width: 0, height: 100 } })).toThrow("source.width must be a positive number");
    expect(() => validateReframeJobPayload({ ...valid, source: { width: NaN, height: 100 } })).toThrow("source.width must be a positive number");
    expect(() => validateReframeJobPayload({ ...valid, source: { width: 100, height: Infinity } })).toThrow("source.height must be a positive number");
    expect(() => validateReframeJobPayload({ ...valid, source: { width: 100, height: 100, fps: -1 } })).toThrow("source.fps must be a positive number");
    expect(() => validateReframeJobPayload({ ...valid, source: { width: 100, height: 100, durationSec: -0.1 } })).toThrow("source.durationSec must be a non-negative number");
  });
});

describe("validateReframeInput", () => {
  it("throws ApiError(400) on invalid input", () => {
    expect(() => validateReframeInput(null)).toThrow(ApiError);
    expect(() => validateReframeInput({})).toThrow("videoUrl is required");
  });
});
