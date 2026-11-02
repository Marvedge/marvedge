import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findJob: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  updateDemo: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    videoJob: {
      findUnique: mocks.findJob,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    demo: { update: mocks.updateDemo },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

const exportedUrl = "https://example.com/completed.mp4";
const cropTargets = {
  schema_version: 1,
  video_id: "job-1",
  source: { width: 1920, height: 1080, fps: 30, duration_sec: 10 },
  output: { aspect_ratio: "9:16", width: 608, height: 1080 },
  timeline: { timebase: "seconds", sampling: "keyframes_interpolated" },
  crop_targets: [
    { timestamp_sec: 0, crop: { x: 656, y: 0, width: 608, height: 1080 } },
    { timestamp_sec: 2.5, crop: { x: 700, y: 0, width: 608, height: 1080 } },
  ],
};

function completionRequest(kind: string) {
  return new NextRequest("http://localhost/api/jobs/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer qa-consistency-secret",
    },
    body: JSON.stringify({
      jobId: "job-1",
      status: "COMPLETED",
      exportedUrl,
      ...(kind === "REFRAME" ? { cropTargets } : {}),
    }),
  });
}

describe("callback completion consistency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CALLBACK_SECRET", "qa-consistency-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["EXPORT", "REFRAME"])(
    "allows retry to repair a %s completion after the demo write fails",
    async (kind) => {
      let jobStatus = "PROCESSING";
      let demoUrl: string | null = null;
      let failDemoWrite = true;

      mocks.findJob.mockImplementation(async () => ({
        id: "job-1",
        demoId: "demo-1",
        status: jobStatus,
        jobData: { kind },
      }));

      mocks.updateMany.mockImplementation(async () => {
        if (jobStatus === "COMPLETED" || jobStatus === "CANCELLED") {
          return { count: 0 };
        }
        jobStatus = "COMPLETED";
        return { count: 1 };
      });

      mocks.updateDemo.mockImplementation(async () => {
        if (failDemoWrite) {
          failDemoWrite = false;
          throw new Error("Temporary demo write failure");
        }
        demoUrl = exportedUrl;
        return { id: "demo-1", exportedUrl };
      });

      const transactionClient = {
        videoJob: {
          findUnique: mocks.findJob,
          updateMany: mocks.updateMany,
          update: mocks.update,
        },
        demo: { update: mocks.updateDemo },
      };

      // Model transaction rollback if the handler uses a transaction.
      mocks.transaction.mockImplementation(
        async (work: (tx: typeof transactionClient) => Promise<unknown>) => {
          const previousStatus = jobStatus;
          const previousUrl = demoUrl;
          try {
            return await work(transactionClient);
          } catch (error) {
            jobStatus = previousStatus;
            demoUrl = previousUrl;
            throw error;
          }
        }
      );

      const firstResponse = await POST(completionRequest(kind));
      expect(firstResponse.status).toBe(500);
      expect(jobStatus).toBe("PROCESSING");
      expect(demoUrl).toBeNull();

      const retryResponse = await POST(completionRequest(kind));
      expect(retryResponse.status).toBe(200);

      // A successful retry must leave both records pointing to completion.
      expect(demoUrl).toBe(exportedUrl);
      expect(jobStatus).toBe("COMPLETED");
      expect(mocks.updateDemo).toHaveBeenCalledTimes(2);
    }
  );
});

describe("linked completion race protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CALLBACK_SECRET", "qa-consistency-secret");
    mocks.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["EXPORT", "REFRAME"])(
    "skips the demo write when another callback completes the %s job first",
    async (kind) => {
      mocks.findJob.mockResolvedValue({
        id: "job-1",
        demoId: "demo-1",
        status: "PROCESSING",
        jobData: { kind },
      });

      const transactionClient = {
        videoJob: {
          updateMany: mocks.updateMany,
          update: mocks.update,
        },
        demo: { update: mocks.updateDemo },
      };

      mocks.transaction.mockImplementation(
        async (work: (tx: typeof transactionClient) => Promise<unknown>) => work(transactionClient)
      );

      const response = await POST(completionRequest(kind));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({ success: true, ignored: true })
      );
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
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
    }
  );
});
