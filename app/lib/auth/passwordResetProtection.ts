import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";

export type PasswordResetAction = "request-link" | "reset-attempt";

export interface PasswordResetRequestHeaders {
  get(name: string): string | null;
}

const WINDOW_SECONDS = 15 * 60;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIp(headers: PasswordResetRequestHeaders): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const realIp = headers.get("x-real-ip")?.trim();

  return forwarded || realIp || "unknown";
}

export function passwordResetRateLimitKeys(
  email: string,
  headers: PasswordResetRequestHeaders,
  action: PasswordResetAction
) {
  const normalizedEmail = email.trim().toLowerCase();

  return {
    emailKey: `auth:password-reset:${action}:email:` + hashIdentifier(normalizedEmail),
    ipKey: `auth:password-reset:${action}:ip:` + hashIdentifier(clientIp(headers)),
  };
}

export async function isPasswordResetRateLimited(
  email: string,
  headers: PasswordResetRequestHeaders,
  action: PasswordResetAction
): Promise<boolean> {
  const { emailKey, ipKey } = passwordResetRateLimitKeys(email, headers, action);

  const [emailLimited, ipLimited] = await Promise.all([
    isRateLimited(emailKey, EMAIL_LIMIT, WINDOW_SECONDS, true),
    isRateLimited(ipKey, IP_LIMIT, WINDOW_SECONDS, true),
  ]);

  return emailLimited || ipLimited;
}
