/**
 * Exact-name cookie lookup for a raw `Cookie` header.
 *
 * Substring matching on the header lets `not_viewed_x` or `viewed_x_extra`
 * satisfy a `viewed_x` check, so segments are split into name/value pairs and
 * only the exact name matches.
 */
export function hasCookie(cookieHeader: string | null | undefined, name: string): boolean {
  if (!cookieHeader || !name) {
    return false;
  }

  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (segment.slice(0, separator).trim() === name) {
      return true;
    }
  }

  return false;
}
