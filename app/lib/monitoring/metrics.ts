import { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";

export const metricsRegistry = new Registry();

export const reframeInferenceDurationSeconds = new Histogram<"status">({
  name: "marvedge_reframe_inference_duration_seconds",
  help: "Time spent performing reframe ML inference.",
  labelNames: ["status"],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
  registers: [metricsRegistry],
});

export const dubbingDurationSeconds = new Histogram<"status">({
  name: "marvedge_dubbing_duration_seconds",
  help: "Time spent processing dubbing jobs.",
  labelNames: ["status"],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [metricsRegistry],
});

export const jobsTotal = new Counter<"pipeline" | "status">({
  name: "marvedge_jobs_total",
  help: "Total number of Marvedge pipeline jobs processed, partitioned by pipeline and status.",
  labelNames: ["pipeline", "status"],
  registers: [metricsRegistry],
});

export const queueDepth = new Gauge<"pipeline" | "state">({
  name: "marvedge_queue_depth",
  help: "Current number of BullMQ jobs in each state for each pipeline.",
  labelNames: ["pipeline", "state"],
  registers: [metricsRegistry],
});
