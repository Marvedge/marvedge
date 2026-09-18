import { promises as dns } from "node:dns";

import { isPrivateHost } from "../safeUrl";

// Re-resolve the host right before delivery and bail if it now
// points somewhere internal. DNS itself failing just logs and
// lets the send go ahead, since failing closed here would
// silently drop every webhook on flaky networks.
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
  let answers: string[];
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);
    answers = [...v4, ...v6];
  } catch {
    console.warn("[crm] dns check unavailable, proceeding with delivery");
    return true;
  }
  if (answers.length === 0) {
    return true;
  }
  return !answers.some((ip) => isPrivateHost(ip));
}
