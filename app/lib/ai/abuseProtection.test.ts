import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

import {
  MAX_SCRIPT_CHARACTERS,
  MAX_SCRIPT_LINES,
  MAX_TRANSLATION_CHARACTERS,
  MAX_TRANSLATION_CUES,
  exceedsTextLimits,
  isAiActionRateLimited,
  isRepeatedSubtitleTranslation,
} from "./abuseProtection";

describe("AI abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("accepts text exactly at the configured limits", () => {
    expect(
      exceedsTextLimits(
        ["a".repeat(MAX_SCRIPT_CHARACTERS)],
        MAX_SCRIPT_LINES,
        MAX_SCRIPT_CHARACTERS
      )
    ).toBe(false);
  });

  it("rejects too many items", () => {
    expect(
      exceedsTextLimits(
        Array.from({ length: MAX_TRANSLATION_CUES + 1 }, () => "cue"),
        MAX_TRANSLATION_CUES,
        MAX_TRANSLATION_CHARACTERS
      )
    ).toBe(true);
  });

  it("rejects too many total characters", () => {
    expect(
      exceedsTextLimits(
        ["a".repeat(MAX_TRANSLATION_CHARACTERS + 1)],
        MAX_TRANSLATION_CUES,
        MAX_TRANSLATION_CHARACTERS
      )
    ).toBe(true);
  });

  it("limits script rewrites to 20 per 15 minutes", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(true);

    await expect(isAiActionRateLimited("user-sensitive-id", "script-rewrite")).resolves.toBe(true);

    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^ai:rate-limit:script-rewrite:[a-f0-9]{64}$/),
      20,
      15 * 60,
      true
    );

    expect(mocks.isRateLimited.mock.calls[0][0]).not.toContain("user-sensitive-id");
  });

  it("limits subtitle translations to 6 per hour", async () => {
    await isAiActionRateLimited("user-1", "subtitle-translation");

    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^ai:rate-limit:subtitle-translation:[a-f0-9]{64}$/),
      6,
      60 * 60,
      true
    );
  });

  it("blocks repeated translation requests for five minutes", async () => {
    await isRepeatedSubtitleTranslation("user-1", "demo-1", "ta");

    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^ai:dedupe:subtitle-translation:[a-f0-9]{64}$/),
      1,
      5 * 60,
      true
    );
  });
});
