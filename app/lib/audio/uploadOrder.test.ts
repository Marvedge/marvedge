import { describe, expect, it, vi } from "vitest";

import type { AudioClipDb } from "./db";

vi.mock("../queue", () => ({ audioQueue: { add: vi.fn() } }));
vi.mock("../r2", () => ({
  isR2Configured: () => false,
  signReadUrl: vi.fn(),
  signUploadUrl: vi.fn(),
}));
vi.mock("./presign", () => ({ signClipUploadUrl: vi.fn() }));
vi.mock("./storage", () => ({
  buildAudioObjectKey: () => "audio/demo-1/user-1/new.mp3",
  audioPlayableUrl: vi.fn(),
  resolveTestingPlayableUrls: vi.fn(),
}));

import { createAudioUpload } from "./service";

describe("audio upload order allocation", () => {
  it.each([
    [null, 0],
    [4, 5],
    [2_147_483_647, 2_147_483_647],
  ])("assigns order %s + one within the database range", async (maxOrder, expectedOrder) => {
    const create = vi.fn().mockResolvedValue({ id: "clip-new" });
    const db = {
      audioClip: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: maxOrder } }),
        create,
      },
    } as unknown as AudioClipDb;

    await expect(
      createAudioUpload({
        db,
        demoId: "demo-1",
        userId: "user-1",
        fileName: "voice.mp3",
        mimeType: "audio/mpeg",
        size: 1024,
      })
    ).resolves.toMatchObject({ clipId: "clip-new" });

    expect(create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ order: expectedOrder }),
    });
  });
});
