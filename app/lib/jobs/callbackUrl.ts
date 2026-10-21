// Standardized callback base-URL resolution for workers (Task-00094).
//
// Ensures reframe-worker and AVS dubbing use the identical resolution cascade,
// preserving full backward compatibility with existing environment variables while
// preventing accidental localhost/loopback callbacks in production environments.
//
// ZERO Prisma / Postgres imports.

export interface ResolveCallbackUrlOptions {
  env?: Record<string, string | undefined>;
  explicitUrl?: string;
  isProduction?: boolean;
  allowLocalhostInProduction?: boolean;
}

/**
 * Detects whether a URL points to a loopback/localhost host.
 */
export function isLoopbackHost(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") {
    return false;
  }
  try {
    const trimmed = urlStr.trim();
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const withProto = hasScheme ? trimmed : `http://${trimmed}`;
    const parsed = new URL(withProto);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Builds the canonical callback URL for POST /api/jobs/callback.
 */
export function buildCallbackUrl(backendUrl: string): string {
  const normalized = (backendUrl || "").trim().replace(/\/+$/, "");
  return `${normalized}/api/jobs/callback`;
}

/**
 * Standardizes callback base-URL resolution across reframe-worker and dubbing processor.
 *
 * Precedence cascade:
 * 1. explicitUrl parameter (if passed by caller)
 * 2. INTERNAL_API_URL (common in VPC / container environments)
 * 3. BACKEND_URL (reframe-worker standard)
 * 4. APP_URL (AVS dubbing processor standard)
 * 5. NEXTAUTH_URL (NextAuth / web app standard)
 * 6. NEXT_PUBLIC_APP_URL (public frontend standard)
 * 7. Default: http://localhost:3000 (ONLY in non-production environments)
 *
 * In production:
 * - Throws if no URL is provided.
 * - Throws if the resolved URL points to localhost or loopback (unless explicitly allowed).
 * - Throws if the URL uses an invalid protocol (non-http/https) or is malformed.
 */
export function resolveCallbackBaseUrl(options: ResolveCallbackUrlOptions = {}): string {
  const env = options.env ?? process.env;
  const isProduction = options.isProduction ?? env.NODE_ENV === "production";

  const candidate =
    options.explicitUrl?.trim() ||
    env.INTERNAL_API_URL?.trim() ||
    env.BACKEND_URL?.trim() ||
    env.APP_URL?.trim() ||
    env.NEXTAUTH_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim();

  if (!candidate) {
    if (isProduction) {
      throw new Error(
        "Callback base URL is not configured. In production, set BACKEND_URL, APP_URL, or NEXTAUTH_URL to a valid non-loopback URL."
      );
    }
    return "http://localhost:3000";
  }

  const normalized = candidate.replace(/\/+$/, "");

  // URL protocol and hostname validation
  let parsed: URL;
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized);
    const withProto = hasScheme ? normalized : `http://${normalized}`;
    parsed = new URL(withProto);
    if (!parsed.hostname) {
      throw new Error("Hostname is empty");
    }
  } catch (err) {
    throw new Error(
      `Invalid callback URL format: "${candidate}". ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (isProduction) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `Invalid protocol in production callback URL: "${parsed.protocol}". Must use http:// or https://.`
      );
    }

    const allowLocalhost =
      options.allowLocalhostInProduction ?? env.ALLOW_LOCALHOST_CALLBACK_IN_PRODUCTION === "true";

    if (!allowLocalhost && isLoopbackHost(normalized)) {
      throw new Error(
        `Accidental localhost callback target detected in production: "${normalized}". Configure a production backend URL (e.g. BACKEND_URL or APP_URL).`
      );
    }
  }

  return normalized;
}
