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

// Bound the upstream fetch: a hung object store must not hold the route open,
// and an unbounded proxy turns this endpoint into free bandwidth.
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

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
            "X-Content-Type-Options": "nosniff",
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

    const upstream = await fetch(job.exportedUrl, {
      cache: "no-store",
      // The stored URL passed isSafeUrl, but a 30x would move the fetch to a new
      // host after that check. Do not follow redirects; 3xx is a failed fetch.
      redirect: "manual",
      // Bound a hung upstream so one slow object store can't hold the route open.
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    }).catch(() => null);
    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Failed to fetch exported file (${upstream?.status ?? "network error"})` },
        { status: 502 }
      );
    }

    // Refuse absurdly large upstreams before streaming them to the client.
    const declaredLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json({ error: "Exported file is too large" }, { status: 502 });
    }

    // Enforce the cap while streaming too — content-length is upstream-controlled
    // and may be absent or a lie. The upstream reader is cancelled the moment
    // the cap is exceeded so a chunked response stops consuming bandwidth
    // instead of buffering behind a failed client stream.
    let streamedBytes = 0;
    const cappedBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            streamedBytes += value.byteLength;
            if (streamedBytes > MAX_DOWNLOAD_BYTES) {
              try {
                await reader.cancel();
              } catch {
                // Reader already closed/errored; the cap error below still applies.
              }
              controller.error(new Error("Exported file exceeds size limit"));
              return;
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });

    const filename = `${sanitizeFilename(title)}.mp4`;
    return new NextResponse(cappedBody, {
      status: 200,
      headers: {
        // Fixed type, never the upstream's: with nosniff the browser won't sniff
        // a mislabelled object into executable content.
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Job Download Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
