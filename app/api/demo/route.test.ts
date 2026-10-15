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
    },
    demo: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { PATCH, POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/demo validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(prisma.demo.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.demo.create).mockResolvedValue({ id: "demo-1" } as never);
    vi.mocked(prisma.demo.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it("POST creates a demo for a valid request", async () => {
    const res = await POST(
      makeRequest({ title: "Demo", videoUrl: "https://example.com/a.mp4" })
    );

    expect(res.status).toBe(200);
    expect(prisma.demo.create).toHaveBeenCalledOnce();
  });

  it("POST returns 400 for an unsafe videoUrl", async () => {
    const res = await POST(
      makeRequest({ title: "Demo", videoUrl: "http://127.0.0.1/a.mp4" })
    );

    expect(res.status).toBe(400);
    expect(prisma.demo.create).not.toHaveBeenCalled();
  });

  it("POST returns 413 for an overlong title", async () => {
    const res = await POST(
      makeRequest({ title: "x".repeat(201), videoUrl: "https://example.com/a.mp4" })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.create).not.toHaveBeenCalled();
  });

  it("POST returns 413 for an overlong description", async () => {
    const res = await POST(
      makeRequest({
        title: "Demo",
        description: "x".repeat(2001),
        videoUrl: "https://example.com/a.mp4",
      })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.create).not.toHaveBeenCalled();
  });

  it("POST returns 413 for an oversized editing payload", async () => {
    const res = await POST(
      makeRequest({
        title: "Demo",
        videoUrl: "https://example.com/a.mp4",
        editing: { blob: "x".repeat(600 * 1024) },
      })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.create).not.toHaveBeenCalled();
  });

  it("POST measures multibyte editing in bytes, not string length", async () => {
    // "😀" is 4 bytes but 2 UTF-16 code units: 300K units < 512KiB yet 600KB > 512KiB.
    const res = await POST(
      makeRequest({
        title: "Demo",
        videoUrl: "https://example.com/a.mp4",
        editing: { blob: "😀".repeat(150 * 1024) },
      })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.create).not.toHaveBeenCalled();
  });

  it("PATCH updates a demo for a valid request", async () => {
    const res = await PATCH(
      makeRequest({ id: "demo-1", exportedUrl: "https://example.com/out.mp4" })
    );

    expect(res.status).toBe(200);
    expect(prisma.demo.updateMany).toHaveBeenCalledOnce();
  });

  it("PATCH returns 400 for an unsafe exportedUrl", async () => {
    const res = await PATCH(
      makeRequest({ id: "demo-1", exportedUrl: "http://169.254.169.254/out.mp4" })
    );

    expect(res.status).toBe(400);
    expect(prisma.demo.updateMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 413 for an overlong title", async () => {
    const res = await PATCH(makeRequest({ id: "demo-1", title: "x".repeat(201) }));

    expect(res.status).toBe(413);
    expect(prisma.demo.updateMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 413 for an overlong description", async () => {
    const res = await PATCH(
      makeRequest({ id: "demo-1", description: "x".repeat(2001) })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.updateMany).not.toHaveBeenCalled();
  });

  it("PATCH returns 413 for an oversized editing payload", async () => {
    const res = await PATCH(
      makeRequest({ id: "demo-1", editing: { blob: "x".repeat(600 * 1024) } })
    );

    expect(res.status).toBe(413);
    expect(prisma.demo.updateMany).not.toHaveBeenCalled();
  });
});
