import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(),
  findJob: vi.fn(),
  update: vi.fn(),
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

describe("export worker cold-start recovery", () => {
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

  it("retries a temporary fetch failure and completes the export", async () => {
    mocks.invoke
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        result: { processedObject: "job-1_chunk_000.mp4" },
      })
      .mockResolvedValueOnce({
        result: { exportedUrl: "https://example.com/completed.mp4" },
      });

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

    expect(mocks.invoke).toHaveBeenCalledTimes(3);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "COMPLETED",
        progress: 100,
        exportedUrl: "https://example.com/completed.mp4",
      },
    });
    expect(mocks.update.mock.calls.some(([args]) => args.data.status === "FAILED")).toBe(false);
  });

  async function runDispatch() {
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
  }

  it("marks the job failed after both transient attempts fail", async () => {
    mocks.invoke.mockRejectedValue(new Error("fetch failed"));

    await runDispatch();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);

    const failures = mocks.update.mock.calls.filter(([args]) => args.data.status === "FAILED");

    expect(failures).toHaveLength(1);
    expect(failures[0][0]).toEqual({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        error: "fetch failed",
      },
    });

    expect(mocks.update.mock.calls.some(([args]) => args.data.status === "COMPLETED")).toBe(false);
  });

  it("does not retry a permanent worker error", async () => {
    mocks.invoke.mockRejectedValue(new Error("Unsupported video codec"));

    await runDispatch();

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "FAILED",
        error: "Unsupported video codec",
      },
    });
  });

  it("completes a successful first attempt without retrying", async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        result: { processedObject: "job-1_chunk_000.mp4" },
      })
      .mockResolvedValueOnce({
        result: { exportedUrl: "https://example.com/completed.mp4" },
      });

    await runDispatch();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls.map((call) => call[1])).toEqual(["/process", "/merge"]);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "COMPLETED",
        progress: 100,
        exportedUrl: "https://example.com/completed.mp4",
      },
    });
    expect(mocks.update.mock.calls.some(([args]) => args.data.status === "FAILED")).toBe(false);
  });
});
