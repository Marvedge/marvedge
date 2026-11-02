import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findJob: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  updateDemo: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: mocks.findJob,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    demo: { update: mocks.updateDemo },
  },
}));

import { POST } from "./route";

describe("worker progress callback integrity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CALLBACK_SECRET", "qa-callback-secret");
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["AVS_DUB", "EXPORT"])(
    "keeps a %s job processing when a progress callback arrives",
    async (kind) => {
      mocks.findJob.mockResolvedValue({
        id: "job-1",
        demoId: "demo-1",
        status: "PROCESSING",
        jobData: { kind },
      });

      const response = await POST(
        new NextRequest("http://localhost/api/jobs/callback", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer qa-callback-secret",
          },
          body: JSON.stringify({
            jobId: "job-1",
            status: "PROCESSING",
            progress: 42,
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(mocks.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PROCESSING",
            progress: 42,
          }),
        })
      );
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.updateDemo).not.toHaveBeenCalled();
    }
  );
});

function progressRequest(progress: unknown) {
  return new NextRequest("http://localhost/api/jobs/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer qa-callback-secret",
    },
    body: JSON.stringify({
      jobId: "job-1",
      status: "PROCESSING",
      progress,
    }),
  });
}

describe("progress validation and terminal-state protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CALLBACK_SECRET", "qa-callback-secret");
    mocks.findJob.mockResolvedValue({
      id: "job-1",
      demoId: "demo-1",
      status: "PROCESSING",
      jobData: { kind: "AVS_DUB" },
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, null, "42", -1, 101])(
    "rejects invalid progress %s without writes",
    async (progress) => {
      const response = await POST(progressRequest(progress));

      expect(response.status).toBe(400);
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.updateDemo).not.toHaveBeenCalled();
    }
  );

  it.each([0, 100])("accepts boundary progress %i", async (progress) => {
    const response = await POST(progressRequest(progress));

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "job-1",
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: { status: "PROCESSING", progress },
    });
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("ignores progress if completion wins the database race", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(progressRequest(42));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ success: true, ignored: true })
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "job-1",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      })
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "CANCELLED"])("ignores progress for an already %s job", async (status) => {
    mocks.findJob.mockResolvedValue({
      id: "job-1",
      demoId: "demo-1",
      status,
      jobData: { kind: "EXPORT" },
    });

    const response = await POST(progressRequest(42));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ ignored: true }));
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });
});
