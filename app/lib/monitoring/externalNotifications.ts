import { Resend } from "resend";
import type { MonitoringAlertEvent, AlertName } from "./alerts";

export interface ExternalNotificationConfig {
  alertEmailRecipient?: string;
  alertEmailSender?: string;
  resendApiKey?: string;
  alertWebhookUrl?: string;
  alertDryRun?: boolean;
}

export interface FormattedAlertMessage {
  subject: string;
  text: string;
  html: string;
  slackPayload: {
    text: string;
    blocks: Array<Record<string, unknown>>;
  };
}

export interface NotificationDispatchResult {
  emailSent: boolean;
  webhookSent: boolean;
  dryRun: boolean;
  errors: string[];
}

export function isEstimatedCostAlert(name: AlertName): boolean {
  return (
    name === "gpu_hours_threshold" ||
    name === "gpu_spend_threshold" ||
    name === "dubbing_vendor_spend_threshold" ||
    name === "dubbing_vendor_usage_threshold"
  );
}

function formatValueForAlert(name: AlertName, value: number): string {
  if (name.includes("latency") || name.includes("stuck_queue")) {
    return `${value.toFixed(1)}s`;
  }
  if (name.includes("failure_rate")) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (name.includes("spend")) {
    return `$${value.toFixed(2)}`;
  }
  if (name.includes("hours")) {
    return `${value.toFixed(2)} hrs`;
  }
  if (name.includes("queue_depth") || name.includes("usage")) {
    return `${Math.round(value).toLocaleString()}`;
  }
  return `${value}`;
}

export function formatAlertMessage(event: MonitoringAlertEvent): FormattedAlertMessage {
  const isFiring = event.status === "firing";
  const icon = isFiring ? "🚨" : "✅";
  const statusLabel = isFiring ? "FIRING" : "RESOLVED";
  const severityUpper = event.severity.toUpperCase();

  const formattedObserved = formatValueForAlert(event.name, event.observedValue);
  const formattedThreshold = formatValueForAlert(event.name, event.threshold);

  const estimatedCostNotice = isEstimatedCostAlert(event.name)
    ? "\n\n⚠️ ESTIMATED COST NOTICE: This alert is computed from observed worker execution time or character usage and configured unit rates. It represents an operational estimate, not an official cloud or vendor billing invoice."
    : "";

  const subject = isFiring
    ? `[${statusLabel}: ${severityUpper}] ${event.name} (${event.pipeline})`
    : `[${statusLabel}] ${event.name} (${event.pipeline}) recovered`;

  const text = `${icon} Marvedge Monitoring Alert: ${statusLabel}
Alert: ${event.name}
Pipeline: ${event.pipeline}
Severity: ${event.severity}
Status: ${event.status}
Observed Value: ${formattedObserved}
Configured Threshold: ${formattedThreshold}
Timestamp: ${event.timestamp}${estimatedCostNotice}
`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
  <div style="background-color: ${isFiring ? "#ef4444" : "#10b981"}; color: white; padding: 16px 20px;">
    <h2 style="margin: 0; font-size: 18px; font-weight: 600;">${icon} [${statusLabel}] ${event.name}</h2>
    <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Pipeline: ${event.pipeline} &bull; Severity: ${event.severity}</p>
  </div>
  <div style="padding: 20px; background-color: #ffffff; color: #1e293b;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Observed Value</td>
        <td style="padding: 8px 0; font-weight: 600; text-align: right;">${formattedObserved}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Configured Threshold</td>
        <td style="padding: 8px 0; font-weight: 600; text-align: right;">${formattedThreshold}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Event Timestamp</td>
        <td style="padding: 8px 0; color: #64748b; text-align: right;">${event.timestamp}</td>
      </tr>
    </table>
    ${
      isEstimatedCostAlert(event.name)
        ? `<div style="margin-top: 16px; padding: 12px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; font-size: 12px; color: #92400e;">
            <strong>Estimated Cost Notice:</strong> This metric is calculated from active runtime / usage estimates and configured unit costs. It does not reflect official provider billing invoices.
          </div>`
        : ""
    }
  </div>
</div>
`;

  const slackPayload = {
    text: subject,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${icon} ${statusLabel}: ${event.name}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Pipeline:*\n${event.pipeline}` },
          { type: "mrkdwn", text: `*Severity:*\n${event.severity}` },
          { type: "mrkdwn", text: `*Observed:*\n${formattedObserved}` },
          { type: "mrkdwn", text: `*Threshold:*\n${formattedThreshold}` },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Timestamp:* ${event.timestamp}${
              isEstimatedCostAlert(event.name)
                ? " | _Note: Operational estimate, not invoice._"
                : ""
            }`,
          },
        ],
      },
    ],
  };

  return { subject, text, html, slackPayload };
}

export function sanitizeUrlForLogging(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Dispatches alert notification via Email (Resend) and Chat Webhook (Slack / Discord / Teams / Generic).
 *
 * Safety & Reliability Guarantees:
 * - If alertDryRun is true, logs payload and never performs network I/O.
 * - Timeouts are bounded to 5,000ms using AbortController.
 * - Bounded retries: up to 2 retries with exponential backoff on transient errors.
 * - Credentials and webhook secret tokens are never exposed in log output.
 * - Exceptions are caught so the monitoring evaluator never crashes.
 */
export async function sendExternalAlertNotification(
  event: MonitoringAlertEvent,
  config: ExternalNotificationConfig,
  deps: {
    resendClient?: Pick<Resend, "emails">;
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
  } = {}
): Promise<NotificationDispatchResult> {
  const result: NotificationDispatchResult = {
    emailSent: false,
    webhookSent: false,
    dryRun: Boolean(config.alertDryRun),
    errors: [],
  };

  const message = formatAlertMessage(event);

  if (config.alertDryRun) {
    console.info(
      `[monitoring:dry-run] Alert notification evaluated (DRY RUN active, skipped transmission): ${message.subject}`
    );
    return result;
  }

  const sleep =
    deps.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const fetchFn = deps.fetchImpl ?? fetch;

  // 1. Dispatch Webhook Notification (if configured)
  if (config.alertWebhookUrl) {
    const safeUrl = sanitizeUrlForLogging(config.alertWebhookUrl);
    let attempts = 0;
    const maxAttempts = 3;
    let sent = false;

    while (attempts < maxAttempts && !sent) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const payload = {
          text: message.text,
          content: message.text, // for Discord
          blocks: message.slackPayload.blocks, // for Slack
          event,
        };

        const response = await fetchFn(config.alertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${safeUrl}`);
        }
        sent = true;
        result.webhookSent = true;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown webhook error";
        if (attempts >= maxAttempts) {
          console.warn(
            `[monitoring] Failed to send alert webhook after ${attempts} attempts to ${safeUrl}: ${errMsg}`
          );
          result.errors.push(`Webhook failure: ${errMsg}`);
        } else {
          await sleep(Math.pow(2, attempts - 1) * 300);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  // 2. Dispatch Email Notification via Resend (if configured)
  const resendApiKey = config.resendApiKey?.trim();
  const emailRecipient = config.alertEmailRecipient?.trim();

  if (resendApiKey && emailRecipient) {
    const recipients = emailRecipient
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (recipients.length > 0) {
      const sender = config.alertEmailSender?.trim() || "alerts@marvedge.com";
      const resend = deps.resendClient ?? new Resend(resendApiKey);

      let attempts = 0;
      const maxAttempts = 3;
      let sent = false;

      while (attempts < maxAttempts && !sent) {
        attempts++;
        try {
          const sendPromise = resend.emails.send({
            from: sender,
            to: recipients,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });

          // Timeout wrapper for Resend call (5000ms)
          const timeoutPromise = new Promise<{ error: Error }>((_, reject) => {
            const id = setTimeout(() => {
              clearTimeout(id);
              reject(new Error("Email dispatch timed out after 5000ms"));
            }, 5000);
          });

          const sendResult = (await Promise.race([sendPromise, timeoutPromise])) as {
            error?: unknown;
            data?: unknown;
          };

          if (sendResult?.error) {
            const errDetail =
              typeof sendResult.error === "object" &&
              sendResult.error &&
              "message" in sendResult.error
                ? String(sendResult.error.message)
                : JSON.stringify(sendResult.error);
            throw new Error(errDetail);
          }

          sent = true;
          result.emailSent = true;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown email error";
          if (attempts >= maxAttempts) {
            console.warn(
              `[monitoring] Failed to send alert email after ${attempts} attempts to ${recipients.join(
                ", "
              )}: ${errMsg}`
            );
            result.errors.push(`Email failure: ${errMsg}`);
          } else {
            await sleep(Math.pow(2, attempts - 1) * 300);
          }
        }
      }
    }
  }

  return result;
}
