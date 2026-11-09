// GET /api/v3/media/[demoId] — the signed media URL for a gated demo.
//
// PUBLIC AND UNAUTHENTICATED, like the rest of /api/v3: it is called by the
// player on a page that may be served from a customer's own domain.
// middleware.ts rewrites a non-apex host to /hub/<domainKey>/… but skips
// everything under /api, so a player on demos.acme.com fetches this same-origin
// and lands here with the same mv_sid cookie scope.
//
// ============================================================================
// THIS IS THE ENFORCEMENT THE HARD GATE HAS BEEN MISSING
// ============================================================================
// PR 3 shipped the hard gate honestly: the media URL was in the page source and
// the object was publicly readable, so the gate held the UI and nothing else.
// With OVERLAYS_SIGNED_MEDIA_ENABLED on, a hard-gated demo's share page renders
// NO media URL at all and the player has to ask here — and here answers 403
// until a Lead row exists for the caller's mv_sid.
//
// WHAT IT STILL IS NOT. mv_sid is forgeable (it is a non-httpOnly analytics
// cookie and nothing may authorise on it — see app/lib/overlays/session.ts), but
// forging it does not help: the check is for a Lead ROW keyed on that id, and
// producing one means actually submitting the form. What a determined viewer
// still gets is a real URL, valid for the TTL, which they can pass on. This is a
// gate on "watched without giving us anything", not DRM, and PR 8's description
// says so.
//
// ============================================================================
// WHY THIS SIGNS THE MP4 AND NOT THE PLAYLIST
// ============================================================================
// A presigned URL signs ONE object. An HLS master playlist references variant
// playlists which reference segments, all by relative URI, and none of those
// references carry a signature — so a signed playlist on a private bucket plays
// exactly nothing. Making it work means rewriting every playlist per request
// with presigned segment URLs, which is a media proxy, not a presigner, and is
// out of scope here (as are DRM and per-segment encryption). So a hard-gated
// demo with signed media on is served its progressive MP4, signed. It loses
// adaptive bitrate and keeps its gate; the alternative loses the gate.

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { getClientIp } from "@/app/lib/http/clientIp";
import { isOverlaysAllowed } from "@/app/lib/overlays/access";
import { overlayConfigFromRow } from "@/app/lib/overlays/config";
import {
  isOverlaysEnabled,
  isSignedMediaEnabled,
  signedMediaTtlSeconds,
} from "@/app/lib/overlays/flags";
import { isMediaGated } from "@/app/lib/overlays/mediaAccess";
import { SID_COOKIE } from "@/app/lib/overlays/session";
import { parseR2Uri, signReadUrl, toHttpsUrl } from "@/app/lib/r2";

// isRateLimited() talks to Redis over ioredis, a node TCP client that cannot run
// on the edge. Pinned so this route being silently edge-compiled — which would
// fail the limiter open on every request — is a build error, not a discovery.
export const runtime = "nodejs";

/**
 * Requests per minute per IP+demo. Higher than the lead endpoint's 5 because a
 * player legitimately re-asks: a viewer who leaves the tab open past the TTL and
 * comes back needs a fresh URL, and a reload is another call.
 */
const MEDIA_RATE_LIMIT = 30;
const MEDIA_RATE_WINDOW_SECONDS = 60;

/** One 404 for every kind of miss, so the endpoint cannot be probed. */
function notFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

/**
 * The gated answer. 403 AND NOT 404, deliberately, and the distinction is in the
 * PR's acceptance criteria: the demo exists and the caller may ask about it,
 * they simply have not earned the media yet. A 404 would send the player's error
 * handling down the "this demo is gone" path and show the wrong message; hanging
 * — the third wrong answer — would leave a spinner forever.
 */
function forbidden(): NextResponse {
  return NextResponse.json({ ok: false, error: "lead_required" }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ demoId: string }> }) {
  if (!isOverlaysEnabled() || !isSignedMediaEnabled()) {
    return notFound();
  }

  const { demoId } = await params;
  if (!demoId) {
    return notFound();
  }

  if (
    await isRateLimited(
      `ovl:media:${getClientIp(req.headers)}:${demoId}`,
      MEDIA_RATE_LIMIT,
      MEDIA_RATE_WINDOW_SECONDS
    )
  ) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const demo = await prisma.demo.findUnique({
    where: { id: demoId },
    select: {
      isPublic: true,
      videoUrl: true,
      exportedUrl: true,
      overlayConfig: true,
      user: { select: { plan: true } },
    },
  });

  // Not found and not public collapse into the same answer: whether a private
  // demo exists is not something an unauthenticated caller gets to learn.
  if (!demo || !demo.isPublic) {
    return notFound();
  }

  const config = overlayConfigFromRow(demo.overlayConfig);
  // Re-resolved server-side from User.plan on every request, never trusted from
  // the stored row — the same rule resolveShareOverlays() and POST /api/v3/leads
  // follow. An owner who enabled a gate on PRO and then downgraded has a gate
  // that no longer applies, and must not have their demo become unplayable.
  const gated = isMediaGated({
    signedMediaEnabled: true,
    config,
    planAllowed: isOverlaysAllowed(demo.user?.plan),
  });

  if (gated) {
    // The Lead row is the proof, not the cookie: mv_sid is forgeable, but a row
    // keyed on it only exists because somebody submitted the form.
    const sessionId = req.cookies.get(SID_COOKIE)?.value;
    if (!sessionId) {
      return forbidden();
    }
    const lead = await prisma.lead.findFirst({
      where: { demoId, sessionId },
      select: { id: true },
    });
    if (!lead) {
      return forbidden();
    }
  }

  const mediaUri = demo.exportedUrl || demo.videoUrl;
  if (!mediaUri) {
    return notFound();
  }

  const ttl = signedMediaTtlSeconds();
  const parsed = parseR2Uri(mediaUri);

  // LEGACY gs:// PASSTHROUGH. A demo whose media predates the R2 migration lives
  // in a bucket that was already made public and that we hold no signing
  // credentials for. It keeps playing — gated or not — via its public https URL,
  // because breaking those demos to enforce a gate that was never enforceable on
  // them would be a regression dressed as a security fix. Documented in the
  // README as the one case signed media does not cover.
  if (!parsed || mediaUri.startsWith("gs://")) {
    return NextResponse.json(
      { ok: true, url: toHttpsUrl(mediaUri), signed: false, expiresIn: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const url = await signReadUrl({
      bucket: parsed.bucket,
      object: parsed.object,
      expiresIn: ttl,
    });
    return NextResponse.json(
      { ok: true, url, signed: true, expiresIn: ttl },
      // NEVER CACHED, at any layer. This response is per-viewer and expires;
      // a shared cache would hand one viewer's signed URL to the next caller
      // and would keep serving it after it stopped working.
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch {
    // Signing failed — most likely R2 credentials missing in this environment.
    // A gated demo must not fall back to the unsigned URL: that would silently
    // turn the flag off for the one demo it matters most on.
    console.error(`[ovl-media] signing failed for demo ${demoId}`);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
