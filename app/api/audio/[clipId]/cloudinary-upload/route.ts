// POST/PUT /api/audio/:clipId/cloudinary-upload — Cloudinary testing-mode upload
// target. The browser PUTs the raw file here (same call shape as an R2
// pre-signed PUT), we store it via the unsigned Cloudinary preset and save the
// resulting https URL as the clip's originalKey. Only used when R2 credentials
// are not configured.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { asAudioClipDb } from "@/app/lib/audio/db";
import { ApiError, resolveOwnedClip } from "@/app/lib/audio/service";
import { isAudioUploadEnabled } from "@/app/lib/audio/flags";
import { CloudinaryUploadError, cloudinaryUploadBuffer } from "@/app/lib/cloudinaryUpload";

import { readBoundedRequestBytes } from "@/app/lib/http/boundedBytes";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CloudinaryUploadError) {
    console.error("[audio] cloudinary-upload failed:", error);
    return NextResponse.json({ error: "Failed to store audio" }, { status: error.status });
  }
  console.error("[audio] cloudinary-upload failed:", error);
  return NextResponse.json({ error: "Failed to store audio" }, { status: 500 });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ clipId: string }> }) {
  if (!isAudioUploadEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reject oversized declarations immediately. The bounded reader also counts
  // actual incoming bytes when Content-Length is absent or understated.
  const declaredBytes = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds the 50MB limit" }, { status: 413 });
  }

  const { clipId } = await ctx.params;
  const db = asAudioClipDb(prisma);

  try {
    const { clip } = await resolveOwnedClip(db, clipId, userId);
    if (clip.status !== "UPLOADING") {
      return NextResponse.json({ error: "Clip already uploaded" }, { status: 409 });
    }

    const bodyResult = await readBoundedRequestBytes(request, MAX_BYTES);

    if (!bodyResult.ok) {
      const error =
        bodyResult.reason === "too_large"
          ? "File exceeds the 50MB limit"
          : bodyResult.reason === "empty"
            ? "Empty request body"
            : "Invalid request body";

      return NextResponse.json(
        { error },
        { status: bodyResult.reason === "too_large" ? 413 : 400 }
      );
    }

    const body = bodyResult.value;
    if (!body || body.byteLength === 0) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }
    if (body.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds the 50MB limit" }, { status: 413 });
    }

    const secureUrl = await cloudinaryUploadBuffer({
      buffer: Buffer.from(body),
      contentType: clip.mimeType || "audio/mpeg",
      folder: "marvedge/audio",
      filename: clip.fileName || undefined,
    });

    await db.audioClip.update({
      where: { id: clipId },
      data: { originalKey: secureUrl },
    });
  } catch (error) {
    return errorResponse(error);
  }

  return NextResponse.json({ success: true });
}
