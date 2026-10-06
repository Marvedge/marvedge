import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Storage } from "@google-cloud/storage";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isVideoUploadKind, MAX_UPLOAD_BYTES, validateVideoUpload } from "@/app/lib/subtitles";

/**
 * Ceiling for non-video uploads (watermark logo, background image, generic)
 * on the signed link itself. Video kinds use MAX_UPLOAD_BYTES (2 GB) instead.
 * Watermarks are client-checked at 2 MB and backgrounds are a few MB, so
 * 50 MB is far above every legitimate use — it only stops bucket-filling.
 */
const MAX_GENERIC_UPLOAD_BYTES = 50 * 1024 * 1024;

function getStorageClient() {
  const projectId = (
    process.env.GOOGLE_CLOUD_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    ""
  ).trim();
  const clientEmail = (process.env.GOOGLE_CLOUD_CLIENT_EMAIL || "").trim();
  const privateKeyRaw = process.env.GOOGLE_CLOUD_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Google Cloud credentials env (GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CLOUD_CLIENT_EMAIL, GOOGLE_CLOUD_PRIVATE_KEY)"
    );
  }

  return new Storage({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function extFromFilename(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) {
    return "";
  }
  return name.slice(idx + 1).toLowerCase();
}

function extFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("video/webm")) {
    return "webm";
  }
  if (normalized.includes("video/mp4")) {
    return "mp4";
  }
  if (normalized.includes("image/png")) {
    return "png";
  }
  if (normalized.includes("image/jpeg")) {
    return "jpg";
  }
  return "";
}

function toSafeKind(kind: unknown) {
  if (typeof kind !== "string") {
    return "generic";
  }
  const cleaned = kind.trim().toLowerCase();
  if (!cleaned) {
    return "generic";
  }
  return cleaned.replace(/[^\w-]+/g, "-");
}

async function getCurrentUserId(sessionUser: { id?: string; email?: string | null }) {
  if (sessionUser.id) {
    return sessionUser.id;
  }
  if (!sessionUser.email) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email },
    select: { id: true },
  });
  return user?.id || null;
}

/**
 * Second half of the size control. The browser PUTs bytes straight into the
 * bucket, so after a successful PUT it calls back with the object name and
 * the real stored size is checked here. Oversized objects are deleted on the
 * spot; honest uploads pass through untouched.
 */
async function verifyUploadedObject(bucketName: string, object: unknown, userId: string) {
  if (typeof object !== "string" || !object) {
    return NextResponse.json({ ok: false, error: "Missing object" }, { status: 400 });
  }
  // Objects are minted as uploads/<kind>/<userId>/... — only the owner who
  // was handed the URL may verify it, so one user cannot probe or delete
  // another user's uploads.
  const parts = object.split("/");
  if (parts.length < 4 || parts[0] !== "uploads" || parts[2] !== userId) {
    return NextResponse.json({ ok: false, error: "Unknown upload" }, { status: 404 });
  }
  const capBytes = isVideoUploadKind(parts[1]) ? MAX_UPLOAD_BYTES : MAX_GENERIC_UPLOAD_BYTES;
  try {
    const storage = getStorageClient();
    const file = storage.bucket(bucketName).file(object);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isFinite(size)) {
      return NextResponse.json({ ok: false, error: "Upload not finished" }, { status: 404 });
    }
    if (size > capBytes) {
      await file.delete().catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: "That file is too large and was removed. Choose a smaller file." },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, size });
  } catch (error) {
    console.error("GCS upload verify error:", error);
    return NextResponse.json({ ok: false, error: "Upload not found" }, { status: 404 });
  }
}

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

    const bucketName = (process.env.GCP_RAW_BUCKET || process.env.RAW_BUCKET || "").trim();
    if (!bucketName) {
      return NextResponse.json(
        { ok: false, error: "Missing GCP_RAW_BUCKET/RAW_BUCKET on server" },
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

    // Second half of the size control: after the browser PUTs the bytes it
    // calls back here and the real stored size is checked (see below).
    if (body.action === "verify") {
      return verifyUploadedObject(bucketName, body.object, userId);
    }

    const kind = toSafeKind(body.kind);
    const contentType = String(body.contentType || "application/octet-stream");

    // Container and size limits (PRD §6.1), enforced HERE and not only at the
    // file input: this route mints a signed URL that writes straight into the
    // bucket, so the browser check is a courtesy and this is the control. Only
    // video kinds are measured against a video's rules — a watermark PNG or a
    // background image goes through this same route and must not be judged
    // against them.
    //
    // Two layers: (1) `size` is what the client SAYS it is about to upload —
    // the check below stops the ordinary case of a user picking a file that is
    // too big. (2) A client can lie about `size`, and a PUT signed URL cannot
    // carry a length condition, so after the browser PUTs the bytes it must
    // call back with { action: "verify", object } and the real stored size is
    // checked, deleting the object when it is over the cap.
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
    const object = `uploads/${kind}/${userId}/${Date.now()}-${randomUUID()}${suffix}`;

    const storage = getStorageClient();
    const file = storage.bucket(bucketName).file(object);
    const [signedUploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    // Optional signed GET for immediate playback if bucket is private.
    const [signedReadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({
      ok: true,
      bucket: bucketName,
      object,
      uploadUrl: signedUploadUrl,
      signedReadUrl,
      url: `gs://${bucketName}/${object}`,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${object}`,
    });
  } catch (error) {
    console.error("GCS upload error:", error);
    return NextResponse.json({ ok: false, error: "Failed to upload file" }, { status: 500 });
  }
}
