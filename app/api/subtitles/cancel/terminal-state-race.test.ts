import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  findJob: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
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
      findUnique: mocks.findJob,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

import { POST } from "./route";

describe("subtitle cancellation terminal-state race", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
  });

  it.each(["COMPLETED", "FAILED"])(
    "preserves %s when the job settles after the cancellation status read",
    async (terminalStatus) => {
      const record = {
        id: "job-1",
        userId: "user-1",
        status: "PROCESSING",
        jobData: { kind: "SUBTITLES" },
        error: null as string | null,
      };

      let firstRead = true;

      mocks.findJob.mockImplementation(async () => {
        const snapshot = { ...record };

        if (firstRead) {
          firstRead = false;
          record.status = terminalStatus;
        }

        return snapshot;
      });

      mocks.update.mockImplementation(async ({ data }: { data: Partial<typeof record> }) => {
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
            userId: string;
            status: { in: string[] };
          };
          data: Partial<typeof record>;
        }) => {
          expect(where.id).toBe("job-1");
          expect(where.userId).toBe("user-1");

          if (!where.status.in.includes(record.status)) {
            return { count: 0 };
          }

          Object.assign(record, data);
          return { count: 1 };
        }
      );

      const response = await POST(
        new NextRequest("http://localhost/api/subtitles/cancel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: "job-1" }),
        })
      );

      expect(response.status).toBe(200);
      expect(record.status).toBe(terminalStatus);
      expect(record.error).toBeNull();
      expect(await response.json()).toEqual({
        success: true,
        cancelled: false,
        status: terminalStatus,
      });
    }
  );

  // cancellation boundary coverage
  type TestJob = {
    id: string;
    userId: string;
    status: string;
    jobData: { kind: string };
    error: string | null;
  };

  function cancellationRequest() {
    return new NextRequest("http://localhost/api/subtitles/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "job-1" }),
    });
  }

  function installJob(overrides: Partial<TestJob> = {}) {
    const record: TestJob = {
      id: "job-1",
      userId: "user-1",
      status: "PROCESSING",
      jobData: { kind: "SUBTITLES" },
      error: null,
      ...overrides,
    };

    mocks.findJob.mockImplementation(async () => ({ ...record }));
    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
          userId: string;
          status: { in: string[] };
          jobData: { path: string[]; equals: string };
        };
        data: Partial<TestJob>;
      }) => {
        expect(where.jobData).toEqual({
          path: ["kind"],
          equals: "SUBTITLES",
        });
        expect(where.status.in).toEqual(["PENDING", "PROCESSING"]);

        if (
          where.id !== record.id ||
          where.userId !== record.userId ||
          !where.status.in.includes(record.status) ||
          where.jobData.equals !== record.jobData.kind
        ) {
          return { count: 0 };
        }

        Object.assign(record, data);
        return { count: 1 };
      }
    );

    return record;
  }

  it.each(["PENDING", "PROCESSING"])(
    "cancels an owned active subtitle job in state %s",
    async (status) => {
      const record = installJob({ status });

      const response = await POST(cancellationRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        cancelled: true,
        status: "CANCELLED",
      });
      expect(record.status).toBe("CANCELLED");
      expect(record.error).toBe("Cancelled by the user");
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it.each(["COMPLETED", "FAILED"])("leaves an already settled %s job unchanged", async (status) => {
    const record = installJob({
      status,
      error: status === "FAILED" ? "Original worker failure" : null,
    });
    const original = { ...record };

    const response = await POST(cancellationRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      cancelled: false,
      status,
    });
    expect(record).toEqual(original);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps repeated cancellation idempotent", async () => {
    const record = installJob();

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(cancellationRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        cancelled: true,
        status: "CANCELLED",
      });
    }

    expect(record.status).toBe("CANCELLED");
    expect(record.error).toBe("Cancelled by the user");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects another user's job before writing", async () => {
    const record = installJob({ userId: "user-2" });

    const response = await POST(cancellationRequest());

    expect(response.status).toBe(404);
    expect(record.status).toBe("PROCESSING");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an export job before writing", async () => {
    const record = installJob({ jobData: { kind: "EXPORT" } });

    const response = await POST(cancellationRequest());

    expect(response.status).toBe(400);
    expect(record.status).toBe("PROCESSING");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated cancellation before database access", async () => {
    mocks.session.mockResolvedValue(null);

    const response = await POST(cancellationRequest());

    expect(response.status).toBe(401);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.findJob).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each(["deleted", "ownership changed"])(
    "returns 404 if the job is %s before the final status read",
    async (change) => {
      const record = installJob();

      mocks.updateMany.mockResolvedValue({ count: 0 });
      mocks.findJob
        .mockResolvedValueOnce({ ...record })
        .mockResolvedValueOnce(change === "deleted" ? null : { ...record, userId: "user-2" });

      const response = await POST(cancellationRequest());

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Job not found" });
      expect(record.status).toBe("PROCESSING");
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );
});
