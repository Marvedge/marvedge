// Normalization for the dubbing job states returned by GET /api/jobs/[id].
//
// The database stores statuses in uppercase (PENDING / PROCESSING / COMPLETED /
// FAILED / CANCELLED) while the poll route maps them to lowercase UI states
// ("waiting", "active", "completed", "failed", "cancelled") — and a coupled AWS
// worker can override it with its own `state` string entirely. Rather than
// trusting any single spelling, every response is folded into one of the five
// states below so callers never switch on backend-specific strings.

export type DubJobState =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

/** Case-insensitive aliases per normalized state. */
const STATE_ALIASES: Record<Exclude<DubJobState, "unknown">, readonly string[]> = {
  pending: ["pending", "queued", "waiting", "created", "new"],
  processing: ["processing", "active", "running", "in_progress", "started"],
  completed: ["completed", "done", "succeeded", "success", "finished"],
  failed: ["failed", "error", "dead", "rejected"],
  cancelled: ["cancelled", "canceled", "canceling", "cancelling", "aborted"],
};

function lookup(state: string): DubJobState {
  const normalized = state.trim().toLowerCase().replace(/\s+/g, "_");
  for (const [candidate, aliases] of Object.entries(STATE_ALIASES)) {
    if (aliases.includes(normalized)) {
      return candidate as Exclude<DubJobState, "unknown">;
    }
  }
  return "unknown";
}

/**
 * Map the poll route's `state` value onto a stable DubJobState. Handles upper
 * / mixed casing ("PENDING", "Completed"), the "waiting"/"active" UI aliases,
 * and any unrecognized value by returning "unknown" (never throws).
 */
export function normalizeDubJobState(state: unknown): DubJobState {
  if (typeof state !== "string" || state.trim().length === 0) {
    return "unknown";
  }
  return lookup(state);
}

/** True while the job is still working and a poll loop should continue. */
export function isDubJobInProgress(state: DubJobState): boolean {
  return state === "pending" || state === "processing";
}

/** True once the job reached a state polling should stop on. */
export function isDubJobTerminal(state: DubJobState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
