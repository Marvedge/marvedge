import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  trim: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/app/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/lib/audio/flags", () => ({ isAudioUploadEnabled: () => true }));
vi.mock("@/app/lib/audio/db", () => ({ asAudioClipDb: () => ({}) }));
vi.mock("@/app/lib/http/boundedBody", () => ({
  readBoundedRequestJson: mocks.readBody,
}));
vi.mock("@/app/lib/audio/service", () => ({
  ApiError: class extends Error {},
  requestAudioTrim: mocks.trim,
}));

import { PATCH } from "./route";

function trimRequest() {
  return PATCH(new NextRequest("http://localhost/api/audio/clip-1/trim", { method: "PATCH" }), {
    params: Promise.resolve({ clipId: "clip-1" }),
  });
}

describe("audio trim request handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 413 without trimming when the reader reports an oversized body", async () => {
    mocks.readBody.mockResolvedValue({ ok: false, reason: "too_large" });

    const response = await trimRequest();

    expect(response.status).toBe(413);
    expect(mocks.readBody).toHaveBeenCalledWith(expect.any(NextRequest), 8 * 1024);
    expect(mocks.trim).not.toHaveBeenCalled();
  });

  it("returns 400 without trimming when JSON parsing fails", async () => {
    mocks.readBody.mockResolvedValue({ ok: false, reason: "invalid_json" });

    expect((await trimRequest()).status).toBe(400);
    expect(mocks.trim).not.toHaveBeenCalled();
  });

  it("passes a valid range to the trim service", async () => {
    mocks.readBody.mockResolvedValue({
      ok: true,
      value: { trimStartSec: 1, trimEndSec: 3 },
    });
    mocks.trim.mockResolvedValue({ id: "clip-1" });

    const response = await trimRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, clip: { id: "clip-1" } });
    expect(mocks.trim).toHaveBeenCalledWith(
      expect.objectContaining({
        clipId: "clip-1",
        userId: "user-1",
        trimStartSec: 1,
        trimEndSec: 3,
      })
    );
  });
});
