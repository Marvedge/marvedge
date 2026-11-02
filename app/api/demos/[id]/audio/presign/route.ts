import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isAudioUploadEnabled } from "@/app/lib/audio/flags";
import { asAudioClipDb } from "@/app/lib/audio/db";
import { ApiError, createAudioUpload } from "@/app/lib/audio/service";
import { isAudioRateLimited } from "@/app/lib/audio/rateLimit";

const presignSchema = z.object({
  fileName: z.string().min(1, "A file name is required"),
  mimeType: z.string().min(1, "A MIME type is required"),
  size: z.number().int().positive("File size must be positive"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAudioUploadEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const demo = await prisma.demo.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!demo) {
    return NextResponse.json({ error: "Demo not found" }, { status: 404 });
  }

  if (await isAudioRateLimited(session.user.id, "presign")) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const result = await createAudioUpload({
      db: asAudioClipDb(prisma),
      demoId: demo.id,
      userId: session.user.id,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Audio presign error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
