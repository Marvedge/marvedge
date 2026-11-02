import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isAudioUploadEnabled } from "@/app/lib/audio/flags";
import { asAudioClipDb } from "@/app/lib/audio/db";
import { ApiError, deleteAudioClip, renameAudioClip } from "@/app/lib/audio/service";
import { deleteAudioObjects } from "@/app/lib/audio/storage";

const renameSchema = z.object({
  fileName: z.string().min(1, "A file name is required"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  if (!isAudioUploadEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const clip = await renameAudioClip({
      db: asAudioClipDb(prisma),
      clipId,
      userId: session.user.id,
      fileName: parsed.data.fileName,
    });
    return NextResponse.json({ success: true, clip });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Audio rename error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  if (!isAudioUploadEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clipId } = await params;

  let objectKeys: string[] = [];
  try {
    const result = await deleteAudioClip({
      db: asAudioClipDb(prisma),
      clipId,
      userId: session.user.id,
    });
    objectKeys = result.objectKeys;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Audio delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Drop the R2 objects after the response is sent — the row is already gone,
  // so a slow storage delete must never delay the user.
  after(() => {
    void deleteAudioObjects(objectKeys);
  });

  return NextResponse.json({ success: true });
}
