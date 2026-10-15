import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    view: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
    },
    exportedVideo: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/views updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isRateLimited).mockResolvedValue(false);
  });

  it("rejects a viewId-only update with 403", async () => {
    vi.mocked(prisma.view.findUnique).mockResolvedValue({
      id: "view-1",
      demoId: "demo-1",
      exportedVideoId: null,
    } as never);

    const res = await POST(makeRequest({ viewId: "view-1", duration: 10 }));

    expect(res.status).toBe(403);
    expect(prisma.view.update).not.toHaveBeenCalled();
  });

  it("rejects a mismatched demoId with 403", async () => {
    vi.mocked(prisma.view.findUnique).mockResolvedValue({
      id: "view-1",
      demoId: "demo-1",
      exportedVideoId: null,
    } as never);

    const res = await POST(
      makeRequest({ viewId: "view-1", duration: 10, demoId: "demo-other" })
    );

    expect(res.status).toBe(403);
    expect(prisma.view.update).not.toHaveBeenCalled();
  });

  it("allows an anonymous update with the matching demoId", async () => {
    vi.mocked(prisma.view.findUnique).mockResolvedValue({
      id: "view-1",
      demoId: "demo-1",
      exportedVideoId: null,
    } as never);
    vi.mocked(prisma.view.update).mockResolvedValue({ id: "view-1" } as never);

    const res = await POST(
      makeRequest({ viewId: "view-1", duration: 10, demoId: "demo-1" })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, viewId: "view-1" });
    expect(prisma.view.update).toHaveBeenCalledWith({
      where: { id: "view-1" },
      data: { duration: 10 },
    });
  });

  it("allows an update with the matching exportedVideoId", async () => {
    vi.mocked(prisma.view.findUnique).mockResolvedValue({
      id: "view-1",
      demoId: null,
      exportedVideoId: "video-1",
    } as never);
    vi.mocked(prisma.view.update).mockResolvedValue({ id: "view-1" } as never);

    const res = await POST(
      makeRequest({ viewId: "view-1", duration: 5, exportedVideoId: "video-1" })
    );

    expect(res.status).toBe(200);
    expect(prisma.view.update).toHaveBeenCalledOnce();
  });

  it("still returns 404 for an unknown viewId", async () => {
    vi.mocked(prisma.view.findUnique).mockResolvedValue(null);

    const res = await POST(
      makeRequest({ viewId: "view-missing", duration: 10, demoId: "demo-1" })
    );

    expect(res.status).toBe(404);
    expect(prisma.view.update).not.toHaveBeenCalled();
  });
});
