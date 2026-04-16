import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Storage } from "@google-cloud/storage";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";

const storage = new Storage();

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

function extFromFilename(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) {
    return "";
  }
  return name.slice(idx + 1).toLowerCase();
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

    const formData = await req.formData();
    const file = formData.get("file");
    const kind = toSafeKind(formData.get("kind"));

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const safeOriginal = sanitizeFilename(file.name || "upload.bin");
    const ext = extFromFilename(safeOriginal);
    const suffix = ext ? `.${ext}` : "";
    const object = `uploads/${kind}/${userId}/${Date.now()}-${randomUUID()}${suffix}`;

    await storage.bucket(bucketName).file(object).save(bytes, {
      resumable: false,
      contentType: file.type || "application/octet-stream",
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
      },
    });

    return NextResponse.json({
      ok: true,
      bucket: bucketName,
      object,
      url: `gs://${bucketName}/${object}`,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${object}`,
    });
  } catch (error) {
    console.error("GCS upload error:", error);
    return NextResponse.json({ ok: false, error: "Failed to upload file" }, { status: 500 });
  }
}
