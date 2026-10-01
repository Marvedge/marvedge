import { describe, expect, it, vi } from "vitest";

vi.mock("../queue", () => ({
  reframeQueue: {
    add: vi.fn(async () => ({ id: "mock-job-id" })),
  },
}));

import { reframeQueue } from "../queue";
import {
  ApiError,
  reframeJobQueue,
  validateReframeInput,
} from "./service";

describe("validateReframeInput", () => {
  it("rejects non-object body", () => {
    expect(() => validateReframeInput(null)).toThrow(ApiError);
    expect(() => validateReframeInput("string")).toThrow(ApiError);
  });

  it("rejects missing or whitespace videoUrl", () => {
    expect(() => validateReframeInput({ targetAspectRatio: "9:16" })).toThrow(
      "videoUrl is required"
    );
    expect(() =>
      validateReframeInput({ videoUrl: "   ", targetAspectRatio: "9:16" })
    ).toThrow("videoUrl is required");
  });

  it("rejects missing or whitespace targetAspectRatio", () => {
    expect(() =>
      validateReframeInput({ videoUrl: "https://example.com/video.mp4" })
    ).toThrow("targetAspectRatio is required");
    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "   ",
      })
    ).toThrow("targetAspectRatio is required");
  });

  it("rejects non-string demoId", () => {
    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        demoId: 123,
      })
    ).toThrow("demoId must be a string if provided");
  });

  it("rejects invalid source dimensions", () => {
    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        source: { width: 0, height: 1080 },
      })
    ).toThrow("source.width must be a positive number");

    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: -10 },
      })
    ).toThrow("source.height must be a positive number");

    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: 1080, fps: -5 },
      })
    ).toThrow("source.fps must be a positive number if provided");

    expect(() =>
      validateReframeInput({
        videoUrl: "https://example.com/video.mp4",
        targetAspectRatio: "9:16",
        source: { width: 1920, height: 1080, durationSec: -1 },
      })
    ).toThrow("source.durationSec must be a non-negative number if provided");
  });

  it("accepts valid input without optional fields", () => {
    const result = validateReframeInput({
      videoUrl: "  https://example.com/video.mp4  ",
      targetAspectRatio: "  9:16  ",
    });
    expect(result).toEqual({
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "9:16",
      demoId: undefined,
      source: undefined,
    });
  });

  it("accepts valid input with full source metadata and demoId", () => {
    const result = validateReframeInput({
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "1:1",
      demoId: "demo-xyz",
      source: {
        width: 1920,
        height: 1080,
        fps: 30,
        durationSec: 15.5,
      },
    });
    expect(result).toEqual({
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "1:1",
      demoId: "demo-xyz",
      source: {
        width: 1920,
        height: 1080,
        fps: 30,
        durationSec: 15.5,
      },
    });
  });
});

describe("reframeJobQueue", () => {
  it("enqueues with deterministic jobId, 3 attempts, exponential backoff and cleanup options", async () => {
    const addSpy = vi.spyOn(reframeQueue, "add").mockResolvedValue({ id: "job-123" } as never);

    const payload = {
      jobId: "job-123",
      videoUrl: "https://example.com/video.mp4",
      targetAspectRatio: "9:16",
      userId: "user-1",
      demoId: "demo-1",
    };

    await reframeJobQueue.add("reframe", payload);

    expect(addSpy).toHaveBeenCalledWith("reframe", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
      jobId: "job-123",
    });

    addSpy.mockRestore();
  });
});
