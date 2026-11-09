import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(),
  };
});

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    videoJob: {
      count: vi.fn(),
    },
    exportedVideo: {
      count: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/app/lib/cloudinary-utils", () => ({
  deleteCloudinaryVideoByUrl: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/hls/package", () => ({
  packageDemoHls: vi.fn(async () => undefined),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/exported-videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/exported-videos paywall race (#444)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "free@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ plan: "FREE" } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue({
      id: "demo-1",
      userId: "user-1",
    } as never);
  });

  it("locks the user row then counts then creates inside one transaction", async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => {
        order.push("lock");
        return [];
      }),
      videoJob: {
        count: vi.fn(async () => {
          order.push("count-job");
          return 0;
        }),
      },
      exportedVideo: {
        count: vi.fn(async () => {
          order.push("count-saved");
          return 0;
        }),
        create: vi.fn(async () => {
          order.push("create");
          return { id: "export-1" };
        }),
      },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      order.push("transaction");
      return fn(tx);
    });

    const res = await POST(
      makeRequest({
        exportedUrl: "https://example.com/export.mp4",
        title: "Export",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const rawCall = (tx.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const rawStrings = rawCall[0] as unknown as { raw?: string[] };
    const rawQuery =
      typeof rawStrings === "object" && rawStrings !== null && "raw" in rawStrings
        ? (rawStrings.raw as string[]).join("")
        : String(rawStrings);
    expect(rawQuery).toContain("FOR UPDATE");

    expect(order).toEqual(["transaction", "lock", "count-job", "count-saved", "create"]);
    expect(vi.mocked(prisma.videoJob.count)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.exportedVideo.count)).not.toHaveBeenCalled();
  });

  it("returns 403 without creating when the trial limit is reached", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: { count: vi.fn(async () => 3) },
      exportedVideo: {
        count: vi.fn(async () => 3),
        create: vi.fn(async () => ({ id: "nope" })),
        upsert: vi.fn(async () => ({ id: "nope" })),
        findUnique: vi.fn(async () => null),
      },
      demo: { update: vi.fn(async () => ({})) },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(tx);
    });

    const res = await POST(
      makeRequest({
        exportedUrl: "https://example.com/export.mp4",
        title: "Export",
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Free trial limit");
    expect(tx.exportedVideo.create).not.toHaveBeenCalled();
    expect(tx.exportedVideo.upsert).not.toHaveBeenCalled();
  });
});
