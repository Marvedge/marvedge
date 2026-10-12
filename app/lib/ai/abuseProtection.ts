import { createHash } from "node:crypto";

import { isRateLimited } from "@/app/lib/audio/rateLimit";

export type AiAction = "script-rewrite" | "subtitle-translation";

interface AiRateLimit {
  limit: number;
  windowSeconds: number;
}

const AI_RATE_LIMITS: Record<AiAction, AiRateLimit> = {
  "script-rewrite": {
    limit: 20,
    windowSeconds: 15 * 60,
  },
  "subtitle-translation": {
    limit: 6,
    windowSeconds: 60 * 60,
  },
};

const TRANSLATION_REPEAT_WINDOW_SECONDS = 5 * 60;

export const MAX_SCRIPT_REQUEST_BYTES = 128 * 1024;
export const MAX_SCRIPT_LINES = 200;
export const MAX_SCRIPT_CHARACTERS = 20_000;

export const MAX_TRANSLATION_CUES = 1_000;
export const MAX_TRANSLATION_CHARACTERS = 100_000;

function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function exceedsTextLimits(
  texts: readonly string[],
  maxItems: number,
  maxCharacters: number
): boolean {
  if (texts.length > maxItems) {
    return true;
  }

  let characters = 0;

  for (const text of texts) {
    characters += text.length;

    if (characters > maxCharacters) {
      return true;
    }
  }

  return false;
}

export async function isAiActionRateLimited(userId: string, action: AiAction): Promise<boolean> {
  const config = AI_RATE_LIMITS[action];
  const userKey = hashKeyPart(userId);

  return isRateLimited(
    `ai:rate-limit:${action}:${userKey}`,
    config.limit,
    config.windowSeconds,
    true
  );
}

export async function isRepeatedSubtitleTranslation(
  userId: string,
  demoId: string,
  targetLanguage: string
): Promise<boolean> {
  const requestKey = hashKeyPart(`${userId}:${demoId}:${targetLanguage}`);

  return isRateLimited(
    `ai:dedupe:subtitle-translation:${requestKey}`,
    1,
    TRANSLATION_REPEAT_WINDOW_SECONDS,
    true
  );
}
