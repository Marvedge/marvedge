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

  const { clipId } = await ctx.params;
  const db = asAudioClipDb(prisma);

  try {
    const { clip } = await resolveOwnedClip(db, clipId, userId);
    if (clip.status !== "UPLOADING") {
      return NextResponse.json({ error: "Clip already uploaded" }, { status: 409 });
    }

    const body = await request.arrayBuffer();
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
