/** Shared redirect target validation for sign-in flows. */
export const SIGN_IN_FALLBACK_URL = "/dashboard";

/**
 * Accept only same-origin destinations: a relative path with exactly one
 * leading slash, or an absolute URL whose origin matches `baseUrl`.
 *
 * Protocol-relative URLs, backslash variants, control characters and any
 * other origin fall back to the dashboard. The same helper runs in the client
 * sign-in flow and in NextAuth's redirect callback so the two cannot disagree.
 */
export function getSafeCallbackUrl(raw: string | null | undefined, baseUrl?: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return SIGN_IN_FALLBACK_URL;
  }

  const value = raw.trim();
  if (!value || value.includes("\\") || /[\s\x00-\x1f\x7f]/.test(value)) {
    return SIGN_IN_FALLBACK_URL;
  }

  if (value.startsWith("/")) {
    return value.startsWith("//") ? SIGN_IN_FALLBACK_URL : value;
  }

  if (baseUrl) {
    try {
      const target = new URL(value);
      const base = new URL(baseUrl);
      if (target.origin === base.origin) {
        const path = `${target.pathname}${target.search}${target.hash}`;
        return path || SIGN_IN_FALLBACK_URL;
      }
    } catch {
      return SIGN_IN_FALLBACK_URL;
    }
  }

  return SIGN_IN_FALLBACK_URL;
}
