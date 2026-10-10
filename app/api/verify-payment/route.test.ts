import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFetch: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  isRateLimited: vi.fn(),
}));

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = {
      fetch: mocks.orderFetch,
    };
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

import { getServerSession } from "next-auth";
import { POST } from "./route";

const SECRET = "razorpay-test-secret";
const ORDER_ID = "order_test_123";
const PAYMENT_ID = "pay_test_456";

function paymentSignature(): string {
  return crypto.createHmac("sha256", SECRET).update(`${ORDER_ID}|${PAYMENT_ID}`).digest("hex");
}

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/verify-payment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      razorpay_order_id: ORDER_ID,
      razorpay_payment_id: PAYMENT_ID,
      razorpay_signature: paymentSignature(),
    }),
  });
}

function paidOrder(email?: string) {
  return {
    id: ORDER_ID,
    status: "paid",
    amount: 4900,
    currency: "USD",
    notes: {
      plan: "pro",
      ...(email ? { email } : {}),
    },
  };
}

describe("POST /api/verify-payment order ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.RAZORPAY_KEY_SECRET = SECRET;
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_key";

    vi.mocked(getServerSession).mockResolvedValue({
      user: {
        email: "owner@example.test",
      },
    } as never);

    mocks.isRateLimited.mockResolvedValue(false);
    mocks.userFindUnique.mockResolvedValue({
      plan: "FREE",
    });
    mocks.userUpdate.mockResolvedValue({
      email: "owner@example.test",
      plan: "PRO",
    });
  });

  it("rejects a paid order that has no owner email", async () => {
    mocks.orderFetch.mockResolvedValue(paidOrder());

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      message: "Order does not belong to this account",
    });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects a paid order belonging to another account", async () => {
    mocks.orderFetch.mockResolvedValue(paidOrder("different-user@example.test"));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      message: "Order does not belong to this account",
    });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("upgrades the authenticated owner of a valid paid order", async () => {
    mocks.orderFetch.mockResolvedValue(paidOrder("OWNER@EXAMPLE.TEST"));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "Payment verified successfully",
    });

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: {
        email: "owner@example.test",
      },
      data: {
        plan: "PRO",
      },
    });
  });

  it("rejects an unauthenticated request before checking Razorpay", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mocks.orderFetch).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
