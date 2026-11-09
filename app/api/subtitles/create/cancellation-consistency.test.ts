import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  findDemo: vi.fn(),
  createJob: vi.fn(),
  findJob: vi.fn(),
  updateJob: vi.fn(),
  updateMany: vi.fn(),
  updateDemo: vi.fn(),
  upsertTrack: vi.fn(),
  transaction: vi.fn(),
  worker: vi.fn(),
  limited: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));
vi.mock("@/app/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.limited,
}));
vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpSubtitles: mocks.worker,
}));
vi.mock("groq-sdk", () => ({
  default: class MockGroq {},
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser },
    demo: {
      findUnique: mocks.findDemo,
      update: mocks.updateDemo,
    },
    videoJob: {
      create: mocks.createJob,
      findUnique: mocks.findJob,
      update: mocks.updateJob,
      updateMany: mocks.updateMany,
    },
    subtitleTrack: { upsert: mocks.upsertTrack },
    $transaction: mocks.transaction,
  },
}));

import { POST as createSubtitles } from "./route";
import { POST as cancelSubtitles } from "../cancel/route";

describe("subtitle result persistence after acknowledged cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.findDemo.mockResolvedValue({ id: "demo-1", userId: "user-1" });
    mocks.limited.mockResolvedValue(false);
    mocks.worker.mockResolvedValue([{ start: 0, end: 1, text: "New worker result" }]);
    mocks.upsertTrack.mockResolvedValue({});
  });

  it("discards results when cancellation wins immediately before persistence", async () => {
    const record = {
      id: "job-1",
      userId: "user-1",
      demoId: "demo-1",
      status: "PROCESSING",
      progress: 10,
      error: null as string | null,
      jobData: { kind: "SUBTITLES" } as Record<string, unknown>,
    };

    const originalCues = [{ start: 0, end: 1, text: "Existing saved subtitle" }];
    let demoCues: unknown = originalCues;
    let cancellationTriggered = false;
    let cancellationStatus: number | undefined;
    let cancellationBody: unknown;

    async function cancelBeforePersistence(data: Partial<typeof record>) {
      if (!cancellationTriggered && (data.progress === 80 || data.status === "COMPLETED")) {
        cancellationTriggered = true;
        const response = await cancelSubtitles(
          new NextRequest("http://localhost/api/subtitles/cancel", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobId: "job-1" }),
          })
        );
        cancellationStatus = response.status;
        cancellationBody = await response.json();
      }
    }

    mocks.createJob.mockResolvedValue({ ...record });
    mocks.findJob.mockImplementation(async () => ({ ...record }));

    mocks.updateJob.mockImplementation(async ({ data }: { data: Partial<typeof record> }) => {
      await cancelBeforePersistence(data);
      Object.assign(record, data);
      return { ...record };
    });

    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
          userId?: string;
          status?: { in?: string[]; notIn?: string[] } | string;
        };
        data: Partial<typeof record>;
      }) => {
        await cancelBeforePersistence(data);

        if (where.id !== record.id || (where.userId && where.userId !== record.userId)) {
          return { count: 0 };
        }

        if (typeof where.status === "string") {
          if (where.status !== record.status) {
            return { count: 0 };
          }
        } else if (where.status) {
          if (where.status.in && !where.status.in.includes(record.status)) {
            return { count: 0 };
          }
          if (where.status.notIn?.includes(record.status)) {
            return { count: 0 };
          }
        }

        Object.assign(record, data);
        return { count: 1 };
      }
    );

    mocks.updateDemo.mockImplementation(async ({ data }: { data: { subtitles: unknown } }) => {
      demoCues = data.subtitles;
      return { id: "demo-1" };
    });

    const transactionClient = {
      videoJob: {
        findUnique: mocks.findJob,
        update: mocks.updateJob,
        updateMany: mocks.updateMany,
      },
      demo: { update: mocks.updateDemo },
      subtitleTrack: { upsert: mocks.upsertTrack },
    };
    mocks.transaction.mockImplementation(
      async (work: (tx: typeof transactionClient) => Promise<unknown>) => work(transactionClient)
    );

    const response = await createSubtitles(
      new NextRequest("http://localhost/api/subtitles/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          demoId: "demo-1",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);

    const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await dispatch();

    expect(cancellationTriggered).toBe(true);
    expect(cancellationStatus).toBe(200);
    expect(cancellationBody).toEqual({
      success: true,
      cancelled: true,
      status: "CANCELLED",
    });
    expect(record.status).toBe("CANCELLED");
    expect(record.error).toBe("Cancelled by the user");
    expect(demoCues).toEqual(originalCues);
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });
});
