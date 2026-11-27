// Server-side fetch target check. isSafeUrl only inspects the literal host;
// a name that resolves to a public IP when saved can point at an internal one
// by the time the server fetches it. Resolve again immediately before the
// request and fail closed if the answer changed.
//
// dns.promises.lookup() is used with { all: true, verbatim: true } so both
// address families are returned and a single failed family cannot hide a
// private answer.
import { promises as dns } from "node:dns";

import { isPrivateHost } from "../safeUrl";

export class UnsafeFetchTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeFetchTargetError";
  }
}

/** Throws unless the URL is an http(s) target that resolves only to public hosts. */
export async function assertFetchTargetIsPublic(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeFetchTargetError("Invalid fetch target URL");
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new UnsafeFetchTargetError("Fetch target must use http or https");
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new UnsafeFetchTargetError("Fetch target host is private");
  }

  let answers: Array<{ address: string }>;
  try {
    // IP literals resolve to themselves; strip IPv6 brackets for the lookup.
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    answers = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeFetchTargetError("Fetch target DNS lookup failed");
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new UnsafeFetchTargetError("Fetch target has no DNS answers");
  }
  if (answers.some((answer) => isPrivateHost(answer.address))) {
    throw new UnsafeFetchTargetError("Fetch target resolves to a private address");
  }
}
