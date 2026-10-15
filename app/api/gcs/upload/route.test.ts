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
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/gcs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
