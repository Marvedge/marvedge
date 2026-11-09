import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Queue initialization (app/lib/queue.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

  it("preserves production defaults and unrelated queue configurations", async () => {
    delete process.env.REFRAME_QUEUE_NAME;

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
