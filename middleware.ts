import { NextRequest, NextResponse, NextFetchEvent } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({
  pages: {
    signIn: "/auth/signin",
  },
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const hostname = req.headers.get("host") || "";
  const url = req.nextUrl.clone();

  // 1. Exclude system paths and APIs
  // API routes skip middleware auth, each route checks auth itself.
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.includes(".")
  ) {
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

    // Redirect dashboard or auth pages back to the main domain
    if (url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/auth")) {
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      const targetDomain = hostname.endsWith(`.${devDomain}`) ? devDomain : rootDomain;
      return NextResponse.redirect(`${protocol}://${targetDomain}${url.pathname}${url.search}`);
    }

    // Rewrite path to /hub/[domainKey]/...
    url.pathname = `/hub/${domainKey}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // 3. Main domain auth checks
  // Protected pages: /dashboard, /demos, /settings. Keep list narrow so public pages stay open.
  if (
    url.pathname.startsWith("/dashboard") ||
    url.pathname.startsWith("/demos") ||
    url.pathname.startsWith("/settings")
  ) {
    return (authMiddleware as (req: NextRequest, event: NextFetchEvent) => unknown)(req, event);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|images|solid|gradient|background-default-images).*)",
  ],
};
