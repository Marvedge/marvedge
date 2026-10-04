import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

// Every route under app/(signed) requires a session. Keep this list in sync
// with that directory so client-only pages (editor, recorder, team, ...) are
// not left open when they have no server-side getServerSession check.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/demos",
  "/templates",
  "/exported-videos",
  "/payment-gateway",
  "/editor",
  "/recorder",
  "/team",
  "/settings",
  "/analytics",
  "/leads",
  "/view",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      // Dotted variants (e.g. /dashboard.evil) must NOT bypass auth.
      pathname.startsWith(`${prefix}.`)
  );
}

// Real static assets only (e.g. /favicon.ico, /logo.png). The previous
// `pathname.includes(".")` check let /dashboard.evil or /editor/foo.bar skip
// auth entirely. Extension allow-list + protected-first ordering closes that.
const STATIC_ASSET_EXTENSIONS = new Set([
  "css",
  "js",
  "mjs",
  "map",
  "ico",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "bmp",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "mp4",
  "webm",
  "ogg",
  "mp3",
  "wav",
  "pdf",
  "txt",
  "xml",
  "json",
  "webmanifest",
]);

function isStaticAsset(pathname: string): boolean {
  const lastSlash = pathname.lastIndexOf("/");
  const lastSegment = pathname.slice(lastSlash + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0 || dot === lastSegment.length - 1) {
    return false;
  }
  const ext = lastSegment.slice(dot + 1).toLowerCase();
  return STATIC_ASSET_EXTENSIONS.has(ext);
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const hostname = req.headers.get("host") || "";
  const url = req.nextUrl.clone();

  // 1. Exclude system paths and APIs
  // API routes skip middleware auth, each route checks auth itself.
  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 1b. Protected routes always require auth — even if the URL contains a
  // dot (e.g. /dashboard.evil must NOT bypass). Checked before static files.
  const isProtected = isProtectedPath(url.pathname);

  // Static assets (public files) stay open. Protected dotted paths above have
  // already been claimed, so this only matches real files on public routes.
  if (!isProtected && isStaticAsset(url.pathname)) {
    return NextResponse.next();
  }

  // 2. Subdomain & Custom domain routing
  // The apex domain the app itself is served from. Anything that is not this
  // domain (or a dev/preview host) is treated as a customer hub.
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "marvedge.com";
  const devDomain = "localhost:3000";

  const isMainDomain =
    hostname === rootDomain ||
    hostname === `www.${rootDomain}` ||
    hostname === devDomain ||
    hostname.endsWith(".vercel.app"); // production + preview deployments
  const isSubdomain =
    !isMainDomain && (hostname.endsWith(`.${rootDomain}`) || hostname.endsWith(`.${devDomain}`));

  if (!isMainDomain) {
    const domainKey = isSubdomain ? hostname.split(".")[0] : hostname.split(":")[0];
    console.log(
      `[Middleware] Subdomain/custom domain detected: "${hostname}" (Key: "${domainKey}"). Rewriting path to /hub/${domainKey}${url.pathname}`
    );

    // Redirect signed + auth pages back to the main domain so they are never
    // served (or rewritten to /hub) on a customer domain.
    if (isProtectedPath(url.pathname) || url.pathname.startsWith("/auth")) {
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      const targetDomain = hostname.endsWith(`.${devDomain}`) ? devDomain : rootDomain;
      return NextResponse.redirect(`${protocol}://${targetDomain}${url.pathname}${url.search}`);
    }

    // Rewrite path to /hub/[domainKey]/...
    url.pathname = `/hub/${domainKey}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // 3. Main domain auth checks
  // Every app/(signed) route requires login. Public pages (/, /pricing,
  // /preview, /contact-us, /auth/*, /share/*, /hub/*, /reviews) stay open.
  if (isProtected) {
    return (authMiddleware as (req: NextRequest, event: NextFetchEvent) => unknown)(req, event);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|images|solid|gradient|background-default-images).*)",
  ],
};
