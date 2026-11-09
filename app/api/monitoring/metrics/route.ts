import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { dubbingQueue, reframeQueue } from "../../../lib/queue";
import { collectQueueMetrics } from "../../../lib/monitoring/queueMetrics";
import { metricsRegistry } from "../../../lib/monitoring/metrics";
import { rollupSecret } from "../../../lib/overlays/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the shared secret travels. A header, never a query param — mirrors
 * app/api/v3/events/rollup/route.ts, which guards the same maintenance
 * audience with the same secret.
 */
const SECRET_HEADER = "x-marvedge-rollup-secret";

/**
 * Constant-time secret comparison, mirroring the rollup route. Length-checked
 * first because timingSafeEqual throws on a length mismatch.
 */
function secretMatches(expected: string, provided: string | null): boolean {
  if (typeof provided !== "string") {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<Response> {
  const secret = rollupSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Metrics endpoint is not configured (OVERLAYS_ROLLUP_SECRET)." },
      { status: 503 }
    );
  }

  if (!secretMatches(secret, request.headers.get(SECRET_HEADER))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await collectQueueMetrics({
      reframe: reframeQueue,
      dubbing: dubbingQueue,
    });
  } catch (error) {
    console.error("[monitoring] Queue metrics collection failed:", error);
  }

  try {
    const body = await metricsRegistry.metrics();
    return new Response(body, {
      headers: {
        "Content-Type": metricsRegistry.contentType,
      },
    });
  } catch (error) {
    console.error("[monitoring] Metrics serialization failed:", error);
    return new Response("Unable to serialize metrics", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
