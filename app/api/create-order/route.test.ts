import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  isRateLimited: vi.fn(),
  orderCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = { create: mocks.orderCreate };
  },
}));

import { POST } from "./route";

function orderRequest(ip: string): Request {
  return new Request("http://localhost/api/create-order", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ plan: "pro" }),
  });
}

describe("order creation account-wide throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RAZORPAY_KEY_SECRET", "qa-test-secret");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_qa");

    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });

    mocks.orderCreate.mockResolvedValue({
      id: "order_test_1",
      amount: 4900,
      currency: "USD",
    });

    const counters = new Map<string, number>();

    mocks.isRateLimited.mockImplementation(async (key: string, limit: number) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return count > limit;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not reset the account allowance when IP addresses change", async () => {
    const statuses: number[] = [];

    for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4"]) {
      statuses.push((await POST(orderRequest(ip))).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mocks.orderCreate).toHaveBeenCalledTimes(3);
  });

  it("allows an order below the limit using the server price", async () => {
    const response = await POST(orderRequest("203.0.113.1"));

    expect(response.status).toBe(200);
    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 4900,
        currency: "USD",
        notes: { plan: "pro", email: "owner@example.test" },
      })
    );

    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^create-order:account:[a-f0-9]{64}$/),
      3,
      60,
      true
    );

    expect(mocks.isRateLimited.mock.calls[0][0]).not.toContain("owner@example.test");
  });

  it("keeps separate allowances for different accounts on the same IP", async () => {
    for (const email of ["first@example.test", "second@example.test"]) {
      mocks.session.mockResolvedValue({ user: { email } });

      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await POST(orderRequest("203.0.113.1"));
        expect(response.status).toBe(200);
      }
    }

    expect(mocks.orderCreate).toHaveBeenCalledTimes(6);

    const keys = mocks.isRateLimited.mock.calls.map(([key]) => key);
    expect(new Set(keys).size).toBe(2);
  });

  it("uses the same allowance across email casing and surrounding whitespace", async () => {
    const statuses: number[] = [];

    for (const email of [
      "owner@example.test",
      "OWNER@EXAMPLE.TEST",
      " owner@example.test ",
      "Owner@Example.Test",
    ]) {
      mocks.session.mockResolvedValue({ user: { email } });
      statuses.push((await POST(orderRequest("203.0.113.1"))).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(mocks.orderCreate).toHaveBeenCalledTimes(3);
  });

  it("requests fail-closed limiting and stops throttled provider calls", async () => {
    mocks.isRateLimited.mockResolvedValueOnce(true);

    const response = await POST(orderRequest("203.0.113.1"));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many requests, please try again shortly",
    });
    expect(mocks.isRateLimited).toHaveBeenCalledWith(
      expect.stringMatching(/^create-order:account:[a-f0-9]{64}$/),
      3,
      60,
      true
    );
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before limiter or provider work", async () => {
    mocks.session.mockResolvedValueOnce(null);

    const response = await POST(orderRequest("203.0.113.1"));

    expect(response.status).toBe(401);
    expect(mocks.isRateLimited).not.toHaveBeenCalled();
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});
