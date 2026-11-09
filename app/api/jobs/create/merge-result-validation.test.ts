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

describe("export merge result validation", () => {
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
        expect(where.id).toBe("job-1");
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

  it.each([{}, { exportedUrl: "" }, { exportedUrl: "   " }])(
    "does not complete an export with unusable merge output %j",
    async (result) => {
      mocks.invoke
        .mockResolvedValueOnce({
          result: { processedObject: "job-1_chunk_000.mp4" },
        })
        .mockResolvedValueOnce({ result });

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

      expect(mocks.invoke).toHaveBeenCalledTimes(2);
      expect(mocks.invoke.mock.calls[1][1]).toBe("/merge");

      expect(mocks.update.mock.calls.some(([args]) => args.data.status === "COMPLETED")).toBe(
        false
      );

      expect(mocks.update).toHaveBeenCalledWith({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: expect.any(String),
        }),
      });
    }
  );

  async function dispatchWithOutput(exportedUrl: unknown) {
    mocks.invoke
      .mockResolvedValueOnce({
        result: { processedObject: "job-1_chunk_000.mp4" },
      })
      .mockResolvedValueOnce({ result: { exportedUrl } });

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
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  }

  it.each([
    { exportedUrl: null },
    { exportedUrl: 123 },
    { exportedUrl: true },
    { exportedUrl: {} },
    { exportedUrl: [] },
  ])("rejects a merge output URL with the wrong type: %j", async ({ exportedUrl }) => {
    await dispatchWithOutput(exportedUrl);

    expect(mocks.update.mock.calls.some(([args]) => args.data.status === "COMPLETED")).toBe(false);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        error: "Merge worker returned no usable export URL",
      },
    });
  });

  it.each([
    "  https://example.com/completed.mp4  ",
    "s3://processed-bucket/exports/completed.mp4",
    "gs://processed-bucket/exports/completed.mp4",
  ])("preserves a valid output and trims surrounding whitespace: %s", async (exportedUrl) => {
    await dispatchWithOutput(exportedUrl);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "COMPLETED",
        progress: 100,
        exportedUrl: exportedUrl.trim(),
      },
    });

    expect(mocks.update.mock.calls.some(([args]) => args.data.status === "FAILED")).toBe(false);
  });
});
