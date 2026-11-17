import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reorder: vi.fn() }));

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/app/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/lib/audio/flags", () => ({ isAudioUploadEnabled: () => true }));
vi.mock("@/app/lib/audio/db", () => ({ asAudioClipDb: () => ({}) }));
vi.mock("@/app/lib/audio/service", () => ({
  ApiError: class extends Error {},
  reorderAudioClip: mocks.reorder,
}));

import { PATCH } from "./route";

function reorder(order: number) {
  return PATCH(
    new NextRequest("http://localhost/api/audio/clip-1/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }),
    }),
    { params: Promise.resolve({ clipId: "clip-1" }) }
  );
}

describe("audio reorder integer range", () => {
  beforeEach(() => {
    mocks.reorder.mockReset();
    mocks.reorder.mockResolvedValue({ id: "clip-1" });
  });

  it("rejects an order above the database range before calling the service", async () => {
    const response = await reorder(2_147_483_648);
    expect(response.status).toBe(400);
    expect(mocks.reorder).not.toHaveBeenCalled();
  });

  it.each([0, 2_147_483_647])("forwards representable order %s", async (order) => {
    expect((await reorder(order)).status).toBe(200);
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ clipId: "clip-1", userId: "user-1", order })
    );
  });
});
