import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

import { isPasswordResetRateLimited, passwordResetRateLimitKeys } from "./passwordResetProtection";

function headers(ip: string): Headers {
  return new Headers({
    "x-forwarded-for": ip,
  });
}

describe("password-reset abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRateLimited.mockResolvedValue(false);
  });

  it("hashes email and IP identifiers in Redis keys", () => {
    const email = "Private.User@Example.Test";
    const ip = "203.0.113.10";

    const keys = passwordResetRateLimitKeys(email, headers(ip), "request-link");

    expect(keys.emailKey).toMatch(/^auth:password-reset:request-link:email:[a-f0-9]{64}$/);

    expect(keys.ipKey).toMatch(/^auth:password-reset:request-link:ip:[a-f0-9]{64}$/);

    expect(JSON.stringify(keys)).not.toContain(email.toLowerCase());

    expect(JSON.stringify(keys)).not.toContain(ip);
  });

  it("uses one account-wide bucket across rotating IPs", () => {
    const first = passwordResetRateLimitKeys(
      "owner@example.test",
      headers("203.0.113.10"),
      "reset-attempt"
    );

    const second = passwordResetRateLimitKeys(
      "owner@example.test",
      headers("198.51.100.20"),
      "reset-attempt"
    );

    expect(first.emailKey).toBe(second.emailKey);
    expect(first.ipKey).not.toBe(second.ipKey);
  });

  it("shares one verification bucket across reset routes", () => {
    const keys = passwordResetRateLimitKeys(
      "owner@example.test",
      headers("203.0.113.10"),
      "reset-attempt"
    );

    expect(keys.emailKey).toMatch(/^auth:password-reset:reset-attempt:email:[a-f0-9]{64}$/);

    expect(keys.ipKey).toMatch(/^auth:password-reset:reset-attempt:ip:[a-f0-9]{64}$/);
  });

  it("enforces independent fail-closed email and IP limits", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(
      isPasswordResetRateLimited("owner@example.test", headers("203.0.113.10"), "reset-attempt")
    ).resolves.toBe(true);

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^auth:password-reset:reset-attempt:email:[a-f0-9]{64}$/),
      5,
      15 * 60,
      true
    );

    expect(mocks.isRateLimited).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^auth:password-reset:reset-attempt:ip:[a-f0-9]{64}$/),
      20,
      15 * 60,
      true
    );
  });
});
