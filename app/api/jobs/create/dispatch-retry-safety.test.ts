import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findJob: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: mocks.findJob,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/app/lib/gcpWorker", () => ({
  invokeGcpWorker: mocks.invoke,
}));

import { dispatchVideoJob } from "./route";

describe("Retry-Safe Stage & Chunk Execution (Task 113)", () => {
  let storedJob: {
    id: string;
    status: string;
    progress: number;
    exportedUrl: string | null;
    error: string | null;
    jobData: Record<string, unknown>;
    version: number;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    storedJob = {
      id: "job-safety-1",
      status: "PENDING",
      progress: 0,
      exportedUrl: null,
      error: null,
      jobData: {},
      version: 0,
    };

    mocks.findJob.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === storedJob.id) {
        return { ...storedJob };
      }
      return null;
    });

    mocks.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id === storedJob.id) {
          Object.assign(storedJob, data);
          return { ...storedJob };
        }
        return null;
      }
    );

    mocks.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string; status?: { notIn?: string[] }; version?: number };
        data: Record<string, unknown>;
      }) => {
        if (where.id === storedJob.id) {
          if (where.status?.notIn && where.status.notIn.includes(storedJob.status)) {
            return { count: 0 };
          }
          if (typeof where.version === "number" && where.version !== storedJob.version) {
            return { count: 0 };
          }
          Object.assign(storedJob, data);
          if (typeof data.version === "number") {
            storedJob.version = data.version;
          }
          return { count: 1 };
        }
        return { count: 0 };
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists completed chunk immediately so a later chunk failure retains progress", async () => {
    // 3 chunks: duration = 30s (CHUNK_DURATION_SECONDS is 10s)
    // Chunk 0 succeeds, Chunk 1 fails, Chunk 2 will reject or be canceled
    mocks.invoke.mockImplementation(
      async (payload: { chunkId: string; outputObject?: string }, endpoint: string) => {
        if (endpoint === "/process") {
          if (payload.chunkId.endsWith("000")) {
            return { result: { processedObject: "job-safety-1_chunk_000.mp4" } };
          }
          if (payload.chunkId.endsWith("001")) {
            throw new Error("Worker node failure during chunk 1");
          }
          return { result: { processedObject: "job-safety-1_chunk_002.mp4" } };
        }
        return { result: { exportedUrl: "https://example.com/merged.mp4" } };
      }
    );

    await expect(
      dispatchVideoJob("job-safety-1", "https://example.com/source.mp4", 30, {})
    ).rejects.toThrow("Worker node failure during chunk 1");

    // Progress check: Chunk 0 was successfully persisted to jobData.completedChunks!
    const completed = storedJob.jobData.completedChunks as Record<string, string>;
    expect(completed).toBeDefined();
    expect(completed["job-safety-1_chunk_000"]).toBe("job-safety-1_chunk_000.mp4");
    // Chunk 1 was NOT completed
    expect(completed["job-safety-1_chunk_001"]).toBeUndefined();
  });

  it("skips worker execution for already completed chunks on retry and proceeds to merge", async () => {
    // Pre-populate storedJob with Chunk 0 already completed
    storedJob.jobData = {
      completedChunks: {
        "job-safety-1_chunk_000": "job-safety-1_chunk_000.mp4",
      },
    };

    const processCalls: { chunkId: string; outputObject: string }[] = [];
    mocks.invoke.mockImplementation(
      async (
        payload: { chunkId: string; outputObject: string; chunkFilenames?: string[] },
        endpoint: string
      ) => {
        if (endpoint === "/process") {
          processCalls.push(payload);
          return { result: { processedObject: payload.outputObject } };
        }
        if (endpoint === "/merge") {
          return { result: { exportedUrl: "https://example.com/final-retry-merged.mp4" } };
        }
        return {};
      }
    );

    await dispatchVideoJob("job-safety-1", "https://example.com/source.mp4", 30, {});

    // Only Chunks 1 and 2 should have invoked the worker (/process)
    expect(processCalls).toHaveLength(2);
    expect(processCalls.map((c) => c.chunkId)).toEqual([
      "job-safety-1_chunk_001",
      "job-safety-1_chunk_002",
    ]);

    // Verify /merge was called with all 3 chunks in correct order
    const mergeCall = mocks.invoke.mock.calls.find((call) => call[1] === "/merge");
    expect(mergeCall).toBeDefined();
    expect(mergeCall![0].chunkFilenames).toEqual([
      "job-safety-1_chunk_000.mp4",
      "job-safety-1_chunk_001.mp4",
      "job-safety-1_chunk_002.mp4",
    ]);

    // Verify job reached COMPLETED
    expect(storedJob.status).toBe("COMPLETED");
    expect(storedJob.progress).toBe(100);
    expect(storedJob.exportedUrl).toBe("https://example.com/final-retry-merged.mp4");
  });

  it("safely merges when all chunks were already completed on a previous run", async () => {
    storedJob.jobData = {
      completedChunks: {
        "job-safety-1_chunk_000": "job-safety-1_chunk_000.mp4",
        "job-safety-1_chunk_001": "job-safety-1_chunk_001.mp4",
        "job-safety-1_chunk_002": "job-safety-1_chunk_002.mp4",
      },
    };

    mocks.invoke.mockImplementation(
      async (_payload: { chunkFilenames?: string[] }, endpoint: string) => {
        if (endpoint === "/merge") {
          return { result: { exportedUrl: "https://example.com/merge-only-success.mp4" } };
        }
        throw new Error(`Unexpected endpoint call: ${endpoint}`);
      }
    );

    await dispatchVideoJob("job-safety-1", "https://example.com/source.mp4", 30, {});

    // No /process calls were made
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      {
        recipeId: "job-safety-1",
        chunkFilenames: [
          "job-safety-1_chunk_000.mp4",
          "job-safety-1_chunk_001.mp4",
          "job-safety-1_chunk_002.mp4",
        ],
      },
      "/merge"
    );

    expect(storedJob.status).toBe("COMPLETED");
  });

  it("does nothing if the job was already COMPLETED or CANCELLED before dispatch begins", async () => {
    storedJob.status = "COMPLETED";

    await dispatchVideoJob("job-safety-1", "https://example.com/source.mp4", 30, {});

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when optimistic-lock retries are exhausted", async () => {
    let updateManyCalls = 0;

    mocks.updateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      updateManyCalls++;

      // First call updates the job state; subsequent calls simulate conflicts.
      if (updateManyCalls === 1) {
        Object.assign(storedJob, data);
        return { count: 1 };
      }

      return { count: 0 };
    });

    mocks.invoke.mockImplementation(async (_payload: unknown, endpoint: string) => {
      if (endpoint === "/process") {
        return { result: { processedObject: "job-safety-1_chunk_000.mp4" } };
      }

      return { result: { exportedUrl: "https://example.com/merged.mp4" } };
    });

    await expect(
      dispatchVideoJob("job-safety-1", "https://example.com/source.mp4", 10, {})
    ).rejects.toThrow("Failed to persist completed chunk after retries");

    expect(updateManyCalls).toBe(6);
  });
});
