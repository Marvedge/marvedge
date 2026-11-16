import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioClipRecord } from "../../types/audio";
import type { AudioClipDb } from "./db";
import * as media from "./media";
import * as r2 from "../r2";
import { AUDIO_MAX_BYTES } from "./validation";

import { runMetadataJob, runTrimJob } from "./jobs";

type RecordWithOwner = AudioClipRecord & { demo: { userId: string } };

function makeRecord(overrides: Partial<AudioClipRecord> = {}): RecordWithOwner {
  return {
    id: "clip-1",
    demoId: "demo-1",
    originalKey: "audio/demo-1/user-1/1700000000000-123e4567-e89b-12d3-a456-426614174000.mp3",
    trimmedKey: null,
    fileName: "voiceover.mp3",
    mimeType: "audio/mpeg",
    durationSec: null,
    trimStartSec: 0,
    trimEndSec: null,
    order: 0,
    status: "UPLOADING",
    error: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    demo: { userId: "user-1" },
    ...overrides,
  };
}

function createFakeDb(initial: AudioClipRecord[] = []) {
  const map = new Map<string, RecordWithOwner>();
  for (const record of initial) {
    map.set(record.id, makeRecord(record));
  }
  const audioClip = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => map.get(where.id) ?? null),
    findMany: vi.fn(async () => [...map.values()]),
    create: vi.fn(async ({ data }: { data: Partial<AudioClipRecord> }) => {
      const record = makeRecord({
        ...data,
        id: `clip-${map.size + 1}`,
      } as Partial<AudioClipRecord>);
      map.set(record.id, record);
      return record;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<AudioClipRecord> }) => {
        const current = map.get(where.id);
        if (!current) {
          throw new Error("Clip not found");
        }
        const next: RecordWithOwner = { ...current, ...data, updatedAt: new Date() };
        map.set(where.id, next);
        return next;
      }
    ),
    updateMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    aggregate: vi.fn(async () => ({ _max: { order: null } })),
  };
  return { db: { audioClip } as unknown as AudioClipDb, get: (id: string) => map.get(id)! };
}

const WAV_HEADER = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WAVE"),
  Buffer.alloc(64),
]);

beforeEach(() => {
  vi.spyOn(media, "downloadAudioToFile").mockImplementation(async (_url, destinationPath) => {
    fs.writeFileSync(destinationPath, WAV_HEADER);
  });
  vi.spyOn(media, "probeAudioDuration").mockResolvedValue(123.4);
  vi.spyOn(media, "trimAudioFile").mockResolvedValue();
  vi.spyOn(media, "uploadAudioViaSignedUrl").mockResolvedValue();
  vi.spyOn(r2, "deleteObject").mockResolvedValue();
  vi.spyOn(r2, "getR2RawBucket").mockReturnValue("raw");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runMetadataJob", () => {
  it("runs UPLOADING → PROCESSING → READY with duration + detected MIME", async () => {
    const { db, get } = createFakeDb([makeRecord()]);

    await runMetadataJob(
      { clipId: "clip-1", sourceUrl: "https://signed.example.test/original" },
      db
    );

    const clip = get("clip-1");
    expect(clip.status).toBe("READY");
    expect(clip.durationSec).toBe(123.4);
    expect(clip.mimeType).toBe("audio/wav"); // sniffed from the bytes, not the client header
    expect(clip.error).toBeNull();
  });

  it("fails a clip whose bytes exceed the 50MB cap", async () => {
    const { db, get } = createFakeDb([makeRecord()]);
    vi.spyOn(fs.promises, "stat").mockResolvedValue({ size: AUDIO_MAX_BYTES + 1 } as fs.Stats);

    await expect(
      runMetadataJob({ clipId: "clip-1", sourceUrl: "https://signed.example.test/original" }, db)
    ).rejects.toThrow("50MB");

    const clip = get("clip-1");
    expect(clip.status).toBe("FAILED");
    expect(clip.error).toContain("50MB");
    expect(clip.durationSec).toBeNull();
  });

  it("fails a clip whose magic bytes are not an allowed audio type", async () => {
    const { db, get } = createFakeDb([makeRecord()]);
    vi.spyOn(media, "readHeadBytes").mockReturnValue(Buffer.from("GIF89a........."));

    await expect(
      runMetadataJob({ clipId: "clip-1", sourceUrl: "https://signed.example.test/original" }, db)
    ).rejects.toThrow("Unsupported audio type");

    expect(get("clip-1").status).toBe("FAILED");
  });

  it("is a no-op for an already-READY clip (retry-safe)", async () => {
    const { db } = createFakeDb([makeRecord({ status: "READY", durationSec: 10 })]);

    await runMetadataJob(
      { clipId: "clip-1", sourceUrl: "https://signed.example.test/original" },
      db
    );

    expect(db.audioClip.update).not.toHaveBeenCalled();
  });

  it("fails when the clip does not exist", async () => {
    const { db } = createFakeDb();
    await expect(
      runMetadataJob({ clipId: "missing", sourceUrl: "https://signed.example.test/original" }, db)
    ).rejects.toThrow("Audio clip not found");
  });
});

describe("runTrimJob", () => {
  const trimPayload = {
    clipId: "clip-1",
    sourceUrl: "https://signed.example.test/original",
    uploadUrl: "https://signed.example.test/trimmed-upload",
    trimmedKey: "audio/demo-1/user-1/1700000001000-11111111-2222-3333-4444-555555555555.mp3",
    previousTrimmedKey: null,
    mimeType: "audio/mpeg",
    trimStartSec: 5,
    trimEndSec: 20,
  };

  it("re-trims from the ORIGINAL and stores a new trimmedKey", async () => {
    const { db, get } = createFakeDb([makeRecord({ status: "READY", durationSec: 123.4 })]);

    await runTrimJob(trimPayload, db);

    const clip = get("clip-1");
    expect(clip.status).toBe("READY");
    expect(clip.trimmedKey).toBe(trimPayload.trimmedKey);
    expect(clip.trimStartSec).toBe(5);
    expect(clip.trimEndSec).toBe(20);
    expect(clip.error).toBeNull();
  });

  it("deletes the previous trimmed object best-effort after a successful re-trim", async () => {
    const { db } = createFakeDb([
      makeRecord({
        status: "READY",
        durationSec: 123.4,
        trimmedKey: "audio/demo-1/user-1/OLD.mp3",
        trimStartSec: 1,
        trimEndSec: 2,
      }),
    ]);

    await runTrimJob({ ...trimPayload, previousTrimmedKey: "audio/demo-1/user-1/OLD.mp3" }, db);

    expect(r2.deleteObject).toHaveBeenCalledWith({
      bucket: "raw",
      object: "audio/demo-1/user-1/OLD.mp3",
    });
  });

  it("cleans up the output actually replaced by a queued trim", async () => {
    const earlierKey = "audio/demo-1/user-1/earlier.mp3";
    const currentKey = "audio/demo-1/user-1/current.mp3";
    const { db, get } = createFakeDb([
      makeRecord({ status: "READY", durationSec: 123.4, trimmedKey: currentKey }),
    ]);

    await runTrimJob({ ...trimPayload, previousTrimmedKey: earlierKey }, db);

    expect(get("clip-1").trimmedKey).toBe(trimPayload.trimmedKey);
    expect(r2.deleteObject).toHaveBeenCalledExactlyOnceWith({
      bucket: "raw",
      object: currentKey,
    });
  });

  it("keeps the previous trimmedKey intact when the trim fails", async () => {
    const { db, get } = createFakeDb([
      makeRecord({
        status: "READY",
        durationSec: 123.4,
        trimmedKey: "audio/demo-1/user-1/OLD.mp3",
      }),
    ]);
    vi.spyOn(media, "trimAudioFile").mockRejectedValue(new Error("ffmpeg exploded"));

    await expect(runTrimJob(trimPayload, db)).rejects.toThrow("ffmpeg exploded");

    const clip = get("clip-1");
    expect(clip.status).toBe("FAILED");
    expect(clip.trimmedKey).toBe("audio/demo-1/user-1/OLD.mp3"); // still playable
    expect(clip.trimEndSec).toBeNull();
    expect(r2.deleteObject).not.toHaveBeenCalled();
  });

  it("is a no-op when the same trim is already applied (retry-safe)", async () => {
    const { db } = createFakeDb([
      makeRecord({
        status: "READY",
        durationSec: 123.4,
        trimmedKey: trimPayload.trimmedKey,
        trimStartSec: 5,
        trimEndSec: 20,
      }),
    ]);

    await runTrimJob(trimPayload, db);

    expect(db.audioClip.update).not.toHaveBeenCalled();
  });

  it("fails the clip when the original cannot be validated", async () => {
    const { db, get } = createFakeDb([makeRecord({ status: "READY", durationSec: 123.4 })]);
    vi.spyOn(media, "readHeadBytes").mockReturnValue(Buffer.from("not-audio-at-all"));

    await expect(runTrimJob(trimPayload, db)).rejects.toThrow("could not be validated");

    expect(get("clip-1").status).toBe("FAILED");
  });
});
