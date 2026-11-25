import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isLoginRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/auth/loginProtection", () => ({
  isLoginRateLimited: mocks.isLoginRateLimited,
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({})),
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
  },
}));

import { authOptions } from "./options";

type RedirectCallback = (args: { url: string; baseUrl: string }) => Promise<string>;

const redirect = authOptions.callbacks?.redirect as RedirectCallback;
const BASE = "https://app.example.com";

describe("NextAuth redirect callback", () => {
  beforeEach(() => {
    mocks.isLoginRateLimited.mockResolvedValue(false);
  });

  it("keeps a safe relative destination", async () => {
    await expect(redirect({ url: "/videos/1", baseUrl: BASE })).resolves.toBe("/videos/1");
  });

  it("keeps a same-origin absolute destination as a path", async () => {
    await expect(redirect({ url: `${BASE}/dashboard?tab=1`, baseUrl: BASE })).resolves.toBe(
      "/dashboard?tab=1"
    );
  });

  it("falls back for an external destination", async () => {
    await expect(redirect({ url: "https://evil.example/phish", baseUrl: BASE })).resolves.toBe(
      "/dashboard"
    );
  });

  it("falls back for protocol-relative and backslash URLs", async () => {
    await expect(redirect({ url: "//evil.example/phish", baseUrl: BASE })).resolves.toBe(
      "/dashboard"
    );
    await expect(redirect({ url: "/\\evil.example", baseUrl: BASE })).resolves.toBe("/dashboard");
  });
});
