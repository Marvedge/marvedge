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
      findFirst: vi.fn(),
    },
    videoJob: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    exportedVideo: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const storageMocks = vi.hoisted(() => ({
  getPresignedUrl: vi.fn(),
}));

vi.mock("@/app/lib/storage/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/storage/index")>();
  return {
    ...actual,
    getPresignedUrl: storageMocks.getPresignedUrl,
  };
});

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
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
import { after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { getPresignedUrl } from "@/app/lib/storage/index";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/jobs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(body: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/jobs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
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
    process.env.RAW_BUCKET = "test-raw-bucket";
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "free@example.com" },
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-1",
      plan: "FREE",
    } as never);
    vi.mocked(prisma.demo.findUnique).mockResolvedValue(null as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
    vi.mocked(getPresignedUrl).mockResolvedValue("https://signed.example/video.mp4");
    vi.mocked(prisma.demo.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.videoJob.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.exportedVideo.findFirst).mockResolvedValue(null as never);
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

  describe("duration validation (H4)", () => {
    it.each([
      ["missing", undefined],
      ["zero", 0],
      ["negative", -1],
      ["infinite string", "Infinity"],
      ["NaN string", "NaN"],
      ["over the six-hour ceiling", 6 * 60 * 60 + 1],
    ])("rejects a %s duration before resolving the user", async (_label, duration) => {
      const res = await POST(makeRequest({ ...baseBody, duration }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing or invalid duration" });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });

    it("rejects a JSON 1e400 duration that parses to Infinity", async () => {
      const res = await POST(
        makeRawRequest(
          '{"videoUrl":"https://example.com/video.mp4","duration":1e400,"segments":[],"zoomEffects":[],"textOverlays":[]}'
        )
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing or invalid duration" });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe("storage URI authorization (M4)", () => {
    it.each([
      ["another bucket", "s3://other-bucket/uploads/video/user-1/file.mp4"],
      ["an internal key", "s3://test-raw-bucket/internal/file.mp4"],
      ["another user's upload prefix", "gs://test-raw-bucket/uploads/video/user-2/file.mp4"],
    ])("refuses to sign %s", async (_label, videoUrl) => {
      const res = await POST(makeRequest({ ...baseBody, videoUrl }));

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Video URL is not allowed" });
      expect(getPresignedUrl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });

    it("refuses to sign an out-of-scope background object", async () => {
      const res = await POST(
        makeRequest({
          ...baseBody,
          customBackgroundUrl: "s3://other-bucket/uploads/image/user-1/bg.png",
        })
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Background URL is not allowed" });
      expect(getPresignedUrl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });

    it("signs the caller's own upload and creates the job", async () => {
      const tx = {
        $queryRaw: vi.fn(async () => []),
        videoJob: {
          count: vi.fn(async () => 0),
          create: vi.fn(async () => ({ id: "job-own-upload" })),
        },
        exportedVideo: {
          count: vi.fn(async () => 0),
        },
      };
      const mockedTx = prisma.$transaction as unknown as {
        mockImplementation: (fn: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>) => void;
      };
      mockedTx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

      const videoUrl = "s3://test-raw-bucket/uploads/video/user-1/file.mp4";
      const res = await POST(makeRequest({ ...baseBody, videoUrl }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ jobId: "job-own-upload" });
      expect(getPresignedUrl).toHaveBeenCalledWith(videoUrl);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
    });
  });

  describe("rate limiting (M6)", () => {
    it("returns 429 before signing or creating a job", async () => {
      vi.mocked(isRateLimited).mockResolvedValue(true);

      const res = await POST(makeRequest(baseBody));

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        error: "Too many export jobs. Please try again shortly.",
      });
      expect(isRateLimited).toHaveBeenCalledWith("jobs-create:user-1", 20, 10 * 60, true);
      expect(getPresignedUrl).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    });
  });
});
