export const DEFAULT_DUBBING_QUEUE_NAME = "dubbing-processing";
export const DEFAULT_REFRAME_QUEUE_NAME = "reframe-processing";

/**
 * Returns true only when staging is explicitly identified via `APP_ENV=staging`.
 * Does not infer staging from `NODE_ENV !== "production"`.
 */
export function isStagingEnvironment(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.APP_ENV?.trim().toLowerCase() === "staging";
}

function resolveQueueName(
  envVarName: string,
  defaultQueueName: string,
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env[envVarName]?.trim();

  if (isStagingEnvironment(env)) {
    if (!configured) {
      throw new Error(
        `Missing required staging setting: ${envVarName} must be set to a non-empty isolated queue name when APP_ENV=staging.`
      );
    }
    if (configured === defaultQueueName) {
      throw new Error(
        `Invalid staging setting: ${envVarName} must not use production default "${defaultQueueName}" when APP_ENV=staging.`
      );
    }
    return configured;
  }

  return configured || defaultQueueName;
}

/**
 * Resolves and validates the BullMQ dubbing queue name from environment configuration.
 *
 * Producer (`app/lib/queue.ts`) and consumer (`video-worker/index.ts`) share this
 * helper so both sides resolve the exact same queue name.
 */
export function resolveDubbingQueueName(
  env: Record<string, string | undefined> = process.env
): string {
  return resolveQueueName("DUBBING_QUEUE_NAME", DEFAULT_DUBBING_QUEUE_NAME, env);
}

/**
 * Resolves and validates the BullMQ reframe queue name from environment configuration.
 *
 * Producer (`app/lib/queue.ts`) and consumer (`reframe-worker/config.ts`) share this
 * helper so both sides resolve the exact same queue name.
 */
export function resolveReframeQueueName(
  env: Record<string, string | undefined> = process.env
): string {
  return resolveQueueName("REFRAME_QUEUE_NAME", DEFAULT_REFRAME_QUEUE_NAME, env);
}
