import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const uploadMocks = vi.hoisted(() => ({
  uploadStream: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/cloudinary", () => ({
  default: {
    uploader: {
      upload_stream: uploadMocks.uploadStream,
    },
  },
}));

import { getServerSession } from "next-auth";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import cloudinary from "@/app/lib/cloudinary";
import { POST } from "./route";

describe("upload actual multipart body limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
  });

  it("uploads an image at the 10MB file limit without changing its bytes", async () => {
    const image = new Uint8Array(10 * 1024 * 1024).fill(97);
    image.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    let uploadedBytes: Buffer | undefined;

    uploadMocks.uploadStream.mockImplementationOnce(
      (
        _options: unknown,
        callback: (error: undefined, result: { secure_url: string; public_id: string }) => void
      ) => ({
        end(buffer: Buffer) {
          uploadedBytes = buffer;
          callback(undefined, {
            secure_url: "https://example.test/avatar.png",
            public_id: "profile_pics/user-1/avatar",
          });
        },
      })
    );

    const form = new FormData();
    form.set("file", new Blob([image], { type: "image/png" }), "avatar.png");

    const response = await POST(
      new NextRequest("http://localhost/api/upload", {
        method: "POST",
        body: form,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      secure_url: "https://example.test/avatar.png",
      public_id: "profile_pics/user-1/avatar",
    });
    expect(uploadMocks.uploadStream).toHaveBeenCalledTimes(1);
    expect(uploadedBytes?.equals(Buffer.from(image))).toBe(true);
  });

  it.each([undefined, "1024"])(
    "rejects an oversized stream with Content-Length %s",
    async (declaredLength) => {
      const boundary = "qa-upload-boundary";
      const encoder = new TextEncoder();
      const chunk = new Uint8Array(64 * 1024).fill(97);
      const totalChunks = 200;
      let chunksSent = 0;
      let started = false;
      let cancelled = false;

      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (!started) {
              started = true;
              controller.enqueue(
                encoder.encode(
                  `--${boundary}\r\n` + 'Content-Disposition: form-data; name="padding"\r\n\r\n'
                )
              );
            } else if (chunksSent < totalChunks) {
              chunksSent++;
              controller.enqueue(chunk);
            } else {
              controller.enqueue(encoder.encode(`\r\n--${boundary}--\r\n`));
              controller.close();
            }
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      );

      const headers = new Headers({
        "content-type": `multipart/form-data; boundary=${boundary}`,
      });

      if (declaredLength !== undefined) {
        headers.set("content-length", declaredLength);
      }

      const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex: "half" } = {
        method: "POST",
        headers,
        body: stream,
        duplex: "half",
      };

      const response = await POST(new NextRequest("http://localhost/api/upload", init));

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: "File too large (max 10MB)",
      });
      expect(cancelled).toBe(true);
      expect(chunksSent).toBeLessThan(totalChunks);
      expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
    }
  );
});
