import { describe, expect, it } from "vitest";
import { parseDubbingWatermark } from "./dubbingConfig";

describe("parseDubbingWatermark", () => {
  it("returns undefined when ELEVENLABS_DUBBING_WATERMARK is not set", () => {
    expect(parseDubbingWatermark({})).toBeUndefined();
  });

  it("returns undefined when ELEVENLABS_DUBBING_WATERMARK is an empty string", () => {
    expect(parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "" })).toBeUndefined();
  });

  it("returns undefined when ELEVENLABS_DUBBING_WATERMARK is only whitespace", () => {
    expect(parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "   " })).toBeUndefined();
  });

  it('returns true when ELEVENLABS_DUBBING_WATERMARK is "true"', () => {
    expect(parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "true" })).toBe(true);
  });

  it('returns false when ELEVENLABS_DUBBING_WATERMARK is "false"', () => {
    expect(parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "false" })).toBe(false);
  });

  it('throws a clear config error for unrecognised value "yes"', () => {
    expect(() => parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "yes" })).toThrow(
      'Invalid ELEVENLABS_DUBBING_WATERMARK value: "yes"'
    );
  });

  it('throws a clear config error for unrecognised value "1"', () => {
    expect(() => parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "1" })).toThrow(
      'Invalid ELEVENLABS_DUBBING_WATERMARK value: "1"'
    );
  });

  it('throws a clear config error for unrecognised value "enabled"', () => {
    expect(() => parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "enabled" })).toThrow(
      'Invalid ELEVENLABS_DUBBING_WATERMARK value: "enabled"'
    );
  });

  it("error message mentions expected values", () => {
    expect(() => parseDubbingWatermark({ ELEVENLABS_DUBBING_WATERMARK: "maybe" })).toThrow(
      'Expected "true", "false", or leave unset to use the provider default.'
    );
  });
});
