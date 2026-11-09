import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveOwnedClip: vi.fn(),
  cloudinaryUploadBuffer: vi.fn(),
  audioClipUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/app/lib/audio/db", () => ({
  asAudioClipDb: () => ({
    audioClip: {
      update: mocks.audioClipUpdate,
    },
  }),
}));

vi.mock("@/app/lib/audio/service", () => {
  class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    resolveOwnedClip: mocks.resolveOwnedClip,
  };
});

vi.mock("@/app/lib/audio/flags", () => ({
  isAudioUploadEnabled: () => true,
}));

vi.mock("@/app/lib/cloudinaryUpload", () => {
  class CloudinaryUploadError extends Error {
    readonly status: number;

    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  }

  return {
    CloudinaryUploadError,
    cloudinaryUploadBuffer: mocks.cloudinaryUploadBuffer,
  };
});

import { CloudinaryUploadError } from "@/app/lib/cloudinaryUpload";
import { PUT } from "./route";

describe("audio Cloudinary upload error privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });

    mocks.resolveOwnedClip.mockResolvedValue({
      clip: {
        id: "clip-1",
        status: "UPLOADING",
        mimeType: "audio/mpeg",
        fileName: "voice.mp3",
      },
    });
  });

  it.each([undefined, "1024"])(
    "stops oversized audio early with Content-Length %s",
    async (declaredLength) => {
      const chunk = new Uint8Array(1024 * 1024).fill(97);
      const totalChunks = 60;
      let chunksSent = 0;
      let cancelled = false;

      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (chunksSent === totalChunks) {
              controller.close();
              return;
            }

            chunksSent++;
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      );

      const headers = new Headers({
        "content-type": "audio/mpeg",
      });

      if (declaredLength !== undefined) {
        headers.set("content-length", declaredLength);
      }

      const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & {
        duplex: "half";
      } = {
        method: "PUT",
        headers,
        body,
        duplex: "half",
      };

      const response = await PUT(
        new NextRequest("http://localhost/api/audio/clip-1/cloudinary-upload", init),
        { params: Promise.resolve({ clipId: "clip-1" }) }
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: "File exceeds the 50MB limit",
      });
      expect(cancelled).toBe(true);
      expect(chunksSent).toBeLessThan(totalChunks);
      expect(mocks.cloudinaryUploadBuffer).not.toHaveBeenCalled();
      expect(mocks.audioClipUpdate).not.toHaveBeenCalled();
    }
  );

  it("preserves binary audio exactly at the 50MB limit", async () => {
    const audio = new Uint8Array(50 * 1024 * 1024).fill(255);
    audio.set([0, 128, 255, 195, 40, 0, 13, 10]);

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const middle = audio.byteLength / 2;
        controller.enqueue(audio.subarray(0, middle));
        controller.enqueue(audio.subarray(middle));
        controller.close();
      },
    });

    const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & {
      duplex: "half";
    } = {
      method: "PUT",
      headers: { "content-type": "audio/mpeg" },
      body,
      duplex: "half",
    };

    const secureUrl = "https://example.test/audio.mp3";
    mocks.cloudinaryUploadBuffer.mockResolvedValueOnce(secureUrl);

    const response = await PUT(
      new NextRequest("http://localhost/api/audio/clip-1/cloudinary-upload", init),
      { params: Promise.resolve({ clipId: "clip-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.cloudinaryUploadBuffer).toHaveBeenCalledTimes(1);

    const uploaded = mocks.cloudinaryUploadBuffer.mock.calls[0][0];

    expect(Buffer.isBuffer(uploaded.buffer)).toBe(true);
    expect(uploaded.buffer.byteLength).toBe(audio.byteLength);
    expect(
      uploaded.buffer.equals(Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength))
    ).toBe(true);

    expect(uploaded.contentType).toBe("audio/mpeg");
    expect(mocks.audioClipUpdate).toHaveBeenCalledWith({
      where: { id: "clip-1" },
      data: { originalKey: secureUrl },
    });
  });

  it.each(["empty", "unreadable"])(
    "rejects an %s audio stream without provider or database writes",
    async (kind) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (kind === "unreadable") {
            controller.error(new Error("Simulated stream failure"));
          } else {
            controller.close();
          }
        },
      });

      const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & {
        duplex: "half";
      } = {
        method: "PUT",
        body,
        duplex: "half",
      };

      const response = await PUT(
        new NextRequest("http://localhost/api/audio/clip-1/cloudinary-upload", init),
        { params: Promise.resolve({ clipId: "clip-1" }) }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: kind === "empty" ? "Empty request body" : "Invalid request body",
      });
      expect(mocks.cloudinaryUploadBuffer).not.toHaveBeenCalled();
      expect(mocks.audioClipUpdate).not.toHaveBeenCalled();
    }
  );

  it("does not expose Cloudinary configuration errors", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.cloudinaryUploadBuffer.mockRejectedValueOnce(
      new CloudinaryUploadError(
        "Missing CLOUDINARY_CLOUD_NAME or NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET",
        500
      )
    );

    try {
      const request = new NextRequest("http://localhost/api/audio/clip-1/cloudinary-upload", {
        method: "PUT",
        body: "audio-bytes",
      });

      const response = await PUT(request, {
        params: Promise.resolve({
          clipId: "clip-1",
        }),
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "Failed to store audio",
      });
      expect(mocks.audioClipUpdate).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("rejects an oversized Content-Length before resolving or reading the clip", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const request = {
      headers: new Headers({
        "content-length": String(50 * 1024 * 1024 + 1),
      }),
      arrayBuffer,
    } as unknown as NextRequest;

    const response = await PUT(request, {
      params: Promise.resolve({
        clipId: "clip-1",
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "File exceeds the 50MB limit",
    });
    expect(mocks.resolveOwnedClip).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.cloudinaryUploadBuffer).not.toHaveBeenCalled();
  });
});
