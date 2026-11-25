// Minimal structural interface over the Prisma AudioClip delegate.
//
// Both the service layer (API routes) and the background jobs take a `db` of
// this shape, so the jobs can run in the BullMQ worker and the whole flow can
// be integration-tested with an in-memory mock. Routes/worker pass the real
// client via `asAudioClipDb(prisma)` (a type-only cast); tests pass a plain
// object fake.

import type { PrismaClient } from "@prisma/client";
import type { AudioClipRecord } from "../../types/audio";

export type AudioClipWithDemo = AudioClipRecord & { demo: { userId: string } };

/** Fields a service call may write on an AudioClip. */
export type AudioClipUpdate = Partial<
  Pick<
    AudioClipRecord,
    | "fileName"
    | "mimeType"
    | "durationSec"
    | "trimStartSec"
    | "trimEndSec"
    | "order"
    | "status"
    | "error"
    | "originalKey"
    | "trimmedKey"
  >
>;

export interface AudioClipDb {
  audioClip: {
    findUnique(args: {
      where: { id: string };
      include?: { demo: { select: { userId: true } } };
    }): Promise<AudioClipWithDemo | null>;
    findMany(args: {
      where?: { demoId?: string };
      orderBy?: Array<{ order?: "asc" | "desc"; createdAt?: "asc" | "desc" }>;
    }): Promise<AudioClipRecord[]>;
    create(args: {
      data: Pick<
        AudioClipRecord,
        "demoId" | "originalKey" | "fileName" | "mimeType" | "status" | "order"
      >;
    }): Promise<AudioClipRecord>;
    update(args: { where: { id: string }; data: AudioClipUpdate }): Promise<AudioClipRecord>;
    updateMany(args: {
      where: {
        id?: string;
        demo?: { userId?: string };
        status?: string | { in: string[] };
      };
      data: AudioClipUpdate;
    }): Promise<{ count: number }>;
    deleteMany(args: {
      where: { id?: string; demo?: { userId?: string } };
    }): Promise<{ count: number }>;
    aggregate(args: {
      where: { demoId?: string };
      _max: { order: true };
    }): Promise<{ _max: { order: number | null } }>;
  };
}

/** Type-only bridge from the real PrismaClient to the audio DB interface. */
export function asAudioClipDb(prisma: PrismaClient): AudioClipDb {
  return prisma as unknown as AudioClipDb;
}
