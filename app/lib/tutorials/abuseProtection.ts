import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { getClientIp } from "@/app/lib/http/clientIp";

export interface TutorialRequestHeaders {
  get(name: string): string | null;
}

const WINDOW_SECONDS = 60;
const ACCOUNT_LIMIT = 10;
const IP_LIMIT = 20;

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function tutorialRateLimitKeys(accountIdentifier: string, headers: TutorialRequestHeaders) {
  return {
    accountKey: "tutorials:account:" + hashIdentifier(accountIdentifier.trim().toLowerCase()),
    ipKey: "tutorials:ip:" + hashIdentifier(getClientIp(headers)),
  };
}

export async function isTutorialUploadRateLimited(
  accountIdentifier: string,
  headers: TutorialRequestHeaders
): Promise<boolean> {
  const { accountKey, ipKey } = tutorialRateLimitKeys(accountIdentifier, headers);

  const [accountLimited, ipLimited] = await Promise.all([
    isRateLimited(accountKey, ACCOUNT_LIMIT, WINDOW_SECONDS, true),
    isRateLimited(ipKey, IP_LIMIT, WINDOW_SECONDS, true),
  ]);

  return accountLimited || ipLimited;
}
