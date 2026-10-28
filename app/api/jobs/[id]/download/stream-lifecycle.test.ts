import { setImmediate } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findJob: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));
vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));
vi.mock("@/app/lib/prisma", () => ({
  prisma: { videoJob: { findUnique: mocks.findJob } },
}));
vi.mock("@/app/lib/elevenlabs/dubbing", () => ({
  getDubbedAudio: vi.fn(),
  getAudioExtension: vi.fn(),
}));

import { GET } from "./route";

function download() {
  return GET(new NextRequest("http://localhost/api/jobs/job-1/download"), {
    params: Promise.resolve({ id: "job-1" }),
  });
}

describe("export download stream lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findJob.mockResolvedValue({
      userId: "user-1",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not drain the export while the client is not reading", async () => {
    let produced = 0;
    const totalChunks = 32;
    const upstream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (produced === totalChunks) {
            controller.close();
            return;
          }
          produced++;
          controller.enqueue(new Uint8Array(1024));
        },
      },
      { highWaterMark: 0 }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(upstream));
    const response = await download();

    try {
      expect(response.status).toBe(200);
      // Let pending stream microtasks settle without consuming the response.
      await setImmediate();
      expect(produced).toBeLessThanOrEqual(2);
    } finally {
      await response.body?.cancel();
    }
  });

  it("cancels the upstream when the client cancels after its first chunk", async () => {
    let upstreamController!: ReadableStreamDefaultController<Uint8Array>;
    let produced = false;
    const cancel = vi.fn();

    const upstream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          upstreamController = controller;
        },
        pull(controller) {
          if (!produced) {
            produced = true;
            controller.enqueue(new Uint8Array([1, 2, 3]));
          }
          // Keep the remaining download open until cancelled.
        },
        cancel,
      },
      { highWaterMark: 0 }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(upstream));
    const response = await download();
    const reader = response.body!.getReader();

    try {
      expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
      await reader.cancel("client disconnected");
      await setImmediate();
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      reader.releaseLock();
      if (cancel.mock.calls.length === 0) {
        upstreamController.close();
        await setImmediate();
      }
    }
  });
});

describe("download byte integrity and error cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findJob.mockResolvedValue({
      userId: "user-1",
      status: "COMPLETED",
      exportedUrl: "https://example.com/exported.mp4",
      jobData: { kind: "RENDER" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves binary bytes across chunks and releases the upstream reader", async () => {
    const chunks = [
      new Uint8Array([0, 255, 128]),
      new Uint8Array([1, 2]),
      new Uint8Array([254, 0]),
    ];
    let index = 0;
    const upstream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(chunks[index++]);
          } else {
            controller.close();
          }
        },
      },
      { highWaterMark: 0 }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(upstream));
    const response = await download();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0, 255, 128, 1, 2, 254, 0])
    );
    expect(upstream.locked).toBe(false);
  });

  it("propagates an upstream read failure and releases the reader", async () => {
    let upstreamController!: ReadableStreamDefaultController<Uint8Array>;
    let produced = false;
    const upstream = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          upstreamController = controller;
        },
        pull(controller) {
          if (!produced) {
            produced = true;
            controller.enqueue(new Uint8Array([1, 2, 3]));
          }
        },
      },
      { highWaterMark: 0 }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(upstream));
    const response = await download();
    const reader = response.body!.getReader();

    try {
      expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
      upstreamController.error(new Error("Object store stream failed"));
      await expect(reader.read()).rejects.toThrow("Object store stream failed");
      await setImmediate();
      expect(upstream.locked).toBe(false);
    } finally {
      reader.releaseLock();
    }
  });
});
