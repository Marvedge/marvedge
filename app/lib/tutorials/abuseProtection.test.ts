import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

import { isTutorialUploadRateLimited, tutorialRateLimitKeys } from "./abuseProtection";

function headers(ip: string): Headers {
  return new Headers({
    "x-forwarded-for": ip,
  });
}

describe("tutorial upload abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("does not expose account or IP identifiers in Redis keys", () => {
    const account = "user-sensitive-id";
    const ip = "203.0.113.10";

    const keys = tutorialRateLimitKeys(account, headers(ip));

    expect(keys.accountKey).toMatch(/^tutorials:account:[a-f0-9]{64}$/);

    expect(keys.ipKey).toMatch(/^tutorials:ip:[a-f0-9]{64}$/);

    expect(JSON.stringify(keys)).not.toContain(account);

    expect(JSON.stringify(keys)).not.toContain(ip);
  });

  it("keeps the account bucket when the caller rotates IPs", () => {
    const first = tutorialRateLimitKeys("user-1", headers("203.0.113.10"));

    const second = tutorialRateLimitKeys("user-1", headers("198.51.100.20"));

    expect(first.accountKey).toBe(second.accountKey);

    expect(first.ipKey).not.toBe(second.ipKey);
  });

  it("enforces independent fail-closed account and IP limits", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(isTutorialUploadRateLimited("user-1", headers("203.0.113.10"))).resolves.toBe(
      true
    );

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^tutorials:account:[a-f0-9]{64}$/),
      10,
      60,
      true
    );

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^tutorials:ip:[a-f0-9]{64}$/),
      20,
      60,
      true
    );
  });
});
