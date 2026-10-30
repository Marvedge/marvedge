import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isAudioUploadEnabled } from "@/app/lib/audio/flags";
import { asAudioClipDb } from "@/app/lib/audio/db";
import { ApiError, requestAudioTrim } from "@/app/lib/audio/service";

const trimSchema = z.object({
  trimStartSec: z.number().min(0, "Trim start cannot be negative"),
  trimEndSec: z.number(),
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

  const parsed = trimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const clip = await requestAudioTrim({
      db: asAudioClipDb(prisma),
      clipId,
      userId: session.user.id,
      trimStartSec: parsed.data.trimStartSec,
      trimEndSec: parsed.data.trimEndSec,
    });
    return NextResponse.json({ success: true, clip });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Audio trim error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
