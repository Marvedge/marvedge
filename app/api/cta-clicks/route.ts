import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/options";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { applySessionCookie, readOrMintSessionId } from "@/app/lib/overlays/session";

// The mv_sid anonymous identity cookie this route introduced now lives in
// app/lib/overlays/session.ts, so /api/v3/events mints the SAME id with the same
// options rather than a second one that would split the funnel. Behaviour here is
// unchanged: read it, mint one only when absent, set the cookie only when minted.

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const { ctaId, demoId, label, referrer } = await req.json();

    if (!ctaId || !demoId || !label) {
      return NextResponse.json({ error: "ctaId, demoId and label are required" }, { status: 400 });
    }

    // clicks stay anonymous (public viewers), but stay capped per ip
    if (await isRateLimited(`cta-clicks:${clientIp(req)}`, 60, 60)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (typeof label !== "string" || label.length > 500) {
      return NextResponse.json({ error: "Invalid label" }, { status: 400 });
    }
    if (referrer !== undefined && (typeof referrer !== "string" || referrer.length > 2000)) {
      return NextResponse.json({ error: "Invalid referrer" }, { status: 400 });
    }

    // the click must belong to a real button on a real demo
    const cta = await prisma.cta.findUnique({
      where: { id: ctaId },
      select: { id: true, demoId: true },
    });
    if (!cta || cta.demoId !== demoId) {
      return NextResponse.json({ error: "CTA not found" }, { status: 404 });
    }

    // Read the anonymous session id; generate one if this browser doesn't have it yet.
    const viewer = readOrMintSessionId(req);

    // Logged-in viewers also get their userId stored alongside the anon session id.
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    await prisma.ctaClick.create({
      data: {
        ctaId,
        demoId,
        label,
        pageType: "demo",
        sessionId: viewer.sessionId,
        userId,
        referrer: referrer || req.headers.get("referer") || null,
      },
    });

    const response = NextResponse.json({ success: true });

    // Only sets the cookie when we generated a fresh id, so repeated calls reuse mv_sid.
    applySessionCookie(response, viewer);

    return response;
  } catch (error) {
    console.error("Error recording CTA click:", error);
    return NextResponse.json({ error: "Failed to record CTA click" }, { status: 500 });
  }
}
