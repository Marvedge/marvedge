import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limited: vi.fn(),
  findUser: vi.fn(),
  create: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.session,
}));
vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));
vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: mocks.limited,
}));
vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findUser },
    videoJob: { create: mocks.create },
  },
}));
vi.mock("@/app/lib/queue", () => ({
  dubbingQueue: { add: mocks.enqueue },
}));

import { POST } from "./route";

describe("dubbing creation request-body limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUser.mockResolvedValue({ id: "user-1", plan: "PRO" });
    mocks.limited.mockResolvedValue(false);
    mocks.create.mockResolvedValue({ id: "job-1" });
    mocks.enqueue.mockResolvedValue(undefined);
  });

  it.each([undefined, "128"])(
    "stops an oversized stream with Content-Length %s",
    async (declaredLength) => {
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode(
          '{"sourceUrl":"https://media.example.test/video.mp4",' +
            '"targetLanguage":"fr","padding":"'
        ),
        ...Array.from({ length: 32 }, () => encoder.encode("a".repeat(1024))),
        encoder.encode('"}'),
      ];
      let chunksSent = 0;
      let cancelled = false;

      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (chunksSent === chunks.length) {
              controller.close();
              return;
            }
            controller.enqueue(chunks[chunksSent++]);
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      );

      const headers = new Headers({
        "content-type": "application/json",
      });
      if (declaredLength !== undefined) {
        headers.set("content-length", declaredLength);
      }

      const request = new NextRequest("http://localhost/api/dubbing/create", {
        method: "POST",
        headers,
        body: stream,
        duplex: "half",
      } as ConstructorParameters<typeof NextRequest>[1]);

      const response = await POST(request);

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: "Request body too large",
      });
      expect(cancelled).toBe(true);
      expect(chunksSent).toBeLessThan(chunks.length);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  );
});

describe("dubbing JSON byte boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUser.mockResolvedValue({ id: "user-1", plan: "PRO" });
    mocks.limited.mockResolvedValue(false);
    mocks.create.mockResolvedValue({ id: "job-1" });
    mocks.enqueue.mockResolvedValue(undefined);
  });

  it.each([
    [8192, 200],
    [8193, 413],
  ])("handles a %i-byte JSON body with status %i", async (size, status) => {
    const payload = {
      sourceUrl: "https://media.example.test/video.mp4",
      targetLanguage: "fr",
      padding: "€",
    };
    const encoder = new TextEncoder();
    const baseSize = encoder.encode(JSON.stringify(payload)).byteLength;
    payload.padding += "a".repeat(size - baseSize);
    const body = JSON.stringify(payload);

    expect(encoder.encode(body).byteLength).toBe(size);

    const response = await POST(
      new NextRequest("http://localhost/api/dubbing/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    );

    expect(response.status).toBe(status);

    if (status === 200) {
      expect(await response.json()).toEqual({
        success: true,
        jobId: "job-1",
        targetLanguage: "fr",
      });
      expect(mocks.create).toHaveBeenCalledTimes(1);
      expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    } else {
      expect(await response.json()).toEqual({
        error: "Request body too large",
      });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.enqueue).not.toHaveBeenCalled();
    }
  });
});
