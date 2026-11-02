import type { Gauge, Histogram } from "@prometheus-io/client";
import type Redis from "ioredis";
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
  | "dubbing_queue_depth"
  | "gpu_hours_threshold"
  | "dubbing_vendor_spend_threshold"
  | "dubbing_vendor_usage_threshold";

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

  // GPU worker runtime alerts (measures active worker processing duration on GPU hosts, distinct from EC2 instance running time)
  gpuHoursThreshold?: number;
  gpuHoursObservationWindowSeconds?: number;

  // Dubbing vendor spend / usage alerts
  dubbingVendorSpendThresholdUsd?: number;
  dubbingVendorUsageThreshold?: number;
  dubbingVendorObservationWindowSeconds?: number;
  dubbingVendorEstimatedUnitCostUsd?: number;

  // Optional notification webhook
  alertWebhookUrl?: string;
}

export interface CostWindowData {
  gpuJobDurationSeconds?: number;
  dubbingVendorUsage?: number;
  dubbingVendorSpendUsd?: number;
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
  costWindowData?: CostWindowData;
  costRedis?: Redis;
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

function readOptionalNumber(
  environment: Readonly<Record<string, string | undefined>>,
  variableName: string,
  validate: (value: number) => boolean
): number | undefined {
  const rawValue = environment[variableName]?.trim();
  if (!rawValue) {
    return undefined;
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

  // Base latency, failure-rate, and queue depth alerts
  const baseConfig: MonitoringAlertConfig = {
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

  // GPU worker runtime configuration
  const gpuHoursThreshold = readOptionalNumber(
    environment,
    "MONITORING_GPU_HOURS_THRESHOLD",
    positive
  );
  const gpuHoursObservationWindowSeconds = readOptionalNumber(
    environment,
    "MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS",
    wholeMinute
  );

  if (gpuHoursThreshold !== undefined && gpuHoursObservationWindowSeconds === undefined) {
    throw new MonitoringAlertConfigurationError("MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS");
  }

  // Dubbing vendor spend and usage configuration
  const dubbingVendorSpendThresholdUsd = readOptionalNumber(
    environment,
    "MONITORING_DUBBING_VENDOR_SPEND_THRESHOLD_USD",
    positive
  );
  const dubbingVendorUsageThreshold = readOptionalNumber(
    environment,
    "MONITORING_DUBBING_VENDOR_USAGE_THRESHOLD",
    positive
  );
  const dubbingVendorObservationWindowSeconds = readOptionalNumber(
    environment,
    "MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS",
    wholeMinute
  );
  const dubbingVendorEstimatedUnitCostUsd = readOptionalNumber(
    environment,
    "MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD",
    positive
  );

  if (
    (dubbingVendorSpendThresholdUsd !== undefined || dubbingVendorUsageThreshold !== undefined) &&
    dubbingVendorObservationWindowSeconds === undefined
  ) {
    throw new MonitoringAlertConfigurationError(
      "MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS"
    );
  }

  // Reject configuration if spend threshold is set but estimated unit pricing is missing
  if (
    dubbingVendorSpendThresholdUsd !== undefined &&
    dubbingVendorEstimatedUnitCostUsd === undefined
  ) {
    throw new MonitoringAlertConfigurationError(
      "MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD"
    );
  }

  // Webhook URL validation
  let alertWebhookUrl: string | undefined;
  const rawWebhookUrl = environment.MONITORING_ALERT_WEBHOOK_URL?.trim();
  if (rawWebhookUrl) {
    try {
      const parsed = new URL(rawWebhookUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Protocol must be http: or https:");
      }
      alertWebhookUrl = rawWebhookUrl;
    } catch {
      throw new MonitoringAlertConfigurationError("MONITORING_ALERT_WEBHOOK_URL");
    }
  }

  return {
    ...baseConfig,
    gpuHoursThreshold,
    gpuHoursObservationWindowSeconds,
    dubbingVendorSpendThresholdUsd,
    dubbingVendorUsageThreshold,
    dubbingVendorObservationWindowSeconds,
    dubbingVendorEstimatedUnitCostUsd,
    alertWebhookUrl,
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
  "gpu_hours_threshold",
  "dubbing_vendor_spend_threshold",
  "dubbing_vendor_usage_threshold",
];

function emitStructuredAlert(event: MonitoringAlertEvent): void {
  const log = event.status === "firing" ? console.warn : console.info;
  log(`[monitoring] ${JSON.stringify(event)}`);
}

/**
 * Dispatch alert event notification to configured webhook URL.
 * Bounded timeout and safe error catching ensure delivery failures never crash the monitoring process.
 */
export async function dispatchAlertWebhook(
  url: string,
  event: MonitoringAlertEvent,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Protocol must be http: or https:");
    }
    // Clean safe URL for logging without query params or secrets
    const safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          `[monitoring] Alert webhook returned non-2xx status (${response.status}) from ${safeUrl}`
        );
        return false;
      }
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[monitoring] Failed to send alert webhook notification: ${message}`);
    return false;
  }
}

export function createMonitoringAlertEvaluator(
  defaultEmit: (event: MonitoringAlertEvent) => void = emitStructuredAlert
): (options?: AlertEvaluationOptions) => Promise<MonitoringAlertEvent[]> {
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

    // Cost / Usage metrics evaluation
    if (config.gpuHoursThreshold !== undefined && options.costWindowData?.gpuJobDurationSeconds !== undefined) {
      const gpuHours = options.costWindowData.gpuJobDurationSeconds / 3600;
      evaluated.add("gpu_hours_threshold");
      conditions.push({
        name: "gpu_hours_threshold",
        pipeline: "reframe",
        observedValue: gpuHours,
        threshold: config.gpuHoursThreshold,
      });
    }

    if (config.dubbingVendorSpendThresholdUsd !== undefined) {
      let observedSpend = options.costWindowData?.dubbingVendorSpendUsd;
      if (
        observedSpend === undefined &&
        options.costWindowData?.dubbingVendorUsage !== undefined &&
        config.dubbingVendorEstimatedUnitCostUsd !== undefined
      ) {
        observedSpend =
          options.costWindowData.dubbingVendorUsage * config.dubbingVendorEstimatedUnitCostUsd;
      }
      if (observedSpend !== undefined) {
        evaluated.add("dubbing_vendor_spend_threshold");
        conditions.push({
          name: "dubbing_vendor_spend_threshold",
          pipeline: "dubbing",
          observedValue: observedSpend,
          threshold: config.dubbingVendorSpendThresholdUsd,
        });
      }
    }

    if (
      config.dubbingVendorUsageThreshold !== undefined &&
      options.costWindowData?.dubbingVendorUsage !== undefined
    ) {
      evaluated.add("dubbing_vendor_usage_threshold");
      conditions.push({
        name: "dubbing_vendor_usage_threshold",
        pipeline: "dubbing",
        observedValue: options.costWindowData.dubbingVendorUsage,
        threshold: config.dubbingVendorUsageThreshold,
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
          if (config.alertWebhookUrl) {
            void dispatchAlertWebhook(config.alertWebhookUrl, event);
          }
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
        if (config.alertWebhookUrl) {
          void dispatchAlertWebhook(config.alertWebhookUrl, event);
        }
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

  let costWindowData = options.costWindowData;
  if (!costWindowData && options.costRedis) {
    costWindowData = {};
    if (config.gpuHoursThreshold !== undefined && config.gpuHoursObservationWindowSeconds) {
      const { collectCostWindowSum } = await import("./costWindowMetrics");
      costWindowData.gpuJobDurationSeconds = await collectCostWindowSum(
        options.costRedis,
        { category: "gpu_worker", provider: "reframe", unit: "seconds" },
        config.gpuHoursObservationWindowSeconds,
        now
      );
    }
    if (
      (config.dubbingVendorSpendThresholdUsd !== undefined ||
        config.dubbingVendorUsageThreshold !== undefined) &&
      config.dubbingVendorObservationWindowSeconds
    ) {
      const { collectCostWindowSum } = await import("./costWindowMetrics");
      costWindowData.dubbingVendorUsage = await collectCostWindowSum(
        options.costRedis,
        { category: "dubbing", provider: "elevenlabs", unit: "characters" },
        config.dubbingVendorObservationWindowSeconds,
        now
      );
    }
  }

  return evaluateConfiguredAlerts({
    ...options,
    config,
    now,
    failureRateWindowCounts,
    costWindowData,
  });
}
