import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { QR_SOURCE_VALUE } from "@/app/lib/share/qrTarget";

export const runtime = "nodejs";

/**
 * Attribution for a view, currently only "qr" — set when the visitor arrived by
 * scanning a share QR, which encodes the share URL with `?src=qr`.
 *
 * NOT PERSISTED, and that is a deliberate stopping point rather than an
 * oversight. `model View` has no column this could go in (id, demoId,
 * exportedVideoId, timestamp, duration) and there is no events table, so storing
 * it would mean a prisma/schema.prisma change and a migration — out of scope for
 * the QR work, which is otherwise purely additive. It is logged instead, so scan
 * volume is observable in the server logs today, and the client already sends it:
 * whoever adds the column writes one line here and gets history from that day on.
 */
function readViewSource(raw: unknown): typeof QR_SOURCE_VALUE | undefined {
  return raw === QR_SOURCE_VALUE ? QR_SOURCE_VALUE : undefined;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// players heartbeat every 5s, so updates get a roomy budget while
// creates stay tight enough to blunt refresh spam
const CREATE_LIMIT = 30;
const UPDATE_LIMIT = 300;
const WINDOW_SECONDS = 60;
const MAX_DURATION = 86400;

export async function POST(req: NextRequest) {
  try {
    const { demoId, exportedVideoId, duration, viewId, source } = await req.json();
    const ip = clientIp(req);

    if (viewId && duration !== undefined) {
      if (await isRateLimited(`views:update:${ip}`, UPDATE_LIMIT, WINDOW_SECONDS)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
      // duration maps to an Int column, so only clean numbers get through
      const seconds =
        typeof duration === "number" && Number.isFinite(duration) ? Math.floor(duration) : NaN;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_DURATION) {
        return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
      }
      // the row must belong to the demo or video the player claims
      const existing = await prisma.view.findUnique({
        where: { id: viewId },
        select: { id: true, demoId: true, exportedVideoId: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "View not found" }, { status: 404 });
      }
      if (
        (typeof demoId === "string" && demoId && existing.demoId !== demoId) ||
        (typeof exportedVideoId === "string" &&
          exportedVideoId &&
          existing.exportedVideoId !== exportedVideoId)
      ) {
        return NextResponse.json({ error: "View not found" }, { status: 404 });
      }
      // Update existing view with new duration
      const updatedView = await prisma.view.update({
        where: { id: viewId },
        data: { duration: seconds },
      });
      return NextResponse.json({ success: true, viewId: updatedView.id });
    }

    if (!demoId && !exportedVideoId) {
      return NextResponse.json({ error: "Missing demoId or exportedVideoId" }, { status: 400 });
    }

    if (await isRateLimited(`views:create:${ip}`, CREATE_LIMIT, WINDOW_SECONDS)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // only real demos and videos earn rows, so junk ids fail here
    // instead of blowing up on the foreign key below
    if (typeof demoId === "string" && demoId) {
      const demo = await prisma.demo.findUnique({
        where: { id: demoId },
        select: { id: true },
      });
      if (!demo) {
        return NextResponse.json({ error: "Demo not found" }, { status: 404 });
      }
    }
    if (typeof exportedVideoId === "string" && exportedVideoId) {
      const video = await prisma.exportedVideo.findUnique({
        where: { id: exportedVideoId },
        select: { id: true },
      });
      if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
    }

    // Check a simple cookie to prevent spamming views on refresh
    const cookieHeader = req.headers.get("cookie") || "";
    const hasViewedKey = `viewed_${exportedVideoId || demoId}`;
    if (cookieHeader.includes(hasViewedKey) && !viewId) {
      // Return success but don't record a new view (simple deduplication)
      // We'll still return a dummy viewId so the client can "update" it, but we won't actually hit the DB
      return NextResponse.json({ success: true, viewId: "deduped" });
    }

    // Create a new view
    const view = await prisma.view.create({
      data: {
        demoId: demoId || null,
        exportedVideoId: exportedVideoId || null,
        duration: 0,
      },
    });

    // Only ever the literal "qr" or nothing — never the caller's string, which
    // would put arbitrary input into a log line.
    if (readViewSource(source)) {
      console.log(
        `[Views] QR scan: view=${view.id} demo=${demoId || "-"} video=${exportedVideoId || "-"}`
      );
    }

    const response = NextResponse.json({ success: true, viewId: view.id });
    // Set a cookie that expires in 1 hour
    response.cookies.set(hasViewedKey, "1", { maxAge: 3600, path: "/" });

    return response;
  } catch (error) {
    console.error("Error handling view:", error);
    return NextResponse.json({ error: "Failed to process view" }, { status: 500 });
  }
}
