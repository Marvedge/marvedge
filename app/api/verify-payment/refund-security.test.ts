import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limited: vi.fn(),
  orderFetch: vi.fn(),
  paymentFetch: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));
vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));
vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.limited,
}));
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      update: mocks.updateUser,
    },
  },
}));
vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = { fetch: mocks.orderFetch };
    payments = { fetch: mocks.paymentFetch };
  },
}));

import { POST } from "./route";

describe("payment verification after a full refund", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RAZORPAY_KEY_SECRET", "qa-refund-secret");
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_qa");

    mocks.session.mockResolvedValue({
      user: { email: "owner@example.test" },
    });
    mocks.limited.mockResolvedValue(false);
    mocks.findUser.mockResolvedValue({ plan: "FREE" });
    mocks.updateUser.mockResolvedValue({ plan: "PRO" });

    // Razorpay orders remain paid after the associated payment is refunded.
    mocks.orderFetch.mockResolvedValue({
      id: "order_refunded_1",
      status: "paid",
      amount: 4900,
      amount_paid: 4900,
      amount_due: 0,
      currency: "USD",
      notes: { plan: "pro", email: "owner@example.test" },
    });
    mocks.paymentFetch.mockResolvedValue({
      id: "pay_refunded_1",
      order_id: "order_refunded_1",
      status: "refunded",
      captured: true,
      amount: 4900,
      currency: "USD",
      amount_refunded: 4900,
      refund_status: "full",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not grant PRO using a fully refunded payment", async () => {
    const signature = crypto
      .createHmac("sha256", "qa-refund-secret")
      .update("order_refunded_1|pay_refunded_1")
      .digest("hex");

    const response = await POST(
      new Request("http://localhost/api/verify-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: "order_refunded_1",
          razorpay_payment_id: "pay_refunded_1",
          razorpay_signature: signature,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.paymentFetch).toHaveBeenCalledWith("pay_refunded_1");
  });
});
