import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isVideoUploadKind, MAX_UPLOAD_BYTES, validateVideoUpload } from "@/app/lib/subtitles";
import {
  getSignedUploadUrl,
  getSignedDownloadUrl,
  getObjectSize,
  deleteObject,
  toPublicUri,
} from "@/app/lib/storage";

/**
 * Ceiling for non-video uploads (watermark logo, background image, generic).
 * Video kinds use MAX_UPLOAD_BYTES (2 GB). This only stops bucket-filling.
 */
const MAX_GENERIC_UPLOAD_BYTES = 50 * 1024 * 1024;

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function extFromFilename(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function extFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("video/webm")) return "webm";
  if (normalized.includes("video/mp4")) return "mp4";
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/jpeg")) return "jpg";
  return "";
}

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

    // Container and size limits — enforced here, not just client-side.
    if (isVideoUploadKind(kind)) {
      const check = validateVideoUpload({
        filename: body.filename,
        contentType,
        size: typeof body.size === "number" ? body.size : null,
      });
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }
    }

    const fallbackName = contentType.startsWith("video/") ? "upload.webm" : "upload.bin";
    const safeOriginal = sanitizeFilename(body.filename || fallbackName);
    const ext = extFromFilename(safeOriginal) || extFromContentType(contentType);
    const suffix = ext ? `.${ext}` : "";
    const objectKey = `uploads/${kind}/${userId}/${Date.now()}-${randomUUID()}${suffix}`;

    // Presigned PUT URL for the browser to upload directly to S3 (or GCS).
    const uploadUrl = await getSignedUploadUrl(bucketName, objectKey, contentType);

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
