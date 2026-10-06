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
      findFirst: vi.fn(),
    },
    demo: {
      findUnique: vi.fn(),
    },
    videoJob: {
      count: vi.fn(),
      create: vi.fn(),
    },
    exportedVideo: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/app/lib/subtitles", () => ({
  normalizeLanguage: vi.fn((v: unknown) => (typeof v === "string" && v ? v : "multi")),
  sanitizeSubtitleStyle: vi.fn(() => undefined),
}));

vi.mock("@/app/lib/wtm/flags", () => ({
  isWtmEnabled: vi.fn(() => false),
}));

vi.mock("@/app/lib/wtm/access", () => ({
  isWtmAllowed: vi.fn(() => false),
}));

vi.mock("@/app/lib/wtm/watermark", () => ({
  resolveWatermarkForPlan: vi.fn(() => undefined),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/jobs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseBody = {
  videoUrl: "https://example.com/video.mp4",
  duration: 20,
  segments: [],
  zoomEffects: [],
  textOverlays: [],
};

describe("POST /api/jobs/create paywall race (#444)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "free@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "FREE",
    } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue(null as never);
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
          return 1;
        }),
        create: vi.fn(async () => {
          order.push("create");
          return { id: "job-123" };
        }),
      },
      exportedVideo: {
        count: vi.fn(async () => {
          order.push("count-saved");
          return 1;
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

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobId).toBe("job-123");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // FOR UPDATE lock issued against the caller row
    const rawCall = (tx.$queryRaw as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const rawStrings = rawCall[0] as unknown as { raw?: string[] };
    const rawQuery = Array.isArray(rawStrings)
      ? (rawStrings as unknown as string[]).join("")
      : typeof rawStrings === "object" && rawStrings !== null && "raw" in rawStrings
        ? (rawStrings.raw as string[]).join("")
        : String(rawStrings);
    expect(rawQuery).toContain("FOR UPDATE");

    expect(order).toEqual(["transaction", "lock", "count-job", "count-saved", "create"]);
    // No allowance check outside the transaction (the race).
    expect(vi.mocked(prisma.videoJob.count)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.exportedVideo.count)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.videoJob.create)).not.toHaveBeenCalled();
  });

  it("returns 403 without creating when the trial limit is reached", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: {
        count: vi.fn(async () => 3),
        create: vi.fn(async () => ({ id: "job-should-not-exist" })),
      },
      exportedVideo: {
        count: vi.fn(async () => 3),
      },
    };
    const mockedTx = prisma.$transaction as unknown as {
      mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
    };
    mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(tx);
    });

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Free trial limit");
    expect(tx.videoJob.create).not.toHaveBeenCalled();
  });
});
