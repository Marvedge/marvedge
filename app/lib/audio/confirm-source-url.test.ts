import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioClipDb } from "./db";

const mocks = vi.hoisted(() => ({
  playableUrl: vi.fn(),
}));

vi.mock("../queue", () => ({ audioQueue: { add: vi.fn() } }));
vi.mock("../r2", () => ({
  isR2Configured: () => true,
  signReadUrl: vi.fn(),
  signUploadUrl: vi.fn(),
}));
vi.mock("./presign", () => ({ signClipUploadUrl: vi.fn() }));
vi.mock("./storage", () => ({
  audioPlayableUrl: mocks.playableUrl,
  buildAudioObjectKey: vi.fn(),
  resolveTestingPlayableUrls: vi.fn(),
}));

import { confirmAudioUpload } from "./service";

afterEach(() => {
  vi.resetAllMocks();
});

describe("audio confirmation source URL failure", () => {
  it("does not enqueue metadata when the source URL cannot be resolved", async () => {
    mocks.playableUrl.mockResolvedValue("");

    const clip = {
      id: "clip-1",
      demoId: "demo-1",
      demo: { userId: "user-1" },
      originalKey: "audio/demo-1/user-1/original.mp3",
      trimmedKey: null,
      fileName: "voice.mp3",
      mimeType: "audio/mpeg",
      durationSec: null,
      trimStartSec: 0,
      trimEndSec: null,
      order: 0,
      status: "UPLOADING",
      error: null,
      createdAt: new Date("2026-11-19T00:00:00Z"),
      updatedAt: new Date("2026-11-19T00:00:00Z"),
    };
    const update = vi.fn();
    const db = {
      audioClip: {
        findUnique: vi.fn().mockResolvedValue(clip),
        update,
      },
    } as unknown as AudioClipDb;
    const queue = { add: vi.fn().mockResolvedValue({ id: "queued-job" }) };

    await expect(
      confirmAudioUpload({
        db,
        queue,
        clipId: "clip-1",
        userId: "user-1",
      })
    ).rejects.toMatchObject({ status: 503 });

    expect(queue.add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(clip.status).toBe("UPLOADING");
  });
});
