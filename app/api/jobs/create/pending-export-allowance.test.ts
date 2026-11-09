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
      findMany: vi.fn(),
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

const baseBody = {
  videoUrl: "https://example.com/video.mp4",
  duration: 20,
  segments: [],
  zoomEffects: [],
  textOverlays: [],
};

describe("free export allowance reservations", () => {
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

  it.each([0, 2])(
    "reserves pending exports when the user already has %i completed exports",
    async (completedCount) => {
      const jobs: Array<{
        id: string;
        userId: string;
        status: string;
      }> = Array.from({ length: completedCount }, (_, index) => ({
        id: `completed-${index}`,
        userId: "user-1",
        status: "COMPLETED",
      }));

      const tx = {
        $queryRaw: vi.fn(async () => []),
        videoJob: {
          findMany: vi.fn(
            async ({
              where,
            }: {
              where: {
                userId: string;
                status?: string | { in: string[] };
              };
            }) => {
              const statuses = typeof where.status === "string" ? [where.status] : where.status?.in;

              return jobs.filter(
                (job) => job.userId === where.userId && (!statuses || statuses.includes(job.status))
              );
            }
          ),
          create: vi.fn(async ({ data }: { data: { userId: string; status: string } }) => {
            const job = {
              id: `new-job-${jobs.length}`,
              userId: data.userId,
              status: data.status,
            };
            jobs.push(job);
            return job;
          }),
        },
        exportedVideo: {
          count: vi.fn(async () => 0),
        },
      };

      const mockedTransaction = prisma.$transaction as unknown as {
        mockImplementation: (
          implementation: (work: (client: typeof tx) => Promise<unknown>) => Promise<unknown>
        ) => void;
      };

      mockedTransaction.mockImplementation(async (work) => work(tx));

      const statuses: number[] = [];

      // Submit one more request than the remaining allowance.
      // Background processing stays mocked, so accepted jobs remain PENDING.
      for (let index = 0; index < 4 - completedCount; index++) {
        const response = await POST(makeRequest(baseBody));
        statuses.push(response.status);
      }

      expect(statuses).toEqual([...Array<number>(3 - completedCount).fill(200), 403]);
      expect(tx.videoJob.create).toHaveBeenCalledTimes(3 - completedCount);
      expect(after).toHaveBeenCalledTimes(3 - completedCount);
    }
  );

  // allowance boundary coverage
  function installAllowanceState(statuses: string[], saved = 0, otherUserJobs = 0) {
    const jobs = [
      ...statuses.map((status) => ({ userId: "user-1", status })),
      ...Array.from({ length: otherUserJobs }, () => ({
        userId: "another-user",
        status: "PROCESSING",
      })),
    ];

    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: {
        findMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
              status?: string | { in: string[] };
            };
          }) => {
            const accepted = typeof where.status === "string" ? [where.status] : where.status?.in;

            return jobs.filter(
              (job) => job.userId === where.userId && (!accepted || accepted.includes(job.status))
            );
          }
        ),
        create: vi.fn(async ({ data }: { data: { userId: string; status: string } }) => {
          jobs.push({ userId: data.userId, status: data.status });
          return { id: "new-export" };
        }),
      },
      exportedVideo: {
        count: vi.fn(async ({ where }: { where: { userId: string } }) => {
          expect(where.userId).toBe("user-1");
          return saved;
        }),
      },
    };

    const mockedTransaction = prisma.$transaction as unknown as {
      mockImplementation: (
        implementation: (work: (client: typeof tx) => Promise<unknown>) => Promise<unknown>
      ) => void;
    };

    mockedTransaction.mockImplementation(async (work) => work(tx));
    return tx;
  }

  it.each([
    {
      name: "pending jobs reserve the remaining allowance",
      statuses: ["COMPLETED", "COMPLETED", "PENDING"],
      saved: 0,
      otherUserJobs: 0,
      expected: 403,
    },
    {
      name: "processing jobs reserve the remaining allowance",
      statuses: ["COMPLETED", "COMPLETED", "PROCESSING"],
      saved: 0,
      otherUserJobs: 0,
      expected: 403,
    },
    {
      name: "failed jobs do not reserve allowance",
      statuses: ["COMPLETED", "COMPLETED", "FAILED"],
      saved: 0,
      otherUserJobs: 0,
      expected: 200,
    },
    {
      name: "cancelled jobs do not reserve allowance",
      statuses: ["COMPLETED", "COMPLETED", "CANCELLED"],
      saved: 0,
      otherUserJobs: 0,
      expected: 200,
    },
    {
      name: "saved exports and pending jobs exhaust allowance together",
      statuses: ["PENDING"],
      saved: 2,
      otherUserJobs: 0,
      expected: 403,
    },
    {
      name: "completed and saved counts retain the existing overlap rule",
      statuses: ["COMPLETED", "COMPLETED"],
      saved: 2,
      otherUserJobs: 0,
      expected: 200,
    },
    {
      name: "another user's active jobs do not consume allowance",
      statuses: [],
      saved: 0,
      otherUserJobs: 3,
      expected: 200,
    },
  ])("$name", async ({ statuses, saved, otherUserJobs, expected }) => {
    const tx = installAllowanceState(statuses, saved, otherUserJobs);

    const response = await POST(makeRequest(baseBody));

    expect(response.status).toBe(expected);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.videoJob.create).toHaveBeenCalledTimes(expected === 200 ? 1 : 0);
    expect(after).toHaveBeenCalledTimes(expected === 200 ? 1 : 0);

    if (expected === 403) {
      expect(await response.json()).toEqual({
        error: "Free trial limit of 3 exports reached. Please upgrade your plan.",
      });
    }
  });

  it.each(["PRO", "ENTERPRISE"])(
    "keeps %s users exempt from free export allowance",
    async (plan) => {
      const tx = installAllowanceState(["COMPLETED", "COMPLETED", "COMPLETED", "PROCESSING"], 3);

      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "user-1",
        plan,
      } as never);

      const response = await POST(makeRequest(baseBody));

      expect(response.status).toBe(200);
      expect(tx.videoJob.findMany).not.toHaveBeenCalled();
      expect(tx.exportedVideo.count).not.toHaveBeenCalled();
      expect(tx.videoJob.create).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
    }
  );
});
