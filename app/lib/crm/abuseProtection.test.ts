import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

import { crmActionRateLimitKey, isCrmActionRateLimited } from "./abuseProtection";

describe("CRM provider-action abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("limits connection tests to ten per fifteen minutes", async () => {
    await expect(isCrmActionRateLimited("sensitive-user-id", "connection-test")).resolves.toBe(
      false
    );

    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^crm:rate-limit:connection-test:[a-f0-9]{64}$/),
      10,
      15 * 60,
      true
    );
  });

  it("uses one user-wide retry bucket across both retry routes", async () => {
    const key = crmActionRateLimitKey("user-1", "retry-failed-deliveries");

    await isCrmActionRateLimited("user-1", "retry-failed-deliveries");

    expect(mocks.isRateLimited).toHaveBeenCalledWith(key, 5, 15 * 60, true);
  });

  it("does not expose raw user identifiers in Redis keys", () => {
    const userId = "private-user-identifier";

    const testKey = crmActionRateLimitKey(userId, "connection-test");

    const retryKey = crmActionRateLimitKey(userId, "retry-failed-deliveries");

    expect(testKey).not.toContain(userId);
    expect(retryKey).not.toContain(userId);

    expect(testKey).toMatch(/^crm:rate-limit:connection-test:[a-f0-9]{64}$/);

    expect(retryKey).toMatch(/^crm:rate-limit:retry-failed-deliveries:[a-f0-9]{64}$/);
  });

  it("returns the limiter result to the protected routes", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(true);

    await expect(isCrmActionRateLimited("user-1", "connection-test")).resolves.toBe(true);
  });
});
