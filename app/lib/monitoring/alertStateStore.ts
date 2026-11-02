import type Redis from "ioredis";
import type { AlertName } from "./alerts";

export interface PersistedAlertState {
  firing: boolean;
  lastFiringAt: number;
  lastResolvedAt: number;
  lastNotificationAt: number;
  observedValue?: number;
  threshold?: number;
  pipeline?: string;
}

export type AlertTransitionAction = "EMIT_FIRING" | "EMIT_RESOLVED" | "SUPPRESSED" | "NOOP";

export interface AlertTransitionResult {
  action: AlertTransitionAction;
  state: PersistedAlertState;
}

export interface AlertStateStore {
  transition(
    name: AlertName,
    isFiring: boolean,
    now: number,
    cooldownMs: number,
    metadata?: { observedValue?: number; threshold?: number; pipeline?: string }
  ): Promise<AlertTransitionResult>;
  getState(name: AlertName): Promise<PersistedAlertState | undefined>;
  clear(name?: AlertName): Promise<void>;
  resetFiringCooldown(name: AlertName): Promise<void>;
}

export const DEFAULT_ALERT_STATE_TTL_SECONDS = 7 * 24 * 3600; // 7 days

export function getAlertStateKey(name: AlertName): string {
  return `marvedge:monitoring:alert:v1:state:${name}`;
}

/**
 * Atomic Lua script to transition alert state safely across concurrent evaluators and process restarts.
 *
 * KEYS[1]: alert state key (marvedge:monitoring:alert:v1:state:${name})
 * ARGV[1]: isFiring ("1" or "0")
 * ARGV[2]: now timestamp (ms string)
 * ARGV[3]: cooldownMs (ms string)
 * ARGV[4]: ttlSeconds (seconds string)
 * ARGV[5]: observedValue string
 * ARGV[6]: threshold string
 * ARGV[7]: pipeline string
 *
 * Returns: action string ("EMIT_FIRING", "EMIT_RESOLVED", "SUPPRESSED", "NOOP")
 */
export const transitionLuaScript = `
local key = KEYS[1]
local isFiring = ARGV[1]
local now = tonumber(ARGV[2])
local cooldownMs = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local observedVal = ARGV[5]
local thresholdVal = ARGV[6]
local pipelineVal = ARGV[7]

local currentFiring = redis.call("HGET", key, "firing")
local lastFiringAt = tonumber(redis.call("HGET", key, "lastFiringAt") or "0")
local isCurrentlyFiring = (currentFiring == "1")

if isFiring == "1" then
  local mayEmit = (lastFiringAt == 0) or ((now - lastFiringAt) >= cooldownMs)
  if mayEmit then
    redis.call("HSET", key,
      "firing", "1",
      "lastFiringAt", tostring(now),
      "lastNotificationAt", tostring(now),
      "observedValue", observedVal,
      "threshold", thresholdVal,
      "pipeline", pipelineVal
    )
    redis.call("EXPIRE", key, ttl)
    return "EMIT_FIRING"
  else
    redis.call("HSET", key,
      "firing", "1",
      "observedValue", observedVal,
      "threshold", thresholdVal,
      "pipeline", pipelineVal
    )
    redis.call("EXPIRE", key, ttl)
    return "SUPPRESSED"
  end
else
  -- Condition is healthy (isFiring == 0)
  if isCurrentlyFiring then
    -- Condition recovered: emit resolution exactly once, preserve lastFiringAt for cooldown tracking
    redis.call("HSET", key,
      "firing", "0",
      "lastResolvedAt", tostring(now),
      "lastNotificationAt", tostring(now),
      "observedValue", observedVal,
      "threshold", thresholdVal
    )
    redis.call("EXPIRE", key, ttl)
    return "EMIT_RESOLVED"
  else
    -- Already resolved / healthy: no-op
    return "NOOP"
  end
end
`;

export class InMemoryAlertStateStore implements AlertStateStore {
  private readonly states = new Map<AlertName, PersistedAlertState>();

  public async transition(
    name: AlertName,
    isFiring: boolean,
    now: number,
    cooldownMs: number,
    metadata?: { observedValue?: number; threshold?: number; pipeline?: string }
  ): Promise<AlertTransitionResult> {
    const prev = this.states.get(name);
    const isCurrentlyFiring = prev?.firing ?? false;

    if (isFiring) {
      const lastFiring = prev?.lastFiringAt ?? 0;
      const mayEmit = !prev || lastFiring === 0 || now - lastFiring >= cooldownMs;

      if (mayEmit) {
        const state: PersistedAlertState = {
          firing: true,
          lastFiringAt: now,
          lastResolvedAt: prev?.lastResolvedAt ?? 0,
          lastNotificationAt: now,
          observedValue: metadata?.observedValue,
          threshold: metadata?.threshold,
          pipeline: metadata?.pipeline,
        };
        this.states.set(name, state);
        return { action: "EMIT_FIRING", state };
      } else {
        const state: PersistedAlertState = {
          firing: true,
          lastFiringAt: lastFiring,
          lastResolvedAt: prev?.lastResolvedAt ?? 0,
          lastNotificationAt: prev?.lastNotificationAt ?? 0,
          observedValue: metadata?.observedValue,
          threshold: metadata?.threshold,
          pipeline: metadata?.pipeline,
        };
        this.states.set(name, state);
        return { action: "SUPPRESSED", state };
      }
    } else {
      if (isCurrentlyFiring) {
        const state: PersistedAlertState = {
          firing: false,
          lastFiringAt: prev?.lastFiringAt ?? 0,
          lastResolvedAt: now,
          lastNotificationAt: now,
          observedValue: metadata?.observedValue,
          threshold: metadata?.threshold,
          pipeline: metadata?.pipeline,
        };
        this.states.set(name, state);
        return { action: "EMIT_RESOLVED", state };
      } else {
        const state: PersistedAlertState = prev ?? {
          firing: false,
          lastFiringAt: 0,
          lastResolvedAt: 0,
          lastNotificationAt: 0,
          observedValue: metadata?.observedValue,
          threshold: metadata?.threshold,
          pipeline: metadata?.pipeline,
        };
        return { action: "NOOP", state };
      }
    }
  }

  public async getState(name: AlertName): Promise<PersistedAlertState | undefined> {
    return this.states.get(name);
  }

  public async clear(name?: AlertName): Promise<void> {
    if (name) {
      this.states.delete(name);
    } else {
      this.states.clear();
    }
  }

  public async resetFiringCooldown(name: AlertName): Promise<void> {
    const prev = this.states.get(name);
    if (prev && prev.firing) {
      this.states.set(name, {
        ...prev,
        lastFiringAt: 0,
        lastNotificationAt: 0,
      });
    }
  }
}

export class RedisAlertStateStore implements AlertStateStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly inMemoryFallback = new InMemoryAlertStateStore();

  constructor(redis: Redis, options?: { ttlSeconds?: number }) {
    this.redis = redis;
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_ALERT_STATE_TTL_SECONDS;

    // Track Redis availability safely without throwing unhandled exceptions
    if (typeof (this.redis as unknown as { on?: unknown }).on === "function") {
      this.redis.on("error", () => {});
      this.redis.on("connect", () => {});
      this.redis.on("ready", () => {});
    }
  }

  private getKey(name: AlertName): string {
    return getAlertStateKey(name);
  }

  public async transition(
    name: AlertName,
    isFiring: boolean,
    now: number,
    cooldownMs: number,
    metadata?: { observedValue?: number; threshold?: number; pipeline?: string }
  ): Promise<AlertTransitionResult> {
    const key = this.getKey(name);

    try {
      // Execute atomic Lua script
      const action = (await this.redis.eval(
        transitionLuaScript,
        1,
        key,
        isFiring ? "1" : "0",
        String(now),
        String(cooldownMs),
        String(this.ttlSeconds),
        String(metadata?.observedValue ?? ""),
        String(metadata?.threshold ?? ""),
        metadata?.pipeline ?? ""
      )) as AlertTransitionAction;

      const state: PersistedAlertState = {
        firing: isFiring,
        lastFiringAt: now,
        lastResolvedAt: isFiring ? 0 : now,
        lastNotificationAt: now,
        observedValue: metadata?.observedValue,
        threshold: metadata?.threshold,
        pipeline: metadata?.pipeline,
      };

      // Also keep fallback updated in sync
      await this.inMemoryFallback.transition(name, isFiring, now, cooldownMs, metadata);

      return { action, state };
    } catch (error) {
      // Redis unavailable or command timeout: fail-safe fallback to in-memory store
      console.warn(
        `[monitoring:alertStateStore] Redis unavailable for alert '${name}'; falling back to process-local in-memory store (cross-process deduplication is degraded):`,
        error instanceof Error ? error.message : "Unknown Redis error"
      );
      return this.inMemoryFallback.transition(name, isFiring, now, cooldownMs, metadata);
    }
  }

  public async getState(name: AlertName): Promise<PersistedAlertState | undefined> {
    const key = this.getKey(name);
    try {
      const data = await this.redis.hgetall(key);
      if (!data || Object.keys(data).length === 0) {
        return undefined;
      }
      return {
        firing: data.firing === "1",
        lastFiringAt: Number(data.lastFiringAt || 0),
        lastResolvedAt: Number(data.lastResolvedAt || 0),
        lastNotificationAt: Number(data.lastNotificationAt || 0),
        observedValue: data.observedValue ? Number(data.observedValue) : undefined,
        threshold: data.threshold ? Number(data.threshold) : undefined,
        pipeline: data.pipeline || undefined,
      };
    } catch {
      return this.inMemoryFallback.getState(name);
    }
  }

  public async clear(name?: AlertName): Promise<void> {
    if (name) {
      const key = this.getKey(name);
      try {
        await this.redis.del(key);
      } catch {}
      await this.inMemoryFallback.clear(name);
    } else {
      await this.inMemoryFallback.clear();
    }
  }

  public async resetFiringCooldown(name: AlertName): Promise<void> {
    const key = this.getKey(name);
    try {
      await this.redis.hset(key, "lastFiringAt", "0", "lastNotificationAt", "0");
      await this.inMemoryFallback.resetFiringCooldown(name);
    } catch {
      await this.inMemoryFallback.resetFiringCooldown(name);
    }
  }
}

export function createAlertStateStore(
  redis?: Redis,
  options?: { ttlSeconds?: number }
): AlertStateStore {
  if (redis) {
    return new RedisAlertStateStore(redis, options);
  }
  return new InMemoryAlertStateStore();
}
