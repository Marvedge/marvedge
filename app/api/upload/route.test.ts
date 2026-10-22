import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
      upload_stream: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import cloudinary from "@/app/lib/cloudinary";
import { POST } from "./route";

function requestWithDeclaredLength(bytes: number, formData: () => Promise<FormData>): NextRequest {
  return {
    headers: new Headers({
      "content-type": "multipart/form-data; boundary=test",
      "content-length": String(bytes),
    }),
    formData,
  } as unknown as NextRequest;
}

describe("POST /api/upload declared body limit (L1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1" },
    } as never);
    vi.mocked(isRateLimited).mockResolvedValue(false);
  });

  it("rejects an oversized Content-Length before parsing the multipart body", async () => {
    const formData = vi.fn(async () => {
      throw new Error("formData must not be called for an oversized body");
    });

    const res = await POST(requestWithDeclaredLength(11 * 1024 * 1024 + 1, formData));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "File too large (max 10MB)" });
    expect(formData).not.toHaveBeenCalled();
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("still parses a body that is within the multipart allowance", async () => {
    const form = new FormData();
    form.set("description", "A small multipart request");

    const res = await POST(
      new NextRequest("http://localhost/api/upload", {
        method: "POST",
        body: form,
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided" });
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
});
