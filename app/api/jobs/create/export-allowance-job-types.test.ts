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

const baseBody = {
  videoUrl: "https://example.com/video.mp4",
  duration: 20,
  segments: [],
  zoomEffects: [],
  textOverlays: [],
};

describe("export allowance job-type isolation", () => {
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

  it.each(["PROCESSING", "COMPLETED"])(
    "does not charge three %s subtitle jobs against export allowance",
    async (status) => {
      const jobs = Array.from({ length: 3 }, (_, index) => ({
        id: `subtitle-${index}`,
        userId: "user-1",
        status,
        jobData: { kind: "SUBTITLES" },
      }));

      type JobFilter = {
        userId: string;
        status?: string | { in: string[] };
        jobData?: { path: string[]; equals?: unknown };
      };

      function matchingJobs(where: JobFilter) {
        const acceptedStatuses =
          typeof where.status === "string" ? [where.status] : where.status?.in;

        return jobs.filter((job) => {
          if (job.userId !== where.userId) {
            return false;
          }

          if (acceptedStatuses && !acceptedStatuses.includes(job.status)) {
            return false;
          }

          if (where.jobData?.path.join(".") === "kind") {
            return job.jobData.kind === where.jobData.equals;
          }

          return true;
        });
      }

      const tx = {
        $queryRaw: vi.fn(async () => []),
        videoJob: {
          count: vi.fn(async ({ where }: { where: JobFilter }) => matchingJobs(where).length),
          findMany: vi.fn(async ({ where }: { where: JobFilter }) => matchingJobs(where)),
          create: vi.fn(async () => ({ id: "first-real-export" })),
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

      const response = await POST(makeRequest(baseBody));

      expect(response.status).toBe(200);
      expect(tx.videoJob.create).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
    }
  );

  // mixed job history coverage
  type AllowanceJob = {
    userId: string;
    status: string;
    jobData: unknown;
  };

  function installJobs(jobs: AllowanceJob[], saved = 0) {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      videoJob: {
        findMany: vi.fn(
          async ({ where }: { where: { userId: string; status: { in: string[] } } }) =>
            jobs.filter(
              (job) => job.userId === where.userId && where.status.in.includes(job.status)
            )
        ),
        create: vi.fn(async () => ({ id: "new-export" })),
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

  const otherFeatureCases = ["DUBBING", "AVS_DUB", "REFRAME"].flatMap((kind) =>
    ["PROCESSING", "COMPLETED"].map((status) => ({ kind, status }))
  );

  it.each(otherFeatureCases)(
    "excludes $status jobs belonging to $kind",
    async ({ kind, status }) => {
      const tx = installJobs(
        Array.from({ length: 3 }, () => ({
          userId: "user-1",
          status,
          jobData: { kind },
        }))
      );

      const response = await POST(makeRequest(baseBody));

      expect(response.status).toBe(200);
      expect(tx.videoJob.create).toHaveBeenCalledTimes(1);
      expect(after).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["PENDING", "PROCESSING", "COMPLETED"])(
    "counts explicitly tagged EXPORT jobs with status %s",
    async (status) => {
      const tx = installJobs(
        Array.from({ length: 3 }, () => ({
          userId: "user-1",
          status,
          jobData: { kind: "EXPORT" },
        }))
      );

      const response = await POST(makeRequest(baseBody));

      expect(response.status).toBe(403);
      expect(tx.videoJob.create).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    }
  );

  it.each([{ jobData: null }, { jobData: {} }])(
    "continues reserving legacy exports with metadata %j",
    async ({ jobData }) => {
      const tx = installJobs(
        Array.from({ length: 3 }, () => ({
          userId: "user-1",
          status: "PENDING",
          jobData,
        }))
      );

      const response = await POST(makeRequest(baseBody));

      expect(response.status).toBe(403);
      expect(tx.videoJob.create).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    }
  );

  it.each([
    {
      name: "allows the last slot despite unrelated completed jobs",
      exportStatuses: ["COMPLETED", "PENDING"],
      saved: 0,
      expected: 200,
    },
    {
      name: "blocks when real exports exhaust all slots",
      exportStatuses: ["COMPLETED", "COMPLETED", "PROCESSING"],
      saved: 0,
      expected: 403,
    },
    {
      name: "combines saved exports with a real pending export",
      exportStatuses: ["PENDING"],
      saved: 2,
      expected: 403,
    },
  ])("$name", async ({ exportStatuses, saved, expected }) => {
    const jobs: AllowanceJob[] = [
      ...exportStatuses.map((status) => ({
        userId: "user-1",
        status,
        jobData: { kind: "EXPORT" },
      })),
      ...Array.from({ length: 8 }, () => ({
        userId: "user-1",
        status: "COMPLETED",
        jobData: { kind: "SUBTITLES" },
      })),
    ];

    const tx = installJobs(jobs, saved);
    const response = await POST(makeRequest(baseBody));

    expect(response.status).toBe(expected);
    expect(tx.videoJob.create).toHaveBeenCalledTimes(expected === 200 ? 1 : 0);
    expect(after).toHaveBeenCalledTimes(expected === 200 ? 1 : 0);
  });
});
