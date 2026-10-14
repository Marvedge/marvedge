import { Job, type Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";

class InspectableJob extends Job {
  get testScripts() {
    return this.scripts;
  }
}

const queueDefaults = {
  reframe: { attempts: 3, backoff: { type: "exponential" as const, delay: 2000 } },
  dubbing: { attempts: 2, backoff: { type: "exponential" as const, delay: 5000 } },
};

function createBullMqJob(pipeline: keyof typeof queueDefaults, attemptsMade = 0): InspectableJob {
  const { attempts, backoff } = queueDefaults[pipeline];
  const name = `${pipeline}-processing`;
  const fakeQueue = {
    name,
    qualifiedName: `bull:${name}`,
    opts: {
      prefix: "bull",
      metrics: { maxDataPoints: 6 },
      removeOnComplete: false,
      removeOnFail: false,
    },
    keys: {
      wait: "wait",
      active: "active",
      prioritized: "prioritized",
      events: "events",
      stalled: "stalled",
      limiter: "limiter",
      delayed: "delayed",
      paused: "paused",
      meta: "meta",
      pc: "pc",
      marker: "marker",
    },
    toKey: (key: string) => `bull:${name}:${key}`,
    waitUntilReady: vi.fn().mockResolvedValue(undefined),
    trace: (
      _kind: unknown,
      _operation: unknown,
      _queueName: unknown,
      callback: (span: undefined, metadata: undefined) => unknown
    ) => callback(undefined, undefined),
  } as unknown as Queue;

  const job = new InspectableJob(fakeQueue, "job", {}, { attempts, backoff }, `${pipeline}-test`);
  job.attemptsMade = attemptsMade;
  return job;
}

describe("BullMQ Redis outcome metric transition semantics", () => {
  it.each(["reframe", "dubbing"] as const)(
    "records retryable failure, final failure, and completion as expected for %s defaults",
    async (pipeline) => {
      const retryableJob = createBullMqJob(pipeline);
      const retryToDelayed = vi
        .spyOn(retryableJob.testScripts, "moveToDelayed")
        .mockResolvedValue(undefined);
      const retryToFinished = vi
        .spyOn(retryableJob.testScripts, "moveToFinished")
        .mockResolvedValue([]);

      await retryableJob.moveToFailed(new Error("temporary failure"), "token");

      expect(retryToDelayed).toHaveBeenCalledOnce();
      expect(retryToFinished).not.toHaveBeenCalled();

      const { attempts } = queueDefaults[pipeline];
      const finalFailureJob = createBullMqJob(pipeline, attempts - 1);
      const finalFailureTransition = vi
        .spyOn(finalFailureJob.testScripts, "moveToFinished")
        .mockResolvedValue([]);

      await finalFailureJob.moveToFailed(new Error("terminal failure"), "token");

      expect(finalFailureTransition).toHaveBeenCalledOnce();

      const completedJob = createBullMqJob(pipeline);
      const completionTransition = vi
        .spyOn(completedJob.testScripts, "moveToFinished")
        .mockResolvedValue([]);

      await completedJob.moveToCompleted({ ok: true }, "token");

      expect(completionTransition).toHaveBeenCalledOnce();
    }
  );
});
