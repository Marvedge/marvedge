import { prisma } from "@/app/lib/prisma";

/**
 * Shared authorization for resolving a native storage URI (s3:// or gs://).
 *
 * A presigned URL is a capability: whoever holds it can read the object with the
 * server's credentials. Two things may be signed:
 *
 *   1. an object under the configured upload bucket and the caller's own
 *      `uploads/<kind>/<userId>/` prefix, or
 *   2. an object a row owned by the caller already references (legacy imports
 *      and worker outputs live in other buckets).
 *
 * Everything else — another bucket, another user's upload prefix, an internal
 * key — must be refused before `getPresignedUrl` is called.
 */

export function configuredUploadBucket(): string {
  return (process.env.RAW_BUCKET || process.env.GCP_RAW_BUCKET || "").trim();
}

export function isUserUploadObject(object: string, userId: string): boolean {
  const parts = object.split("/");
  return (
    parts.length >= 4 &&
    parts[0] === "uploads" &&
    Boolean(parts[1]) &&
    parts[2] === userId &&
    parts.slice(3).some(Boolean)
  );
}

async function isReferencedByUser(inputUrl: string, userId: string): Promise<boolean> {
  const [demo, videoJob, exportedVideo] = await Promise.all([
    prisma.demo.findFirst({
      where: { userId, OR: [{ videoUrl: inputUrl }, { exportedUrl: inputUrl }] },
      select: { id: true },
    }),
    prisma.videoJob.findFirst({
      where: { userId, OR: [{ videoUrl: inputUrl }, { exportedUrl: inputUrl }] },
      select: { id: true },
    }),
    prisma.exportedVideo.findFirst({
      where: { userId, OR: [{ exportedUrl: inputUrl }, { sourceVideoUrl: inputUrl }] },
      select: { id: true },
    }),
  ]);
  return Boolean(demo || videoJob || exportedVideo);
}

export async function mayResolveObject(
  inputUrl: string,
  bucket: string,
  object: string,
  userId: string
): Promise<boolean> {
  const uploadBucket = configuredUploadBucket();
  if (uploadBucket && bucket === uploadBucket && isUserUploadObject(object, userId)) {
    return true;
  }
  return isReferencedByUser(inputUrl, userId);
}
