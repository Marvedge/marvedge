import type { Gauge, Histogram } from "@prometheus-io/client";
import { dubbingDurationSeconds, queueDepth, reframeInferenceDurationSeconds } from "./metrics";
import { collectJobOutcomeWindowCounts, type JobOutcomeMetricsSources } from "./jobOutcomeMetrics";

export type AlertPipeline = "reframe" | "dubbing";
export type AlertSeverity = "warning";
export type AlertStatus = "firing" | "resolved";
export type AlertName =
  | "reframe_inference_latency"
  | "dubbing_processing_latency"
  | "reframe_job_failure_rate"
  | "dubbing_job_failure_rate"
  | "reframe_queue_depth"
  | "dubbing_queue_depth";

export interface MonitoringAlertEvent {
  name: AlertName;
  pipeline: AlertPipeline;
  severity: AlertSeverity;
  observedValue: number;
  threshold: number;
  timestamp: string;
  status: AlertStatus;
}

export interface MonitoringAlertConfig {
  reframeInferenceLatencyThresholdSeconds: number;
  dubbingLatencyThresholdSeconds: number;
  reframeFailureRateThreshold: number;
  dubbingFailureRateThreshold: number;
  reframeQueueDepthThreshold: number;
  dubbingQueueDepthThreshold: number;
  failureRateObservationWindowSeconds: number;
  failureRateMinimumJobs: number;
  alertCooldownSeconds: number;
}

export interface AlertEvaluationOptions {
  config?: MonitoringAlertConfig;
  now?: number;
  failureRateWindowCounts?: FailureRateWindowCountsByPipeline;
  failureRateQueues?: JobOutcomeMetricsSources;
  latencyWindowMeans?: Partial<Record<AlertPipeline, number>>;
  queueDepthAvailability?: Partial<Record<AlertPipeline, boolean>>;
  inferenceHistogram?: Pick<Histogram<"status">, "get">;
  dubbingHistogram?: Pick<Histogram<"status">, "get">;
  queueGauge?: Pick<Gauge<"pipeline" | "state">, "get">;
  emit?: (event: MonitoringAlertEvent) => void;
}

export interface FailureRateWindowCounts {
  completed: number;
  failed: number;
  windowSeconds: number;
}

export type FailureRateWindowCountsByPipeline = Partial<
  Record<AlertPipeline, FailureRateWindowCounts>
>;

export class MonitoringAlertConfigurationError extends Error {
  constructor(variableName: string) {
    super(`Monitoring alert configuration ${variableName} must be set to a valid value`);
    this.name = "MonitoringAlertConfigurationError";
  }
}

function readNumber(
  environment: Readonly<Record<string, string | undefined>>,
  variableName: string,
  validate: (value: number) => boolean
): number {
  const rawValue = environment[variableName]?.trim();
  if (!rawValue) {
    throw new MonitoringAlertConfigurationError(variableName);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || !validate(value)) {
    throw new MonitoringAlertConfigurationError(variableName);
  }
  return value;
}

export function loadMonitoringAlertConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env
): MonitoringAlertConfig {
  const positive = (value: number) => value > 0;
  const positiveInteger = (value: number) => Number.isInteger(value) && value > 0;
  const wholeMinute = (value: number) => positiveInteger(value) && value % 60 === 0;
  const failureRate = (value: number) => value > 0 && value <= 1;

  return {
    reframeInferenceLatencyThresholdSeconds: readNumber(
      environment,
      "MONITORING_REFRAME_INFERENCE_LATENCY_THRESHOLD_SECONDS",
      positive
    ),
    dubbingLatencyThresholdSeconds: readNumber(
      environment,
      "MONITORING_DUBBING_LATENCY_THRESHOLD_SECONDS",
      positive
    ),
    reframeFailureRateThreshold: readNumber(
      environment,
      "MONITORING_REFRAME_FAILURE_RATE_THRESHOLD",
      failureRate
    ),
    dubbingFailureRateThreshold: readNumber(
      environment,
      "MONITORING_DUBBING_FAILURE_RATE_THRESHOLD",
      failureRate
    ),
    reframeQueueDepthThreshold: readNumber(
      environment,
      "MONITORING_REFRAME_QUEUE_DEPTH_THRESHOLD",
      positiveInteger
    ),
    dubbingQueueDepthThreshold: readNumber(
      environment,
      "MONITORING_DUBBING_QUEUE_DEPTH_THRESHOLD",
      positiveInteger
    ),
    failureRateObservationWindowSeconds: readNumber(
      environment,
      "MONITORING_FAILURE_RATE_OBSERVATION_WINDOW_SECONDS",
      wholeMinute
    ),
    failureRateMinimumJobs: readNumber(
      environment,
      "MONITORING_FAILURE_RATE_MINIMUM_JOBS",
      positiveInteger
    ),
    alertCooldownSeconds: readNumber(
      environment,
      "MONITORING_ALERT_COOLDOWN_SECONDS",
      positiveInteger
    ),
  };
}

export function calculateWindowedFailureRate(
  counts: FailureRateWindowCounts,
  minimumJobs: number,
  expectedWindowSeconds: number
): number | undefined {
  const totalJobs = counts.completed + counts.failed;
  if (
    counts.windowSeconds !== expectedWindowSeconds ||
    !Number.isFinite(totalJobs) ||
    counts.completed < 0 ||
    counts.failed < 0 ||
    totalJobs < minimumJobs
  ) {
    return undefined;
  }

  return totalJobs === 0 ? undefined : counts.failed / totalJobs;
}

interface HistogramSnapshot {
  values: Array<{
    labels: Partial<Record<"status", string | number>>;
    value: number;
    metricName?: string;
  }>;
}

function meanHistogramDuration(
  snapshot: HistogramSnapshot,
  metricName: string
): number | undefined {
  let sum = 0;
  let count = 0;

  for (const value of snapshot.values) {
    if (value.labels.status !== "success" && value.labels.status !== "failure") {
      continue;
    }
    if (value.metricName === `${metricName}_sum`) {
      sum += value.value;
    } else if (value.metricName === `${metricName}_count`) {
      count += value.value;
    }
  }

  return count > 0 ? sum / count : undefined;
}

interface QueueSnapshot {
  values: Array<{
    labels: Partial<Record<"pipeline" | "state", string | number>>;
    value: number;
  }>;
}

interface AlertCondition {
  name: AlertName;
  pipeline: AlertPipeline;
  observedValue: number;
  threshold: number;
}

interface AlertState {
  firing: boolean;
  lastFiringAt: number;
}

const alertNames: AlertName[] = [
  "reframe_inference_latency",
  "dubbing_processing_latency",
  "reframe_job_failure_rate",
  "dubbing_job_failure_rate",
  "reframe_queue_depth",
  "dubbing_queue_depth",
];

function emitStructuredAlert(event: MonitoringAlertEvent): void {
  const log = event.status === "firing" ? console.warn : console.info;
  log(`[monitoring] ${JSON.stringify(event)}`);
}

export function createMonitoringAlertEvaluator(
  defaultEmit: (event: MonitoringAlertEvent) => void = emitStructuredAlert
): (options?: AlertEvaluationOptions) => Promise<MonitoringAlertEvent[]> {
  // The six known alert names bound this process-local deduplication state.
  const states = new Map<AlertName, AlertState>();

  return async (options = {}) => {
    const config = options.config ?? loadMonitoringAlertConfig();
    const now = options.now ?? Date.now();
    const [reframeHistogram, dubbingHistogram, queueSnapshot] = await Promise.all([
      (options.inferenceHistogram ?? reframeInferenceDurationSeconds).get(),
      (options.dubbingHistogram ?? dubbingDurationSeconds).get(),
      (options.queueGauge ?? queueDepth).get(),
    ]);
    const typedQueueSnapshot = queueSnapshot as QueueSnapshot;

    const conditions: AlertCondition[] = [];
    const evaluated = new Set<AlertName>();
    const reframeLatency = options.latencyWindowMeans
      ? options.latencyWindowMeans.reframe
      : meanHistogramDuration(reframeHistogram, "marvedge_reframe_inference_duration_seconds");
    const dubbingLatency = options.latencyWindowMeans
      ? options.latencyWindowMeans.dubbing
      : meanHistogramDuration(dubbingHistogram, "marvedge_dubbing_duration_seconds");

    if (reframeLatency !== undefined) {
      evaluated.add("reframe_inference_latency");
      conditions.push({
        name: "reframe_inference_latency",
        pipeline: "reframe",
        observedValue: reframeLatency,
        threshold: config.reframeInferenceLatencyThresholdSeconds,
      });
    }
    if (dubbingLatency !== undefined) {
      evaluated.add("dubbing_processing_latency");
      conditions.push({
        name: "dubbing_processing_latency",
        pipeline: "dubbing",
        observedValue: dubbingLatency,
        threshold: config.dubbingLatencyThresholdSeconds,
      });
    }

    for (const pipeline of ["reframe", "dubbing"] as const) {
      // The process-local cumulative jobs counter cannot provide trustworthy cross-process
      // window deltas; only explicit window-scoped counts are eligible for this alert.
      const windowCounts = options.failureRateWindowCounts?.[pipeline];
      if (!windowCounts) {
        continue;
      }
      const rate = calculateWindowedFailureRate(
        windowCounts,
        config.failureRateMinimumJobs,
        config.failureRateObservationWindowSeconds
      );
      if (rate === undefined) {
        continue;
      }

      const name = pipeline === "reframe" ? "reframe_job_failure_rate" : "dubbing_job_failure_rate";
      evaluated.add(name);
      conditions.push({
        name,
        pipeline,
        observedValue: rate,
        threshold:
          pipeline === "reframe"
            ? config.reframeFailureRateThreshold
            : config.dubbingFailureRateThreshold,
      });
    }

    for (const pipeline of ["reframe", "dubbing"] as const) {
      if (options.queueDepthAvailability?.[pipeline] === false) {
        continue;
      }
      const queueValue = typedQueueSnapshot.values.find(
        (value) => value.labels.pipeline === pipeline && value.labels.state === "waiting"
      )?.value;
      if (queueValue === undefined) {
        continue;
      }

      const name = pipeline === "reframe" ? "reframe_queue_depth" : "dubbing_queue_depth";
      evaluated.add(name);
      conditions.push({
        name,
        pipeline,
        observedValue: queueValue,
        threshold:
          pipeline === "reframe"
            ? config.reframeQueueDepthThreshold
            : config.dubbingQueueDepthThreshold,
      });
    }

    const activeConditions = new Map(conditions.map((condition) => [condition.name, condition]));
    const events: MonitoringAlertEvent[] = [];
    const cooldownMs = config.alertCooldownSeconds * 1000;

    for (const name of alertNames) {
      if (!evaluated.has(name)) {
        continue;
      }

      const condition = activeConditions.get(name);
      const previous = states.get(name);
      const isFiring = condition !== undefined && condition.observedValue > condition.threshold;

      if (isFiring && condition) {
        const mayEmit = !previous || now - previous.lastFiringAt >= cooldownMs;
        const state: AlertState = {
          firing: true,
          lastFiringAt: previous?.lastFiringAt ?? now,
        };
        if (mayEmit) {
          state.lastFiringAt = now;
          const event: MonitoringAlertEvent = {
            name,
            pipeline: condition.pipeline,
            severity: "warning",
            observedValue: condition.observedValue,
            threshold: condition.threshold,
            timestamp: new Date(now).toISOString(),
            status: "firing",
          };
          events.push(event);
          (options.emit ?? defaultEmit)(event);
        }
        states.set(name, state);
      } else if (previous?.firing && condition) {
        const event: MonitoringAlertEvent = {
          name,
          pipeline: condition.pipeline,
          severity: "warning",
          observedValue: condition.observedValue,
          threshold: condition.threshold,
          timestamp: new Date(now).toISOString(),
          status: "resolved",
        };
        events.push(event);
        (options.emit ?? defaultEmit)(event);
        states.set(name, { firing: false, lastFiringAt: previous.lastFiringAt });
      }
    }

    return events;
  };
}

const evaluateConfiguredAlerts = createMonitoringAlertEvaluator();

export async function evaluateMonitoringAlerts(
  options: AlertEvaluationOptions = {}
): Promise<MonitoringAlertEvent[]> {
  const config = options.config ?? loadMonitoringAlertConfig();
  const now = options.now ?? Date.now();
  let failureRateWindowCounts = options.failureRateWindowCounts;
  if (!failureRateWindowCounts) {
    let metricsQueues = options.failureRateQueues;
    if (!metricsQueues) {
      const { reframeQueue, dubbingQueue } = await import("../queue");
      metricsQueues = { reframe: reframeQueue, dubbing: dubbingQueue };
    }
    failureRateWindowCounts = await collectJobOutcomeWindowCounts(
      metricsQueues,
      config.failureRateObservationWindowSeconds,
      now
    );
  }

  return evaluateConfiguredAlerts({
    ...options,
    config,
    now,
    failureRateWindowCounts,
  });
}
