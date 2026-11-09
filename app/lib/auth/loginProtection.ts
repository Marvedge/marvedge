import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";
import { getClientIp } from "@/app/lib/http/clientIp";

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_IP_LIMIT = 50;

export type LoginRequestHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function isLoginRateLimited(
  email: string,
  headers: LoginRequestHeaders
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = getClientIp({
    get: (name) => firstHeaderValue(headers[name]),
  });

  const emailKey = `auth:login:email:${hashIdentifier(normalizedEmail)}`;
  const ipKey = `auth:login:ip:${hashIdentifier(clientIp)}`;

  const [emailLimited, ipLimited] = await Promise.all([
    isRateLimited(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_SECONDS, true),
    isRateLimited(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS, true),
  ]);

  return emailLimited || ipLimited;
}
