import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import {
  formatBytes,
  isVideoUploadKind,
  MAX_UPLOAD_BYTES,
  validateVideoUpload,
} from "@/app/lib/subtitles";
import {
  getSignedUploadUrl,
  getSignedDownloadUrl,
  getObjectSize,
  deleteObject,
  toPublicUri,
} from "@/app/lib/storage";
import { mediaExtensionFor, normalizedMediaType } from "@/app/lib/uploads/mediaTypes";

/**
 * Ceiling for non-video uploads (watermark logo, background image, generic).
 * Video kinds use MAX_UPLOAD_BYTES (2 GB). This only stops bucket-filling.
 */
const MAX_GENERIC_UPLOAD_BYTES = 50 * 1024 * 1024;

function toSafeKind(kind: unknown) {
  if (typeof kind !== "string") return "generic";
  const cleaned = kind.trim().toLowerCase();
  if (!cleaned) return "generic";
  return cleaned.replace(/[^\w-]+/g, "-");
}

async function getCurrentUserId(sessionUser: { id?: string; email?: string | null }) {
  if (sessionUser.id) return sessionUser.id;
  if (!sessionUser.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email },
    select: { id: true },
  });
  return user?.id || null;
}

/**
 * POST /api/gcs/upload
 *
 * Generates a presigned PUT URL for direct browser → S3/GCS upload.
 * Storage backend is controlled by STORAGE_PROVIDER env var ("aws" | "gcs").
 *
 * Also handles ?action=verify after the browser finishes uploading:
 *   checks the real stored size and deletes oversized objects.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getCurrentUserId(session.user);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Minting a signed URL hands out write access to the bucket — cap it per
    // user like /api/upload does (10/min).
    if (await isRateLimited(`gcs-upload:${userId}`, 10, 60)) {
      return NextResponse.json(
        { ok: false, error: "Too many uploads (max 10 per minute)" },
        { status: 429 }
      );
    }

    // RAW_BUCKET is the AWS S3 bucket name; falls back to GCP_RAW_BUCKET for
    // backward compat when STORAGE_PROVIDER=gcs is active.
    const bucketName = (
      process.env.RAW_BUCKET ||
      process.env.GCP_RAW_BUCKET ||
      ""
    ).trim();
    if (!bucketName) {
      return NextResponse.json(
        { ok: false, error: "Missing RAW_BUCKET env var on server" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      filename?: string;
      contentType?: string;
      kind?: string;
      size?: number;
      action?: string;
      object?: string;
    };

    // Second half of the upload size control: after the browser PUTs the bytes
    // it calls back here so the real stored size is checked server-side.
    if (body.action === "verify") {
      const object = body.object;
      if (typeof object !== "string" || !object) {
        return NextResponse.json({ ok: false, error: "Missing object" }, { status: 400 });
      }
      // Objects are minted as uploads/<kind>/<userId>/... — only the owner may verify.
      const parts = object.split("/");
      if (parts.length < 4 || parts[0] !== "uploads" || parts[2] !== userId) {
        return NextResponse.json({ ok: false, error: "Unknown upload" }, { status: 404 });
      }
      const capBytes = isVideoUploadKind(parts[1]) ? MAX_UPLOAD_BYTES : MAX_GENERIC_UPLOAD_BYTES;
      try {
        const size = await getObjectSize(bucketName, object);
        if (size === null) {
          return NextResponse.json({ ok: false, error: "Upload not finished" }, { status: 404 });
        }
        if (size > capBytes) {
          await deleteObject(bucketName, object);
          return NextResponse.json(
            { ok: false, error: "That file is too large and was removed. Choose a smaller file." },
            { status: 400 }
          );
        }
        return NextResponse.json({ ok: true, size });
      } catch (error) {
        console.error("[storage] upload verify error:", error);
        return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 });
      }
    }

    const kind = toSafeKind(body.kind);
    const contentType = String(body.contentType || "application/octet-stream");
    const videoKind = isVideoUploadKind(kind);

    // A signed URL is the only thing bounding the bytes that will land in the
    // bucket: the browser can PUT directly and skip /verify entirely. So the
    // declared size must be present and finite on EVERY branch, not just the
    // non-video one. JSON `1e400` parses to Infinity and NaN is reachable via a
    // string, so Number.isFinite (not a truthiness check) is the gate.
    const declaredSize = typeof body.size === "number" ? body.size : null;
    if (declaredSize === null || !Number.isFinite(declaredSize)) {
      return NextResponse.json(
        { ok: false, error: "File size is required before upload." },
        { status: 400 }
      );
    }
    if (declaredSize <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: videoKind
            ? "That file is empty. Choose a video with content in it."
            : "That file is empty. Choose a file with content in it.",
        },
        { status: 400 }
      );
    }
    const uploadCapBytes = videoKind ? MAX_UPLOAD_BYTES : MAX_GENERIC_UPLOAD_BYTES;
    if (declaredSize > uploadCapBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: videoKind
            ? `That video is ${formatBytes(declaredSize)}. The limit is ${formatBytes(
                MAX_UPLOAD_BYTES
              )} — trim it or export it at a lower quality first.`
            : "That file is too large. Choose a smaller file.",
        },
        { status: 400 }
      );
    }

    // A strict MIME allowlist replaces the old `image/*` check. image/svg+xml
    // can carry script and must never be minted as an image upload.
    const mediaType = normalizedMediaType(contentType);
    if (!mediaType) {
      return NextResponse.json(
        { ok: false, error: "That file type is not supported for uploads." },
        { status: 400 }
      );
    }

    if (videoKind) {
      const check = validateVideoUpload({
        filename: body.filename,
        contentType: mediaType,
        size: declaredSize,
      });
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }
    }

    // The suffix comes only from the allowlisted MIME type. A client filename
    // can no longer make an image object look like an SVG or an HTML file.
    const suffix = `.${mediaExtensionFor(mediaType)}`;
    const objectKey = `uploads/${kind}/${userId}/${Date.now()}-${randomUUID()}${suffix}`;

    // Presigned PUT URL for the browser to upload directly to S3 (or GCS).
    // Pass the size cap through so GCS can sign x-goog-content-length-range;
    // AWS presigned PUT cannot enforce one, which is why the server-side reject
    // above is mandatory rather than best-effort.
    const uploadUrl = await getSignedUploadUrl(
      bucketName,
      objectKey,
      mediaType,
      15 * 60 * 1000,
      uploadCapBytes
    );

    // Presigned GET URL for immediate playback (24 h).
    const signedReadUrl = await getSignedDownloadUrl(bucketName, objectKey, 24 * 60 * 60 * 1000);

    return NextResponse.json({
      ok: true,
      bucket: bucketName,
      object: objectKey,
      uploadUrl,
      signedReadUrl,
      // Canonical storage URI — s3:// (AWS) or gs:// (GCS) per active provider.
      url: toPublicUri(bucketName, objectKey),
    });
  } catch (error) {
    console.error("[storage] upload error:", error);
    return NextResponse.json({ ok: false, error: "Failed to upload file" }, { status: 500 });
  }
}
