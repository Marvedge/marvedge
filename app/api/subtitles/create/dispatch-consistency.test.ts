import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  findDemo: vi.fn(),
  createJob: vi.fn(),
  findJob: vi.fn(),
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
      updateMany: mocks.updateMany,
    },
    subtitleTrack: { upsert: mocks.upsertTrack },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

type Job = {
  id: string;
  demoId: string | null;
  status: string;
  progress: number;
  error: string | null;
  jobData: Record<string, unknown>;
};

type Write = {
  where: { id: string; status?: { in: string[] } };
  data: Partial<Job>;
};

const cues = [{ start: 0, end: 1, text: "Generated subtitles" }];
const originalCues = [{ start: 0, end: 1, text: "Existing subtitles" }];

let record: Job;
let savedCues: unknown;

const tx = {
  videoJob: {
    findUnique: mocks.findJob,
    updateMany: mocks.updateMany,
  },
  demo: { update: mocks.updateDemo },
};

async function runDispatch(demoId: string | null = "demo-1") {
  const response = await POST(
    new NextRequest("http://localhost/api/subtitles/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        videoUrl: "https://example.com/video.mp4",
        demoId,
        language: "en",
      }),
    })
  );

  expect(response.status).toBe(200);
  expect(mocks.after).toHaveBeenCalledTimes(1);

  const dispatch = mocks.after.mock.calls[0][0] as () => Promise<void>;
  await dispatch();
}

describe("subtitle dispatch persistence consistency", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    record = {
      id: "job-1",
      demoId: "demo-1",
      status: "PROCESSING",
      progress: 10,
      error: null,
      jobData: { kind: "SUBTITLES", language: "en" },
    };
    savedCues = structuredClone(originalCues);

    mocks.session.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.test" },
    });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.findDemo.mockResolvedValue({ id: "demo-1", userId: "user-1" });
    mocks.limited.mockResolvedValue(false);
    mocks.createJob.mockImplementation(async () => ({ ...record }));
    mocks.findJob.mockImplementation(async () => ({ ...record }));
    mocks.worker.mockResolvedValue(cues);
    mocks.upsertTrack.mockResolvedValue({});

    mocks.updateMany.mockImplementation(async ({ where, data }: Write) => {
      if (where.id !== record.id || (where.status && !where.status.in.includes(record.status))) {
        return { count: 0 };
      }
      Object.assign(record, data);
      return { count: 1 };
    });

    mocks.updateDemo.mockImplementation(async ({ data }: { data: { subtitles: unknown } }) => {
      savedCues = data.subtitles;
      return { id: "demo-1" };
    });

    // Model transaction rollback for the mocked persistence layer.
    mocks.transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
      const beforeJob = structuredClone(record);
      const beforeCues = structuredClone(savedCues);
      try {
        return await work(tx);
      } catch (error) {
        record = beforeJob;
        savedCues = beforeCues;
        throw error;
      }
    });
  });

  it("saves demo cues and completes an active job", async () => {
    await runDispatch();

    expect(record.status).toBe("COMPLETED");
    expect(record.progress).toBe(100);
    expect(record.jobData.subtitles).toEqual(cues);
    expect(savedCues).toEqual(cues);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.upsertTrack).toHaveBeenCalledTimes(1);
  });

  it("completes a job without a linked demo", async () => {
    record.demoId = null;

    await runDispatch(null);

    expect(record.status).toBe("COMPLETED");
    expect(record.jobData.subtitles).toEqual(cues);
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });

  it("does not call the worker for an already cancelled job", async () => {
    record.status = "CANCELLED";
    record.error = "Cancelled by the user";

    await runDispatch();

    expect(record.status).toBe("CANCELLED");
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });

  it("discards cues when cancellation happens during transcription", async () => {
    mocks.worker.mockImplementationOnce(async () => {
      record.status = "CANCELLED";
      record.error = "Cancelled by the user";
      return cues;
    });

    await runDispatch();

    expect(record.status).toBe("CANCELLED");
    expect(record.error).toBe("Cancelled by the user");
    expect(savedCues).toEqual(originalCues);
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(mocks.upsertTrack).not.toHaveBeenCalled();
  });

  it("rolls back completion when saving the demo fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.updateDemo.mockRejectedValueOnce(new Error("Demo write failed"));

    try {
      await runDispatch();

      expect(record.status).toBe("FAILED");
      expect(record.progress).not.toBe(100);
      expect(record.error).toBe("Demo write failed");
      expect(record.jobData.subtitles).toBeUndefined();
      expect(savedCues).toEqual(originalCues);
      expect(mocks.upsertTrack).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("keeps successful completion when optional track storage fails", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.upsertTrack.mockRejectedValueOnce(new Error("Track table unavailable"));

    try {
      await runDispatch();

      expect(record.status).toBe("COMPLETED");
      expect(savedCues).toEqual(cues);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("preserves cancellation when the worker subsequently fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.worker.mockImplementationOnce(async () => {
      record.status = "CANCELLED";
      record.error = "Cancelled by the user";
      throw new Error("Worker disconnected");
    });

    try {
      await runDispatch();

      expect(record.status).toBe("CANCELLED");
      expect(record.error).toBe("Cancelled by the user");
      expect(savedCues).toEqual(originalCues);
      expect(mocks.updateDemo).not.toHaveBeenCalled();
      expect(mocks.upsertTrack).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
