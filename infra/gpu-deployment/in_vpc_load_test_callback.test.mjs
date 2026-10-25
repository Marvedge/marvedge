import test from "node:test";
import assert from "node:assert/strict";
import { buildCallbackRecord } from "./callbackRecord.mjs";

test("captures exportedUrl from a completed callback", () => {
  const record = buildCallbackRecord({
    status: "COMPLETED",
    exportedUrl: "https://example.com/video.mp4",
  }, 123);

  assert.equal(record.exportedUrl, "https://example.com/video.mp4");
  assert.equal(record.timestamp, 123);
  assert.equal(record.fallback, false);
});

test("records fallback metadata from the orchestrator payload", () => {
  const record = buildCallbackRecord({
    status: "COMPLETED",
    exportedUrl: "https://example.com/fallback.mp4",
    fallback: true,
    fallbackReason: "AUTOFLIP_EMPTY_CROP_TARGETS",
  }, 456);

  assert.equal(record.fallback, true);
  assert.equal(record.fallbackReason, "AUTOFLIP_EMPTY_CROP_TARGETS");
});

test("does not treat the obsolete fallbackApplied field as a fallback", () => {
  const record = buildCallbackRecord({
    status: "COMPLETED",
    fallbackApplied: true,
  }, 789);

  assert.equal(record.fallback, false);
  assert.equal(record.exportedUrl, undefined);
  assert.equal(record.fallbackReason, null);
});
