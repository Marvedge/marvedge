import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/app/lib/auth/options";
import { prisma } from "@/app/lib/prisma";
import { invokeGcpComposite } from "@/app/lib/gcpWorker";
import { isWtmAllowed } from "@/app/lib/wtm/access";
import { isWtmEnabled } from "@/app/lib/wtm/flags";
import { toHttpsUrl } from "@/app/lib/wtm/watermark";
import { sanitizeWebcamConfig } from "@/app/lib/wtm/webcam";

// The worker downloads both inputs, runs a per-pixel circular mask and
// re-encodes the whole source in one pass, so this round-trip is slow. Keep the
// function budget at the platform maximum; the worker itself is allowed a
// longer 15-minute window (see WTM_COMPOSITE_TIMEOUT_MS in gcpWorker.ts), so a
// very long source can still outlive this route — PR 6 owns the export-flow
// wiring and can move it behind the /api/jobs polling pattern if that bites.
export const maxDuration = 300;

/**
 * POST /api/wtm/composite — bake the circular webcam bubble into the source
 * video (WTM-6.4) and return the composited MP4's URL, which the caller then
 * exports in place of the original. This is a PRE-PASS: it does not touch the
 * chunked export path at all.
 *
 * PRO/ENTERPRISE only, and a no-op unless WTM_ENABLED is set. Degrades
 * gracefully: a missing/disabled webcam config, or one without a recorded
 * `sourceUrl`, returns the source URL unchanged rather than erroring, so a
 * caller can invoke this unconditionally.
 */
export async function POST(req: NextRequest) {
  // Flag off → the feature is invisible; behave as if the route doesn't exist.
  if (!isWtmEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        session.user.id ? { id: session.user.id as string } : undefined,
        session.user.email ? { email: session.user.email } : undefined,
      ].filter(Boolean) as Array<{ id?: string; email?: string }>,
    },
    select: { id: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // The bubble composited into an export is a paid feature — capture itself is
  // free (see the plan's gating decision), the gate sits here at export time.
  if (!isWtmAllowed(user.plan)) {
    return NextResponse.json(
      { error: "The camera bubble is available on PRO and ENTERPRISE plans." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawVideoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  if (!rawVideoUrl) {
    return NextResponse.json({ error: "Missing videoUrl" }, { status: 400 });
  }
  // gs:// isn't fetchable by the worker's http downloader.
  const videoUrl = toHttpsUrl(rawVideoUrl);

  // Whatever the client sends is only ever a request: re-validate and clamp it
  // here, exactly like jobs/create does for the watermark.
  const webcam = sanitizeWebcamConfig(body.webcam);

  if (!webcam || !webcam.enabled || !webcam.sourceUrl) {
    return NextResponse.json({
      success: true,
      compositedVideoUrl: videoUrl,
      duration: 0,
      fallback: true,
    });
  }

  try {
    const result = await invokeGcpComposite({
      videoUrl,
      webcamUrl: webcam.sourceUrl,
      position: webcam.position,
      size: webcam.size,
      shape: webcam.shape,
    });

    return NextResponse.json({
      success: true,
      compositedVideoUrl: result.compositedVideoUrl,
      duration: result.duration,
      fallback: false,
    });
  } catch (err) {
    console.error("WTM composite failed:", err);
    return NextResponse.json({ error: "Compositing failed" }, { status: 500 });
  }
}
