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
      findFirst: vi.fn(),
    },
    hubSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/cloudflare", () => ({
  registerCustomDomain: vi.fn(),
  deleteCustomDomain: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/hub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/hub validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-12345678", email: "user@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-12345678",
      name: "Jane",
      hubSettings: {
        subdomain: "user-user-1234",
        customDomain: null,
        cloudflareId: null,
        sslStatus: "pending",
        dnsVerification: null,
      },
    } as never);
    vi.mocked(prisma.hubSettings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.hubSettings.upsert).mockImplementation((async (args: any) => {
      return { id: "hub-1", ...(args as { create: object }).create };
    }) as never);
  });

  it("saves valid settings with a trimmed title", async () => {
    const res = await POST(
      makeRequest({
        logoUrl: "https://example.com/logo.png",
        brandColor: "#7C5CFC",
        hubTitle: "  My Hub  ",
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(prisma.hubSettings.upsert).toHaveBeenCalledOnce();
    const create = vi.mocked(prisma.hubSettings.upsert).mock.calls[0][0] as {
      create: { hubTitle: string };
    };
    expect(create.create.hubTitle).toBe("My Hub");
  });

  it("returns 400 for a non-https logoUrl", async () => {
    const res = await POST(
      makeRequest({ logoUrl: "http://example.com/logo.png", brandColor: "#7C5CFC" })
    );

    expect(res.status).toBe(400);
    expect(prisma.hubSettings.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for a javascript: logoUrl", async () => {
    const res = await POST(makeRequest({ logoUrl: "javascript:alert(1)" }));

    expect(res.status).toBe(400);
    expect(prisma.hubSettings.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-hex brandColor", async () => {
    for (const brandColor of ["red", "#fff", "#GGGGGG", "7C5CFC", "#7C5CFCL"]) {
      const res = await POST(makeRequest({ brandColor }));

      expect(res.status).toBe(400);
    }
    expect(prisma.hubSettings.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an overlong hubTitle", async () => {
    const res = await POST(makeRequest({ hubTitle: "x".repeat(201) }));

    expect(res.status).toBe(400);
    expect(prisma.hubSettings.upsert).not.toHaveBeenCalled();
  });
});
