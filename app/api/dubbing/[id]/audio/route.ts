import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { getAudioExtension, getDubbedAudio } from "@/app/lib/elevenlabs/dubbing";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { prisma } from "@/app/lib/prisma";

// Strip characters that are unsafe in quoted Content-Disposition filenames.
// Retains alphanumerics, hyphens, underscores, and dots.
function sanitizeFilenamePart(raw: string): string {
  return raw.replace(/[^\w.-]/g, "_").replace(/_{2,}/g, "_") || "audio";
}

// Each GET calls a paid vendor endpoint, so bound both the request rate and
// the size of the body we are willing to hand back to the client.
const MAX_DUBBED_AUDIO_BYTES = 50 * 1024 * 1024;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (await isRateLimited(`dubbing-audio:${session.user.id}`, 30, 60 * 60, true)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        jobData: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (job.status !== "COMPLETED") {
      return NextResponse.json({ error: "Dubbing job is not completed" }, { status: 400 });
    }

    const jobData = job.jobData as Record<string, unknown> | null;
    if (
      !jobData ||
      jobData.kind !== "DUBBING" ||
      typeof jobData.dubbingId !== "string" ||
      !jobData.dubbingId ||
      typeof jobData.targetLanguage !== "string" ||
      !jobData.targetLanguage
    ) {
      return NextResponse.json({ error: "Job does not have valid dubbing data" }, { status: 400 });
    }

    try {
      const { audio, contentType } = await getDubbedAudio(
        jobData.dubbingId,
        jobData.targetLanguage
      );

      if (audio.byteLength > MAX_DUBBED_AUDIO_BYTES) {
        console.error(`[dubbing-audio] Upstream audio too large for job ${id}`);
        return NextResponse.json({ error: "Dubbed audio is too large" }, { status: 502 });
      }

      const isDownload = req.nextUrl.searchParams.get("download") === "true";
      let disposition = "inline";
      if (isDownload) {
        // Sanitize both the job id and language code independently before
        // embedding them in the quoted filename to prevent header injection.
        const safeId = sanitizeFilenamePart(id);
        const safeLang = sanitizeFilenamePart(jobData.targetLanguage);
        const ext = getAudioExtension(contentType);
        disposition = `attachment; filename="dubbed_${safeId}_${safeLang}.${ext}"`;
      }

      return new NextResponse(audio, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": disposition,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (err) {
      // Log the full error server-side (may contain upstream details) but
      // return a generic message to the client to avoid leaking internals.
      console.error(`[dubbing-audio] Failed to retrieve audio for job ${id}:`, err);
      return NextResponse.json({ error: "Failed to retrieve dubbed audio" }, { status: 502 });
    }
  } catch (error) {
    console.error("[dubbing-audio] Route error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
