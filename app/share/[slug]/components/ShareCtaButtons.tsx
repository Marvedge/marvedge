"use client";

import { postBeacon } from "@/app/lib/overlays/beacon";

export type ShareCta = {
  id: string;
  label: string;
  url: string;
  order: number;
};

/**
 * Fire the click, then let the navigation happen.
 *
 * The sendBeacon-then-keepalive-fetch dance this used to spell out inline now
 * lives in app/lib/overlays/beacon.ts, because the player's telemetry needs the
 * identical thing and two copies of it would drift. Same endpoint, same payload,
 * same transports, same order — this is an extraction, not a change.
 */
function fireCtaClick(cta: ShareCta, demoId: string) {
  postBeacon(
    "/api/cta-clicks",
    JSON.stringify({
      ctaId: cta.id,
      demoId,
      label: cta.label,
      referrer: document.referrer,
    })
  );
}

// FIX: block javascript/data urls at render
function sanitizeHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return url;
    }
  } catch {
    // fall through to safe fallback
  }
  return "#";
}

export default function ShareCtaButtons({ ctas, demoId }: { ctas: ShareCta[]; demoId?: string }) {
  if (!ctas.length || !demoId) {
    return null;
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {ctas.map((cta) => (
        <a
          key={cta.id}
          href={sanitizeHref(cta.url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => fireCtaClick(cta, demoId)}
          className="rounded-full bg-[#2A1D5C] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(42,29,92,0.28)] transition hover:bg-[#3A2A78]"
        >
          {cta.label}
        </a>
      ))}
    </div>
  );
}
