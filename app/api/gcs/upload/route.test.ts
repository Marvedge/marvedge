import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/app/lib/auth/options", () => ({
  authOptions: {},
}));

vi.mock("@/app/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/lib/audio/rateLimit", () => ({
  isRateLimited: vi.fn(),
}));

vi.mock("@/app/lib/storage", () => ({
  getSignedUploadUrl: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  getObjectSize: vi.fn(),
  deleteObject: vi.fn(),
  toPublicUri: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import {
  getSignedDownloadUrl,
  getSignedUploadUrl,
  toPublicUri,
} from "@/app/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/app/lib/subtitles/limits";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/gcs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(body: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/gcs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/gcs/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAW_BUCKET = "test-raw-bucket";
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
    vi.mocked(getSignedUploadUrl).mockResolvedValue("https://signed.upload/url");
    vi.mocked(getSignedDownloadUrl).mockResolvedValue("https://signed.read/url");
    vi.mocked(toPublicUri).mockReturnValue("s3://test-raw-bucket/uploads/generic/user-1/x");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const res = await POST(makeRequest({ kind: "generic", contentType: "image/png" }));

    expect(res.status).toBe(401);
  });

  it("returns 429 when the user exceeds the mint rate limit", async () => {
    vi.mocked(isRateLimited).mockResolvedValue(true);

    const res = await POST(
      makeRequest({ kind: "generic", contentType: "image/png", size: 1024 })
    );

    expect(res.status).toBe(429);
    expect(isRateLimited).toHaveBeenCalledWith("gcs-upload:user-1", 10, 60);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses to mint when size is omitted", async () => {
    const res = await POST(makeRequest({ kind: "generic", contentType: "image/png" }));

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses to mint when size is not finite", async () => {
    const res = await POST(
      makeRequest({ kind: "generic", contentType: "image/png", size: "huge" })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a non-media contentType for a generic kind", async () => {
    const res = await POST(
      makeRequest({
        kind: "generic",
        filename: "payload.html",
        contentType: "text/html",
        size: 1024,
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects a bare octet-stream for a generic kind", async () => {
    const res = await POST(
      makeRequest({
        kind: "generic",
        filename: "blob.bin",
        contentType: "application/octet-stream",
        size: 1024,
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses an oversized generic upload at mint time", async () => {
    const res = await POST(
      makeRequest({
        kind: "generic",
        filename: "big.png",
        contentType: "image/png",
        size: 200 * 1024 * 1024,
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a video upload with no declared size before minting", async () => {
    const res = await POST(
      makeRequest({
        kind: "demo-source",
        filename: "x.mp4",
        contentType: "video/mp4",
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a video upload whose size parses to Infinity (1e400) before minting", async () => {
    const res = await POST(
      makeRawRequest(
        '{"kind":"demo-source","filename":"x.mp4","contentType":"video/mp4","size":1e400}'
      )
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([0, -1, "NaN", "Infinity"])(
    "refuses a video upload with invalid size %s before minting",
    async (size) => {
      const res = await POST(
        makeRequest({
          kind: "demo-source",
          filename: "x.mp4",
          contentType: "video/mp4",
          size,
        })
      );

      expect(res.status).toBe(400);
      expect(getSignedUploadUrl).not.toHaveBeenCalled();
    }
  );

  it("refuses a video upload over the 2 GB cap at mint time", async () => {
    const res = await POST(
      makeRequest({
        kind: "demo-source",
        filename: "x.mp4",
        contentType: "video/mp4",
        size: MAX_UPLOAD_BYTES + 1,
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("mints a video URL with the video cap passed to the signer", async () => {
    const res = await POST(
      makeRequest({
        kind: "demo-source",
        filename: "x.mp4",
        contentType: "video/mp4",
        size: 1024,
      })
    );

    expect(res.status).toBe(200);
    expect(getSignedUploadUrl).toHaveBeenCalledTimes(1);
    const call = vi.mocked(getSignedUploadUrl).mock.calls[0];
    expect(call[4]).toBe(MAX_UPLOAD_BYTES);
  });

  it("refuses a non-video upload whose size parses to Infinity (1e400)", async () => {
    const res = await POST(
      makeRawRequest(
        '{"kind":"generic","filename":"x.png","contentType":"image/png","size":1e400}'
      )
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("mints a URL for a small generic image upload", async () => {
    const res = await POST(
      makeRequest({
        kind: "generic",
        filename: "logo.png",
        contentType: "image/png",
        size: 1024,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(getSignedUploadUrl).toHaveBeenCalled();
  });

  it("still rejects an invalid video upload via the video validator", async () => {
    const res = await POST(
      makeRequest({
        kind: "demo-source",
        filename: "evil.html",
        contentType: "text/html",
        size: 1024,
      })
    );

    expect(res.status).toBe(400);
    expect(getSignedUploadUrl).not.toHaveBeenCalled();
  });
});
