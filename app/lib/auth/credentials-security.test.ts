import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isLoginRateLimited: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("@/app/lib/auth/loginProtection", () => ({
  isLoginRateLimited: mocks.isLoginRateLimited,
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
    },
  },
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: mocks.compare,
  },
}));

import { authorizeCredentials } from "./options";

const headers = {
  "x-forwarded-for": "203.0.113.10",
};

describe("credential-login abuse protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isLoginRateLimited.mockResolvedValue(false);

    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.test",
      password: "stored-password-hash",
      name: "Owner",
      image: null,
    });

    mocks.compare.mockResolvedValue(true);
  });

  it("rejects throttled attempts before database and bcrypt work", async () => {
    mocks.isLoginRateLimited.mockResolvedValueOnce(true);

    await expect(
      authorizeCredentials(
        {
          email: "owner@example.test",
          password: "Password123!",
        },
        headers
      )
    ).rejects.toThrow("Invalid email or password");

    expect(mocks.userFindUnique).not.toHaveBeenCalled();

    expect(mocks.userFindFirst).not.toHaveBeenCalled();

    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("continues normal authentication below the limit", async () => {
    const user = await authorizeCredentials(
      {
        email: " owner@example.test ",
        password: "Password123!",
      },
      headers
    );

    expect(mocks.isLoginRateLimited).toHaveBeenCalledWith("owner@example.test", headers);

    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: {
        email: "owner@example.test",
      },
    });

    expect(mocks.compare).toHaveBeenCalledWith("Password123!", "stored-password-hash");

    expect(user).toMatchObject({
      id: "user-1",
      email: "owner@example.test",
    });
  });
});
