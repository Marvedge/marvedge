import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  session: vi.fn(),
  limited: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/app/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/lib/audio/db", () => ({ asAudioClipDb: () => ({}) }));
vi.mock("@/app/lib/audio/flags", () => ({ isAudioUploadEnabled: () => true }));
vi.mock("@/app/lib/audio/rateLimit", () => ({ isAudioRateLimited: mocks.limited }));
vi.mock("@/app/lib/audio/service", () => ({
  ApiError: class extends Error {},
  confirmAudioUpload: mocks.confirm,
}));

import { POST } from "./route";

function confirm(body?: string) {
  return POST(
    new NextRequest("http://localhost/api/audio/clip-1/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    { params: Promise.resolve({ clipId: "clip-1" }) }
  );
}

describe("audio upload confirmation body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.limited.mockResolvedValue(false);
    mocks.confirm.mockResolvedValue({ id: "clip-1" });
  });

  it.each(["null", "[]", "42", "{"])("rejects invalid body %s", async (body) => {
    const response = await confirm(body);
    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("rejects oversized metadata without confirming the clip", async () => {
    const response = await confirm(JSON.stringify({ padding: "a".repeat(8192) }));
    expect(response.status).toBe(413);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("allows an empty body", async () => {
    expect((await confirm()).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ clipId: "clip-1", durationSec: null })
    );
  });

  it("keeps accepting duration as a numeric string", async () => {
    expect((await confirm('{"durationSec":"2.5"}')).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ clipId: "clip-1", durationSec: 2.5 })
    );
  });
});
