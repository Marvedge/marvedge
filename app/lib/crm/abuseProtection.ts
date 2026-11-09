import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";

export type CrmAction = "connection-test" | "retry-failed-deliveries";

interface CrmActionLimit {
  limit: number;
  windowSeconds: number;
}

const CRM_ACTION_LIMITS: Record<CrmAction, CrmActionLimit> = {
  "connection-test": {
    limit: 10,
    windowSeconds: 15 * 60,
  },
  "retry-failed-deliveries": {
    limit: 5,
    windowSeconds: 15 * 60,
  },
};

function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function crmActionRateLimitKey(userId: string, action: CrmAction): string {
  return `crm:rate-limit:${action}:${hashUserId(userId)}`;
}

export async function isCrmActionRateLimited(userId: string, action: CrmAction): Promise<boolean> {
  const config = CRM_ACTION_LIMITS[action];

  return isRateLimited(
    crmActionRateLimitKey(userId, action),
    config.limit,
    config.windowSeconds,
    true
  );
}
