import { promises as dns } from "node:dns";

import { isPrivateHost } from "../safeUrl";

// Re-resolve the host right before delivery and bail if it now points somewhere
// internal. Resolution failure is a BLOCK, not a pass: a hostname whose DNS we
// cannot read is exactly the case where an attacker may be racing the resolver,
// and dropping one webhook is preferable to sending it into the internal
// network. The same applies when the resolver returns no addresses at all.
export async function deliveryHostIsPublic(rawUrl: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return false;
  }
  if (isPrivateHost(hostname)) {
    return false;
  }

  // lookup() resolves A and AAAA in one call and throws when resolution fails,
  // so there is no "one family errored, treat it as empty" gap. Both IP
  // literals and DNS names are handled; strip IPv6 brackets for the lookup.
  const lookupHost = hostname.replace(/^\[|\]$/g, "");
  let answers: Array<{ address: string }>;
  try {
    answers = await dns.lookup(lookupHost, { all: true, verbatim: true });
  } catch (error) {
    console.warn(
      "[crm] dns check failed, blocking delivery:",
      error instanceof Error ? error.message : error
    );
    return false;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    return false;
  }
  return !answers.some((answer) => isPrivateHost(answer.address));
}
