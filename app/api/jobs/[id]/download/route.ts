import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { isSafeUrl } from "@/app/lib/safeUrl";
import { getAudioExtension, getDubbedAudio } from "@/app/lib/elevenlabs/dubbing";

function sanitizeFilename(input: string) {
  const cleaned = input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned || "Exported_Demo";
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const title = req.nextUrl.searchParams.get("title") || "Exported_Demo";

    const job = await prisma.videoJob.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        exportedUrl: true,
        jobData: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const jobData = job.jobData as Record<string, unknown> | null;
    if (
      jobData?.kind === "DUBBING" &&
      typeof jobData.dubbingId === "string" &&
      typeof jobData.targetLanguage === "string"
    ) {
      // Guard: only serve audio for jobs that have actually completed. A job
      // that is still PROCESSING does not yet have retrievable audio at ElevenLabs.
      if (job.status !== "COMPLETED") {
        return NextResponse.json({ error: "Dubbing job is not completed" }, { status: 400 });
      }

      try {
        const { audio, contentType } = await getDubbedAudio(
          jobData.dubbingId,
          jobData.targetLanguage
        );
        const ext = getAudioExtension(contentType);
        const filename = `${sanitizeFilename(title)}.${ext}`;
        return new NextResponse(audio, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      } catch (upstreamErr) {
        // Log full upstream details server-side; return a generic message to
        // avoid leaking ElevenLabs error bodies or internal paths to clients.
        console.error("[download] Dubbed audio upstream error:", upstreamErr);
        return NextResponse.json({ error: "Failed to retrieve dubbed audio" }, { status: 502 });
      }
    }

    if (!job.exportedUrl) {
      return NextResponse.json({ error: "No exported URL available" }, { status: 400 });
    }

    // recheck the stored url: poisoned rows fail closed here
    if (!isSafeUrl(job.exportedUrl)) {
      return NextResponse.json({ error: "Exported file URL is not allowed" }, { status: 400 });
    }

    const upstream = await fetch(job.exportedUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Failed to fetch exported file (${upstream.status})` },
        { status: 502 }
      );
    }

    const filename = `${sanitizeFilename(title)}.mp4`;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Job Download Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
