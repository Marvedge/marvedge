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
