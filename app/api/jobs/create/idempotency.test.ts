import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(),
  findJob: vi.fn(),
  findFirstJob: vi.fn(),
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
      findFirst: mocks.findFirstJob,
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

describe("Idempotent Job Creation (Task 113)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1", plan: "PRO" });
    mocks.limited.mockResolvedValue(false);
    mocks.findJob.mockResolvedValue(null);
    mocks.findFirstJob.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "job-created-1" });
    mocks.update.mockResolvedValue({ id: "job-created-1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });

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

  it("creates a new job and dispatches worker when idempotencyKey is used for the first time", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "test-idem-key-1",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, jobId: "job-created-1" });

    // Assert that the key was queried first
    expect(mocks.findFirstJob).toHaveBeenCalledWith({
      where: { userId: "user-1", idempotencyKey: "test-idem-key-1" },
      select: { id: true },
    });

    // Assert that create was called with the idempotencyKey
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          idempotencyKey: "test-idem-key-1",
        }),
      })
    );

    // Worker dispatch was scheduled
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("returns existing job without creating or dispatching when the same idempotencyKey is sent again", async () => {
    // Existing job is returned by findFirst
    mocks.findFirstJob.mockResolvedValueOnce({ id: "job-existing-123" });

    const res = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "test-idem-key-1",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, jobId: "job-existing-123" });

    // No creation and no dispatch
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("handles concurrent requests race with P2002 error by returning the winner's job", async () => {
    // Initially not found before transaction
    mocks.findFirstJob.mockResolvedValueOnce(null);

    // Inside transaction, create throws P2002 unique constraint violation
    const p2002Error = new Error("Unique constraint failed");
    (p2002Error as unknown as { code: string }).code = "P2002";
    mocks.create.mockRejectedValueOnce(p2002Error);

    // Fallback query in catch block finds the job inserted by the concurrent request
    mocks.findFirstJob.mockResolvedValueOnce({ id: "job-winner-999" });

    const res = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "race-key-xyz",
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, jobId: "job-winner-999" });

    // Worker dispatch was not scheduled on the duplicate
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects invalid idempotencyKey (non-string or empty)", async () => {
    const resEmpty = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "   ",
        }),
      })
    );

    expect(resEmpty.status).toBe(400);
    const bodyEmpty = await resEmpty.json();
    expect(bodyEmpty).toEqual({ error: "Invalid idempotencyKey" });

    const resNonString = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: 12345,
        }),
      })
    );

    expect(resNonString.status).toBe(400);
    const bodyNonString = await resNonString.json();
    expect(bodyNonString).toEqual({ error: "Invalid idempotencyKey" });
  });

  it("allows different users to use the same idempotency key independently", async () => {
    // User 1 creates job with key-common
    mocks.create.mockResolvedValueOnce({ id: "job-user1" });
    const resUser1 = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "key-common",
        }),
      })
    );
    expect(resUser1.status).toBe(200);
    expect((await resUser1.json()).jobId).toBe("job-user1");

    // User 2 uses same key-common
    mocks.session.mockResolvedValueOnce({
      user: { id: "user-2", email: "other@example.test" },
    });
    mocks.findUser.mockResolvedValueOnce({ id: "user-2", plan: "PRO" });
    mocks.create.mockResolvedValueOnce({ id: "job-user2" });

    const resUser2 = await POST(
      new NextRequest("http://localhost/api/jobs/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoUrl: "https://example.com/source.mp4",
          duration: 10,
          idempotencyKey: "key-common",
        }),
      })
    );
    expect(resUser2.status).toBe(200);
    expect((await resUser2.json()).jobId).toBe("job-user2");

    // Verified findFirst was queried per-user
    expect(mocks.findFirstJob).toHaveBeenLastCalledWith({
      where: { userId: "user-2", idempotencyKey: "key-common" },
      select: { id: true },
    });
  });
});
