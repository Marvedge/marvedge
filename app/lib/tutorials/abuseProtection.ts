import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";

export interface TutorialRequestHeaders {
  get(name: string): string | null;
}

const WINDOW_SECONDS = 60;
const ACCOUNT_LIMIT = 10;
const IP_LIMIT = 20;

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(headers: TutorialRequestHeaders): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const realIp = headers.get("x-real-ip")?.trim();

  return forwarded || realIp || "unknown";
}

export function tutorialRateLimitKeys(accountIdentifier: string, headers: TutorialRequestHeaders) {
  return {
    accountKey: "tutorials:account:" + hashIdentifier(accountIdentifier.trim().toLowerCase()),
    ipKey: "tutorials:ip:" + hashIdentifier(clientIp(headers)),
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
