import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Queue initialization (app/lib/queue.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.doUnmock("./redis");
    vi.doUnmock("bullmq");
    vi.doUnmock("ioredis");
    vi.restoreAllMocks();
  });

  function createMockQueue() {
    const queueCalls: Array<{ name: string; opts: Record<string, unknown> | undefined }> = [];
    class MockQueue {
      name: string;
      opts: Record<string, unknown> | undefined;
      constructor(name: string, opts?: Record<string, unknown>) {
        this.name = name;
        this.opts = opts;
        queueCalls.push({ name, opts });
      }
    }
    return { MockQueue, queueCalls };
  }

  it("defaults reframeQueue to 'reframe-processing' when REFRAME_QUEUE_NAME is unset", async () => {
    delete process.env.REFRAME_QUEUE_NAME;

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { reframeQueue, reframeJobQueue } = await import("./queue");

    expect(reframeQueue.name).toBe("reframe-processing");
    expect(reframeJobQueue).toBe(reframeQueue);

    // Verify reframe queue options are preserved
    expect(reframeQueue.opts).toEqual({
      connection: { id: "mock-redis-connection" },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  });

  it("uses isolated queue when REFRAME_QUEUE_NAME is set to 'reframe-preview'", async () => {
    process.env.REFRAME_QUEUE_NAME = "reframe-preview";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { reframeQueue } = await import("./queue");

    expect(reframeQueue.name).toBe("reframe-preview");
    expect(reframeQueue.opts?.defaultJobOptions as Record<string, unknown>).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  });

  it("trims whitespace from REFRAME_QUEUE_NAME", async () => {
    process.env.REFRAME_QUEUE_NAME = "  reframe-preview  ";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { reframeQueue } = await import("./queue");

    expect(reframeQueue.name).toBe("reframe-preview");
  });

  it("falls back to 'reframe-processing' when REFRAME_QUEUE_NAME is empty or whitespace", async () => {
    process.env.REFRAME_QUEUE_NAME = "   ";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { reframeQueue } = await import("./queue");

    expect(reframeQueue.name).toBe("reframe-processing");
  });

  it("defaults dubbingQueue to 'dubbing-processing' when DUBBING_QUEUE_NAME is unset", async () => {
    delete process.env.DUBBING_QUEUE_NAME;

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { dubbingQueue } = await import("./queue");

    expect(dubbingQueue.name).toBe("dubbing-processing");
  });

  it("uses isolated queue when DUBBING_QUEUE_NAME is set to 'dubbing-preview'", async () => {
    process.env.DUBBING_QUEUE_NAME = "dubbing-preview";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { dubbingQueue } = await import("./queue");

    expect(dubbingQueue.name).toBe("dubbing-preview");
    expect(dubbingQueue.opts?.defaultJobOptions as Record<string, unknown>).toEqual({
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
  });

  it("trims whitespace from DUBBING_QUEUE_NAME", async () => {
    process.env.DUBBING_QUEUE_NAME = "  dubbing-preview  ";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { dubbingQueue } = await import("./queue");

    expect(dubbingQueue.name).toBe("dubbing-preview");
  });

  it("falls back to 'dubbing-processing' when DUBBING_QUEUE_NAME is empty or whitespace", async () => {
    delete process.env.APP_ENV;
    process.env.DUBBING_QUEUE_NAME = "   ";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { dubbingQueue } = await import("./queue");

    expect(dubbingQueue.name).toBe("dubbing-processing");
  });

  it("fails closed in staging when REFRAME_QUEUE_NAME or DUBBING_QUEUE_NAME is missing or blank before creating queues", async () => {
    process.env.APP_ENV = "staging";
    delete process.env.REFRAME_QUEUE_NAME;
    process.env.DUBBING_QUEUE_NAME = "dubbing-task115";

    const { MockQueue, queueCalls } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    await expect(import("./queue")).rejects.toThrow(
      "REFRAME_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
    );
    expect(queueCalls).toHaveLength(0);

    vi.resetModules();
    process.env.APP_ENV = "staging";
    process.env.REFRAME_QUEUE_NAME = "reframe-task115";
    delete process.env.DUBBING_QUEUE_NAME;
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    await expect(import("./queue")).rejects.toThrow(
      "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
    );
    expect(queueCalls).toHaveLength(0);

    vi.resetModules();
    process.env.APP_ENV = "staging";
    process.env.REFRAME_QUEUE_NAME = "reframe-task115";
    process.env.DUBBING_QUEUE_NAME = "   ";
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    await expect(import("./queue")).rejects.toThrow(
      "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
    );
    expect(queueCalls).toHaveLength(0);
  });

  it("fails closed in app/lib/redis.ts before instantiating Redis when staging queue config is invalid", async () => {
    process.env.APP_ENV = "staging";
    delete process.env.DUBBING_QUEUE_NAME;
    process.env.REFRAME_QUEUE_NAME = "reframe-task115";

    const MockRedis = vi.fn();
    vi.doMock("ioredis", () => ({ Redis: MockRedis }));

    await expect(import("./redis")).rejects.toThrow(
      "DUBBING_QUEUE_NAME must be set to a non-empty isolated queue name when APP_ENV=staging"
    );
    expect(MockRedis).not.toHaveBeenCalled();
  });

  it("uses isolated reframe and dubbing queues in staging when both are set", async () => {
    process.env.APP_ENV = "staging";
    process.env.REFRAME_QUEUE_NAME = "reframe-task115";
    process.env.DUBBING_QUEUE_NAME = "dubbing-task115";

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { reframeQueue, dubbingQueue } = await import("./queue");

    expect(reframeQueue.name).toBe("reframe-task115");
    expect(dubbingQueue.name).toBe("dubbing-task115");
  });

  it("preserves production defaults and unrelated queue configurations", async () => {
    delete process.env.APP_ENV;
    delete process.env.REFRAME_QUEUE_NAME;
    delete process.env.DUBBING_QUEUE_NAME;

    const { MockQueue } = createMockQueue();
    vi.doMock("bullmq", () => ({ Queue: MockQueue }));
    vi.doMock("./redis", () => ({ default: { id: "mock-redis-connection" } }));

    const { videoQueue, subtitleQueue, audioQueue, dubbingQueue, reframeQueue } =
      await import("./queue");

    expect(videoQueue.name).toBe("video-processing");
    expect(subtitleQueue.name).toBe("subtitle-processing");
    expect(audioQueue.name).toBe("audio-processing");
    expect(dubbingQueue.name).toBe("dubbing-processing");
    expect(reframeQueue.name).toBe("reframe-processing");

    // Verify video queue options
    expect(videoQueue.opts?.defaultJobOptions as Record<string, unknown>).toEqual({
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });

    // Verify dubbing queue options
    expect(dubbingQueue.opts?.defaultJobOptions as Record<string, unknown>).toEqual({
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
  });
});
