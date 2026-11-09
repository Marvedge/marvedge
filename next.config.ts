import type { NextConfig } from "next";

// DERIVED FROM THE ALLOW-LIST, NOT RETYPED. app/lib/overlays/schedulingHosts.ts
// is the one place that says which scheduling hosts may be framed; importing it
// here is what stops the CSP from refusing a host the sanitiser just started
// accepting — a mismatch that shows up as a blank rectangle inside a video with
// nothing in the server logs to explain it. That module is pure: no env, no DOM,
// no node builtins, so it is safe to pull into the config.
import { SCHEDULING_FRAME_SRC } from "./app/lib/overlays/schedulingHosts";

/**
 * THE APP'S FIRST CONTENT-SECURITY-POLICY, AND IT IS DELIBERATELY NOT GLOBAL.
 *
 * It applies to the public viewer routes ONLY. /video-editor and the signed-in
 * app run ffmpeg.wasm, inline workers and blob: script URLs, and a blanket policy
 * would break them on the first load — so this one is scoped to the two path
 * families below and nothing else in this file's `headers()` widens it.
 *
 * WHAT IT IS FOR: bounding what a share page may FRAME and LOAD, now that it
 * frames a third party's document at all. `frame-src` is the point of the
 * exercise — it is the third and last enforcement point on the scheduling
 * allow-list, after the PUT sanitiser and the render-time check, and it is the
 * only one a browser enforces on our behalf.
 *
 * WHAT IT IS NOT: XSS protection. `script-src` carries 'unsafe-inline' because
 * Next's App Router inlines its bootstrap and flight-data scripts, and removing
 * it needs a per-request nonce threaded through middleware — a bigger change
 * than this PR, and one that would apply to far more than the share page. Saying
 * so here rather than letting a future reader infer a guarantee that is not
 * there.
 *
 * `frame-ancestors` IS DELIBERATELY ABSENT. Customers embed share links in their
 * own pages today, and there is no allow-list of their domains anywhere in this
 * app; adding a restrictive one here would silently break existing embeds. That
 * is a separate decision with its own migration, not a free extra.
 *
 * IT IS NOT BEHIND OVERLAYS_ENABLED, AND THAT IS DELIBERATE — this was tried and
 * reverted. Next evaluates `headers()` at BUILD time and bakes the result into
 * routes-manifest.json; it is not re-read when the server boots. So a flag-gated
 * CSP is really a BUILD-time gate, and flipping OVERLAYS_ENABLED in a deployment
 * environment without a rebuild would turn the scheduling iframe on while leaving
 * the policy that bounds it silently absent. A header that is missing exactly
 * when it is needed is worse than one that is present a release early.
 *
 * Applying it unconditionally is safe in the other direction: every directive
 * below was checked against what the share page loads TODAY — next/font (self),
 * the QR's data:/blob: images, R2 media over https, the next-auth session fetch —
 * so a flag-off page behaves exactly as it does now. It changes a response
 * header, never the rendered markup the backward-compatibility criterion is
 * about.
 */
function viewerContentSecurityPolicy(): string {
  const frameSrc = ["'self'", ...SCHEDULING_FRAME_SRC].join(" ");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    // See the note above: Next inlines its own scripts, and 'unsafe-eval' is
    // what react-refresh needs in development. Neither provider needs a
    // script-src entry at all — both are embedded as a bare iframe URL, so the
    // share page still loads zero third-party scripts.
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
    // Tailwind and next/font both emit inline style attributes.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // next/font/google self-hosts at build time, so 'self' covers today's fonts;
    // the gstatic entry is headroom for a stylesheet-linked face.
    "font-src 'self' data: https://fonts.gstatic.com",
    // data: and blob: are load-bearing for the QR — app/lib/qr/mark.ts is a
    // base64 PNG and useShareQr draws it through an Image before toBlob().
    // https: covers the owner-supplied branch-card thumbnails, which can be on
    // any host by design.
    "img-src 'self' data: blob: https:",
    // Exports are served from R2 over https, and blob: is the HLS path in PR 8.
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    `frame-src ${frameSrc}`,
    // child-src alongside frame-src: older browsers only understand this one,
    // and a booking widget that silently fails to frame is the exact failure
    // this PR is supposed to make impossible.
    `child-src ${frameSrc}`,
  ];
  return directives.join("; ");
}

/**
 * Baseline headers that are safe across public pages, signed-in pages, APIs,
 * static assets, the FFmpeg editor, and customer-hosted share routes.
 *
 * CSP stays scoped to viewer routes because the editor requires workers and
 * blob URLs. Frame blocking stays absent because customers embed share links.
 */
export function buildGlobalSecurityHeaders(nodeEnv: string | undefined = process.env.NODE_ENV) {
  const headers = [
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(self), display-capture=(self), geolocation=()",
    },
  ];

  // HSTS is emitted only by production builds. Omitting includeSubDomains and
  // preload avoids imposing Marvedge's policy on customer-controlled subdomains.
  if (nodeEnv === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }

  return headers;
}

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ["@radix-ui/react-slider", "@headlessui/react"],
  },

  async headers() {
    const globalHeaders = buildGlobalSecurityHeaders();
    const editorHeaders = [
      {
        source: "/video-editor/(.*)", // Only apply these headers to pages that strictly need ffmpeg.wasm
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];

    const csp = viewerContentSecurityPolicy();
    return [
      {
        source: "/:path*",
        headers: globalHeaders,
      },
      ...editorHeaders,
      // BOTH PATHS, AND THAT IS THE CUSTOMER-DOMAIN CASE, NOT BELT AND BRACES.
      //
      // A viewer on a customer-owned host requests /share/<slug>; middleware.ts
      // rewrites it to /hub/<domainKey>/share/<slug> and the request is served
      // from there. Matching only one of the two spellings would leave the
      // branded route — the one where framing a third party matters MOST,
      // because the page carries the customer's name — without a policy. So both
      // are listed, and whichever spelling the header matcher sees, one applies.
      //
      // /api is excluded by construction: neither source matches it, and
      // middleware.ts skips /api anyway, so the player's own POSTs are untouched.
      {
        source: "/share/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
      {
        source: "/hub/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  webpack: (config, { isServer }) => {
    // Exclude server-only packages from client bundle
    if (!isServer) {
      config.externals = {
        ...config.externals,
        "fluent-ffmpeg": "fluent-ffmpeg",
        "ffmpeg-static": "ffmpeg-static",
      };
    } else {
      // For server, mark these as external to avoid module resolution issues
      config.externals = config.externals || [];
      config.externals.push("ffmpeg-static");
      // bullmq uses dynamic requires internally; externalize to avoid webpack "Critical dependency" warning.
      config.externals.push("bullmq");
    }
    return config;
  },
};

export default nextConfig;
