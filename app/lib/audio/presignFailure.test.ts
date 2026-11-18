import { describe, expect, it, vi } from "vitest";
import type { AudioClipDb } from "./db";

const mocks = vi.hoisted(() => ({
  sign: vi.fn(),
}));

vi.mock("../queue", () => ({ audioQueue: { add: vi.fn() } }));
vi.mock("../r2", () => ({
  isR2Configured: () => true,
  signReadUrl: vi.fn(),
  signUploadUrl: vi.fn(),
}));
vi.mock("./presign", () => ({
  signClipUploadUrl: mocks.sign,
}));
vi.mock("./storage", () => ({
  buildAudioObjectKey: () => "audio/demo-1/user-1/new.mp3",
  audioPlayableUrl: vi.fn(),
  resolveTestingPlayableUrls: vi.fn(),
}));

import { createAudioUpload } from "./service";

describe("audio upload URL signing failure", () => {
  it("does not create an upload row when URL signing fails", async () => {
    const error = new Error("Upload URL signing unavailable");
    mocks.sign.mockRejectedValueOnce(error);

    const create = vi.fn().mockResolvedValue({ id: "clip-new" });
    const db = {
      audioClip: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
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
    ).rejects.toBe(error);

    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
});
