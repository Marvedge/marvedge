/**
 * Resolve the client IP used for rate-limit keys.
 *
 * Trusted-proxy model: the platform proxy appends the real peer address to the
 * RIGHT of `x-forwarded-for`. A client can prepend entries, so only the
 * rightmost non-empty value is trusted. `x-real-ip` is the fallback when the
 * forwarded header is absent or has no non-empty entries.
 */

export interface ClientIpHeaders {
  get(name: string): string | null | undefined;
}

const MAX_IP_LENGTH = 64;

// Whitespace or control characters in a selected value mean it is not an
// address we can safely put in a Redis key.
const INVALID_IP_PATTERN = /[\s\u0000-\u001f\u007f]/;

function isValidIp(value: string): boolean {
  return value.length <= MAX_IP_LENGTH && !INVALID_IP_PATTERN.test(value);
}

export function getClientIp(headers: ClientIpHeaders): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const entries = forwarded.split(",");

    for (let i = entries.length - 1; i >= 0; i--) {
      const candidate = entries[i].trim();
      if (candidate) {
        return isValidIp(candidate) ? candidate : "unknown";
      }
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();

  if (realIp) {
    return isValidIp(realIp) ? realIp : "unknown";
  }

  return "unknown";
}
