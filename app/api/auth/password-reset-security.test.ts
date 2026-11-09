import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRateLimited: vi.fn(),
  hash: vi.fn(),
  compare: vi.fn(),
  passwordResetFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: vi.fn(),
  transactionPasswordResetDeleteMany: vi.fn(),
  transactionUserUpdate: vi.fn(),
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.isRateLimited,
}));

vi.mock("bcryptjs", () => ({
  hash: mocks.hash,
  compare: mocks.compare,
  default: {
    hash: mocks.hash,
    compare: mocks.compare,
  },
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    passwordReset: {
      findFirst: mocks.passwordResetFindFirst,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

import { POST as verifyReset } from "./verify-reset/route";
import { POST as resetPassword } from "./reset-password/route";

const email = "owner@example.test";
const userId = "user-1";
const resetId = "reset-1";
const expiresAt = new Date("2099-01-01T00:00:00.000Z");

const transactionClient = {
  passwordReset: {
    deleteMany: mocks.transactionPasswordResetDeleteMany,
  },
  user: {
    update: mocks.transactionUserUpdate,
  },
};

function makeRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

describe("password-reset session revocation (BUG-0039)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isRateLimited.mockResolvedValue(false);
    mocks.hash.mockResolvedValue("new-password-hash");
    mocks.compare.mockResolvedValue(false);

    mocks.passwordResetFindFirst.mockResolvedValue({
      id: resetId,
      email,
      otp: "stored-token-hash",
      expiresAt,
      createdAt: new Date(),
    });

    mocks.userFindUnique.mockResolvedValue({
      id: userId,
      email,
      password: "old-password-hash",
      sessionVersion: 4,
    });

    mocks.transactionPasswordResetDeleteMany.mockResolvedValue({
      count: 1,
    });

    mocks.transactionUserUpdate.mockResolvedValue({
      id: userId,
    });

    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient)
    );
  });

  it("verify-reset increments sessionVersion in the reset transaction", async () => {
    const response = await verifyReset(
      makeRequest("/api/auth/verify-reset", {
        email,
        token: "0123456789abcdef0123456789abcdef",
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Password reset successfully.",
    });

    expect(mocks.transactionUserUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        password: "new-password-hash",
        sessionVersion: { increment: 1 },
      },
    });
  });

  it("verify-reset rejects a token consumed by a concurrent request", async () => {
    mocks.transactionPasswordResetDeleteMany.mockResolvedValueOnce({
      count: 0,
    });

    const response = await verifyReset(
      makeRequest("/api/auth/verify-reset", {
        email,
        token: "0123456789abcdef0123456789abcdef",
        password: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid or expired reset link.",
    });
    expect(mocks.transactionUserUpdate).not.toHaveBeenCalled();
  });

  it("legacy reset increments sessionVersion in the reset transaction", async () => {
    const response = await resetPassword(
      makeRequest("/api/auth/reset-password", {
        email,
        otp: "123456",
        newPassword: "NewPassword123!",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Password has been reset",
    });

    expect(mocks.transactionUserUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        password: "new-password-hash",
        sessionVersion: { increment: 1 },
      },
    });
  });

  it("legacy reset rejects an OTP consumed by a concurrent request", async () => {
    mocks.transactionPasswordResetDeleteMany.mockResolvedValueOnce({
      count: 0,
    });

    const response = await resetPassword(
      makeRequest("/api/auth/reset-password", {
        email,
        otp: "123456",
        newPassword: "NewPassword123!",
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid or expired OTP",
    });
    expect(mocks.transactionUserUpdate).not.toHaveBeenCalled();
  });
});
