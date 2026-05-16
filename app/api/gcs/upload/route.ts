import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Storage } from "@google-cloud/storage";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

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
    };
    const kind = toSafeKind(body.kind);
    const contentType = String(body.contentType || "application/octet-stream");
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
