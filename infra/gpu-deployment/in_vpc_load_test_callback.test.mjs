import { describe, expect, it } from "vitest";
import { buildCallbackRecord } from "./callbackRecord.mjs";

describe("buildCallbackRecord", () => {
  it("captures exportedUrl from a completed callback", () => {
    const record = buildCallbackRecord(
      {
        status: "COMPLETED",
        exportedUrl: "https://example.com/video.mp4",
      },
      123
    );

    expect(record.exportedUrl).toBe("https://example.com/video.mp4");
    expect(record.timestamp).toBe(123);
    expect(record.fallback).toBe(false);
  });

  it("records fallback metadata from the orchestrator payload", () => {
    const record = buildCallbackRecord(
      {
        status: "COMPLETED",
        exportedUrl: "https://example.com/fallback.mp4",
        fallback: true,
        fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
      },
      456
    );

    expect(record.fallback).toBe(true);
    expect(record.fallbackReason).toBe("AUTOFLIP_EMPTY_CROP_TARGETS");
  });

  it("does not treat the obsolete fallbackApplied field as a fallback", () => {
    const record = buildCallbackRecord(
      {
        status: "COMPLETED",
        fallbackApplied: true,
      },
      789
    );

    expect(record.fallback).toBe(false);
    expect(record.exportedUrl).toBeUndefined();
    expect(record.fallbackReason).toBeNull();
  });
});
