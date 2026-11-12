import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    review: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reviews validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(prisma.review.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.review.create).mockImplementation((async (args: { data: object }) => ({
      id: "review-1",
      ...args.data,
    })) as never);
  });

  it("rejects a fractional rating", async () => {
    const res = await POST(makeRequest({ rating: 4.5, content: "Good" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing rating or content" });
    expect(prisma.review.findFirst).not.toHaveBeenCalled();
    expect(prisma.review.create).not.toHaveBeenCalled();
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it("accepts an integer rating", async () => {
    const res = await POST(makeRequest({ rating: 4, content: "Good" }));

    expect(res.status).toBe(200);
    expect(prisma.review.create).toHaveBeenCalledWith({
      data: { userId: "user-1", rating: 4, content: "Good" },
    });
  });
});
