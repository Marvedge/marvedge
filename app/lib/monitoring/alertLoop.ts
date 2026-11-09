const maximumTimerDelayMs = 2_147_483_647;

export class MonitoringAlertIntervalError extends Error {
  constructor() {
    super("MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS must be a valid positive interval");
    this.name = "MonitoringAlertIntervalError";
  }
}

export function getMonitoringAlertEvaluationIntervalMs(
  environment: Readonly<Record<string, string | undefined>> = process.env
): number {
  const rawInterval = environment.MONITORING_ALERT_EVALUATION_INTERVAL_SECONDS?.trim();
  const intervalSeconds = Number(rawInterval);
  const intervalMs = intervalSeconds * 1000;

  if (
    !rawInterval ||
    !/^\d+$/.test(rawInterval) ||
    !Number.isSafeInteger(intervalSeconds) ||
    intervalSeconds <= 0 ||
    intervalMs > maximumTimerDelayMs
  ) {
    throw new MonitoringAlertIntervalError();
  }

  return intervalMs;
}

export interface MonitoringAlertLoop {
  stop(): Promise<void>;
}

let activeLoop: MonitoringAlertLoop | undefined;

export function startMonitoringAlertLoop(
  intervalMs: number,
  evaluate: () => Promise<unknown>
): MonitoringAlertLoop {
  if (activeLoop) {
    console.warn("[monitoring] Alert evaluation loop is already running.");
    return activeLoop;
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > maximumTimerDelayMs) {
    throw new RangeError("Monitoring alert evaluation interval is invalid");
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentEvaluation: Promise<void> | undefined;

  const run = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    console.info("[monitoring] Alert evaluation started.");
    currentEvaluation = (async () => {
      try {
        await evaluate();
        console.info("[monitoring] Alert evaluation finished.");
      } catch (error) {
        console.error("[monitoring] Alert evaluation failed:", error);
      }
    })();
    await currentEvaluation;

    if (!stopped) {
      timer = setTimeout(() => {
        void run();
      }, intervalMs);
    }
  };

  const loop: MonitoringAlertLoop = {
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      await currentEvaluation;
      if (activeLoop === loop) {
        activeLoop = undefined;
      }
    },
  };

  activeLoop = loop;
  console.info("[monitoring] Alert evaluation loop started.");
  void run();
  return loop;
}
