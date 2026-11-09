import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(),
  findJob: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  limited: vi.fn(),
  invoke: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));
vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser },
    videoJob: {
      create: mocks.create,
      findUnique: mocks.findJob,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpWorker: mocks.invoke,
}));
vi.mock("@/app/lib/storage/index", () => ({
  parseStorageUri: () => null,
  getPresignedUrl: vi.fn(),
}));
vi.mock("@/app/lib/storage/access", () => ({
  mayResolveObject: vi.fn(),
}));
vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.limited,
}));
vi.mock("@/app/lib/subtitles", () => ({
  normalizeLanguage: () => "multi",
  sanitizeSubtitleStyle: () => undefined,
}));
vi.mock("@/app/lib/wtm/flags", () => ({
  isWtmEnabled: () => false,
}));
vi.mock("@/app/lib/wtm/access", () => ({
  isWtmAllowed: () => true,
}));
vi.mock("@/app/lib/wtm/watermark", () => ({
  resolveWatermarkForPlan: vi.fn(),
}));

import { POST } from "./route";

describe("export dispatch terminal-state protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1", plan: "PRO" });
    mocks.limited.mockResolvedValue(false);
    mocks.create.mockResolvedValue({ id: "job-1" });
    mocks.findJob.mockResolvedValue({ status: "PENDING" });
    mocks.update.mockResolvedValue({ id: "job-1" });
    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string; status: { notIn: string[] } };
        data: Record<string, unknown>;
      }) => {
        expect(where.status.notIn).toEqual(["COMPLETED", "CANCELLED"]);
        await mocks.update({ where: { id: where.id }, data });
        return { count: 1 };
      }
    );
    mocks.transaction.mockImplementation(
      async (
        work: (tx: {
          $queryRaw: typeof mocks.queryRaw;
          videoJob: { create: typeof mocks.create };
        }) => Promise<unknown>
      ) =>
        work({
          $queryRaw: mocks.queryRaw,
          videoJob: { create: mocks.create },
        })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // settled export timing matrix
  const scenarios = ["COMPLETED", "CANCELLED"].flatMap((status) =>
    [
      "before dispatch",
      "between read and write",
      "during chunk processing",
      "before merge success",
      "before merge failure",
    ].map((timing) => ({ status, timing }))
  );

  it.each(scenarios)("preserves $status when settled $timing", async ({ status, timing }) => {
    const record = {
      status: "PENDING",
      progress: 0,
      exportedUrl: null as string | null,
      error: null as string | null,
    };

    const settledRecord = {
      status,
      progress: status === "COMPLETED" ? 100 : 42,
      exportedUrl: status === "COMPLETED" ? "https://example.com/callback-completed.mp4" : null,
      error: null,
    };

    function settle() {
      Object.assign(record, settledRecord);
    }

    mocks.findJob.mockImplementation(async () => {
      const snapshot = { status: record.status };

      if (timing === "between read and write") {
        settle();
      }

      return snapshot;
    });

    mocks.update.mockImplementation(async ({ data }: { data: Partial<typeof record> }) => {
      Object.assign(record, data);
      return { id: "job-1", ...record };
    });

    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string; status: { notIn: string[] } };
        data: Partial<typeof record>;
      }) => {
        expect(where.id).toBe("job-1");
        expect(where.status.notIn).toEqual(["COMPLETED", "CANCELLED"]);

        if (where.status.notIn.includes(record.status)) {
          return { count: 0 };
        }

        await mocks.update({ where: { id: where.id }, data });
        return { count: 1 };
      }
    );

    mocks.invoke
      .mockImplementationOnce(async () => {
        if (timing === "during chunk processing") {
          settle();
        }

        return {
          result: { processedObject: "job-1_chunk_000.mp4" },
        };
      })
      .mockImplementationOnce(async () => {
        settle();

        if (timing === "before merge failure") {
          throw new Error("Merge response connection lost");
        }

        return {
          result: {
            exportedUrl: "https://example.com/late-merge-output.mp4",
          },
        };
      });

    if (timing === "before dispatch") {
      settle();
    }

    const response = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.after).toHaveBeenCalledTimes(1);

    const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await dispatch();

    expect(record).toEqual(settledRecord);

    const expectedWorkerCalls =
      timing === "before dispatch" || timing === "between read and write"
        ? 0
        : timing === "during chunk processing"
          ? 1
          : 2;

    expect(mocks.invoke).toHaveBeenCalledTimes(expectedWorkerCalls);
  });
});
