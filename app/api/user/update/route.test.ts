import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/user/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/user/update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@example.com" },
    } as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      name: "Jane Doe",
      email: "user@example.com",
    } as never);
    // Simulate Prisma honouring `select`: only safe fields come back.
    vi.mocked(prisma.user.update).mockImplementation((async (args: any) => {
      const select = (args as { select?: Record<string, boolean> }).select ?? {};
      const full = {
        id: "user-1",
        name: "Janet Doe",
        email: "user@example.com",
        image: null,
        bio: "hi",
        location: null,
        website: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        password: "hashed-secret",
        sessionVersion: 3,
      };
      return Object.fromEntries(
        Object.entries(full).filter(([key]) => select[key as keyof typeof select])
      ) as never;
    }) as never);
  });

  it("never returns password or sessionVersion", async () => {
    const res = await POST(makeRequest({ firstName: "Janet" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user).not.toHaveProperty("password");
    expect(data.user).not.toHaveProperty("sessionVersion");
    expect(data.user.email).toBe("user@example.com");
  });

  it("scopes both the read and the write to the safe field list", async () => {
    await POST(makeRequest({ firstName: "Janet" }));

    const safeKeys = [
      "id",
      "name",
      "email",
      "image",
      "bio",
      "location",
      "website",
      "createdAt",
      "updatedAt",
    ];
    for (const call of vi.mocked(prisma.user.findUnique).mock.calls) {
      const select = (call[0] as { select?: Record<string, boolean> }).select ?? {};
      expect(Object.keys(select).sort()).toEqual([...safeKeys].sort());
      expect(select).not.toHaveProperty("password");
      expect(select).not.toHaveProperty("sessionVersion");
    }
    for (const call of vi.mocked(prisma.user.update).mock.calls) {
      const select = (call[0] as { select?: Record<string, boolean> }).select ?? {};
      expect(Object.keys(select).sort()).toEqual([...safeKeys].sort());
      expect(select).not.toHaveProperty("password");
      expect(select).not.toHaveProperty("sessionVersion");
    }
  });
});
