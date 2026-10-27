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

const SECRET = "razorpay-test-secret";
const ORDER_ID = "order_test_123";
const PAYMENT_ID = "pay_test_456";

function makeRequest(signature?: string): Request {
  return new Request("http://localhost/api/verify-payment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      razorpay_order_id: ORDER_ID,
      razorpay_payment_id: PAYMENT_ID,
      razorpay_signature:
        signature ??
        crypto.createHmac("sha256", SECRET).update(`${ORDER_ID}|${PAYMENT_ID}`).digest("hex"),
    }),
  });
}

function paidOrder(email: string | null = "owner@example.test") {
  return {
    id: ORDER_ID,
    status: "paid",
    amount: 4900,
    currency: "USD",
    notes: { plan: "pro", ...(email === null ? {} : { email }) },
  };
}

function capturedPayment() {
  return {
    id: PAYMENT_ID,
    order_id: ORDER_ID,
    status: "captured",
    captured: true,
    amount: 4900,
    currency: "USD",
    amount_refunded: 0,
    refund_status: null,
  };
}

describe("payment verification eligibility and ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_key");
    mocks.session.mockResolvedValue({
      user: { email: "owner@example.test" },
    });
    mocks.limited.mockResolvedValue(false);
    mocks.orderFetch.mockResolvedValue(paidOrder());
    mocks.paymentFetch.mockResolvedValue(capturedPayment());
    mocks.findUser.mockResolvedValue({ plan: "FREE" });
    mocks.updateUser.mockResolvedValue({ plan: "PRO" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([null, "different-user@example.test"])(
    "rejects an order with owner %s",
    async (email) => {
      mocks.orderFetch.mockResolvedValue(paidOrder(email));
      const response = await POST(makeRequest());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        success: false,
        message: "Order does not belong to this account",
      });
      expect(mocks.paymentFetch).not.toHaveBeenCalled();
      expect(mocks.findUser).not.toHaveBeenCalled();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    }
  );

  it("upgrades the authenticated owner of a captured, unrefunded payment", async () => {
    mocks.orderFetch.mockResolvedValue(paidOrder("OWNER@EXAMPLE.TEST"));
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: "Payment verified successfully",
    });
    expect(mocks.paymentFetch).toHaveBeenCalledWith(PAYMENT_ID);
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { email: "owner@example.test" },
      data: { plan: "PRO" },
    });
  });

  it("verifies the payment again but avoids another write for an existing PRO user", async () => {
    mocks.findUser.mockResolvedValue({ plan: "PRO" });
    expect((await POST(makeRequest())).status).toBe(200);
    expect(mocks.paymentFetch).toHaveBeenCalledWith(PAYMENT_ID);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    { label: "different payment ID", change: { id: "pay_other" } },
    { label: "different order", change: { order_id: "order_other" } },
    { label: "authorized only", change: { status: "authorized", captured: false } },
    { label: "failed payment", change: { status: "failed", captured: false } },
    { label: "uncaptured flag", change: { captured: false } },
    { label: "wrong currency", change: { currency: "INR" } },
    { label: "wrong amount", change: { amount: 100 } },
    {
      label: "partial refund",
      change: { amount_refunded: 100, refund_status: "partial" },
    },
    {
      label: "full refund",
      change: {
        status: "refunded",
        amount_refunded: 4900,
        refund_status: "full",
      },
    },
    { label: "refunded amount despite null status", change: { amount_refunded: 100 } },
    { label: "missing refund amount", change: { amount_refunded: undefined } },
  ])("rejects $label before accessing user data", async ({ change }) => {
    mocks.paymentFetch.mockResolvedValue({ ...capturedPayment(), ...change });
    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "Payment is not eligible for this upgrade",
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a refunded payment even when the account already has PRO", async () => {
    mocks.findUser.mockResolvedValue({ plan: "PRO" });
    mocks.paymentFetch.mockResolvedValue({
      ...capturedPayment(),
      status: "refunded",
      amount_refunded: 4900,
      refund_status: "full",
    });

    expect((await POST(makeRequest())).status).toBe(400);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("does not grant access when payment lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.paymentFetch.mockRejectedValue(new Error("Provider unavailable"));
    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      message: "Internal Server Error",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before provider calls", async () => {
    expect((await POST(makeRequest("invalid"))).status).toBe(400);
    expect(mocks.orderFetch).not.toHaveBeenCalled();
    expect(mocks.paymentFetch).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before provider calls", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(401);
    expect(mocks.limited).not.toHaveBeenCalled();
    expect(mocks.orderFetch).not.toHaveBeenCalled();
    expect(mocks.paymentFetch).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
