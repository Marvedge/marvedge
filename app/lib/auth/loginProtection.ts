import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_IP_LIMIT = 50;

export type LoginRequestHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getClientIp(headers: LoginRequestHeaders): string {
  const forwardedFor = firstHeaderValue(headers["x-forwarded-for"]).split(",")[0]?.trim();

  const realIp = firstHeaderValue(headers["x-real-ip"]).trim();

  return forwardedFor || realIp || "unknown";
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function isLoginRateLimited(
  email: string,
  headers: LoginRequestHeaders
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const clientIp = getClientIp(headers);

  const emailKey = `auth:login:email:${hashIdentifier(normalizedEmail)}`;
  const ipKey = `auth:login:ip:${hashIdentifier(clientIp)}`;

  const [emailLimited, ipLimited] = await Promise.all([
    isRateLimited(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_SECONDS, true),
    isRateLimited(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_SECONDS, true),
  ]);

  return emailLimited || ipLimited;
}
