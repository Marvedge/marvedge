import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Resend } from "resend";
import {
  formatAlertMessage,
  isEstimatedCostAlert,
  sanitizeUrlForLogging,
  sendExternalAlertNotification,
} from "./externalNotifications";
import type { MonitoringAlertEvent } from "./alerts";

describe("externalNotifications", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const firingFailureEvent: MonitoringAlertEvent = {
    name: "reframe_job_failure_rate",
    pipeline: "reframe",
    severity: "warning",
    observedValue: 0.35,
    threshold: 0.2,
    timestamp: "2026-11-02T12:00:00.000Z",
    status: "firing",
  };

  const resolvedSpendEvent: MonitoringAlertEvent = {
    name: "dubbing_vendor_spend_threshold",
    pipeline: "dubbing",
    severity: "warning",
    observedValue: 12.5,
    threshold: 15.0,
    timestamp: "2026-11-02T12:05:00.000Z",
    status: "resolved",
  };

  it("correctly identifies estimated cost alerts", () => {
    expect(isEstimatedCostAlert("gpu_spend_threshold")).toBe(true);
    expect(isEstimatedCostAlert("gpu_hours_threshold")).toBe(true);
    expect(isEstimatedCostAlert("dubbing_vendor_spend_threshold")).toBe(true);
    expect(isEstimatedCostAlert("dubbing_vendor_usage_threshold")).toBe(true);
    expect(isEstimatedCostAlert("reframe_job_failure_rate")).toBe(false);
    expect(isEstimatedCostAlert("reframe_stuck_queue")).toBe(false);
  });

  it("formats alert message with appropriate icons, statuses, and estimated cost notice", () => {
    const formattedFiring = formatAlertMessage(firingFailureEvent);
    expect(formattedFiring.subject).toContain("[FIRING: WARNING] reframe_job_failure_rate");
    expect(formattedFiring.text).toContain("🚨 Marvedge Monitoring Alert: FIRING");
    expect(formattedFiring.text).toContain("Observed Value: 35.0%");
    expect(formattedFiring.text).not.toContain("ESTIMATED COST NOTICE");

    const formattedResolved = formatAlertMessage(resolvedSpendEvent);
    expect(formattedResolved.subject).toContain("[RESOLVED] dubbing_vendor_spend_threshold");
    expect(formattedResolved.text).toContain("✅ Marvedge Monitoring Alert: RESOLVED");
    expect(formattedResolved.text).toContain("Observed Value: $12.50");
    expect(formattedResolved.text).toContain("ESTIMATED COST NOTICE");
    expect(formattedResolved.html).toContain("Estimated Cost Notice");
  });

  it("sanitizes URLs for logging without exposing path tokens or credentials", () => {
    expect(
      sanitizeUrlForLogging("https://hooks.slack.com/services/T00/B00/SECRET_TOKEN?foo=bar#hash")
    ).toBe("https://hooks.slack.com/services/T00/B00/SECRET_TOKEN");
    expect(sanitizeUrlForLogging("not a valid url")).toBe("[invalid-url]");
  });

  it("respects dry-run mode and performs NO network requests", async () => {
    const fetchSpy = vi.fn();
    const sendSpy = vi.fn();

    const result = await sendExternalAlertNotification(
      firingFailureEvent,
      {
        alertDryRun: true,
        alertWebhookUrl: "https://hooks.example.com/alerts",
        resendApiKey: "re_fake_api_key",
        alertEmailRecipient: "oncall@example.com",
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        resendClient: { emails: { send: sendSpy } } as unknown as Pick<Resend, "emails">,
      }
    );

    expect(result.dryRun).toBe(true);
    expect(result.webhookSent).toBe(false);
    expect(result.emailSent).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("dispatches webhook successfully with proper payload structure", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await sendExternalAlertNotification(
      firingFailureEvent,
      {
        alertWebhookUrl: "https://hooks.example.com/alerts",
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
      }
    );

    expect(result.webhookSent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, options] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("https://hooks.example.com/alerts");
    const parsedBody = JSON.parse(options.body as string);
    expect(parsedBody.event.name).toBe("reframe_job_failure_rate");
    expect(parsedBody.blocks).toBeDefined();
  });

  it("retries transient webhook failures up to 3 times with backoff", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    const result = await sendExternalAlertNotification(
      firingFailureEvent,
      {
        alertWebhookUrl: "https://hooks.example.com/alerts",
      },
      {
        fetchImpl: fetchSpy as unknown as typeof fetch,
        sleepImpl: sleepSpy,
      }
    );

    expect(result.webhookSent).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });

  it("dispatches email successfully via Resend", async () => {
    const sendSpy = vi.fn().mockResolvedValue({ data: { id: "msg_123" }, error: null });

    const result = await sendExternalAlertNotification(
      resolvedSpendEvent,
      {
        resendApiKey: "re_valid_key",
        alertEmailRecipient: "ops@marvedge.com, alerts@marvedge.com",
        alertEmailSender: "notifications@marvedge.com",
      },
      {
        resendClient: { emails: { send: sendSpy } } as unknown as Pick<Resend, "emails">,
      }
    );

    expect(result.emailSent).toBe(true);
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "notifications@marvedge.com",
        to: ["ops@marvedge.com", "alerts@marvedge.com"],
        subject: expect.stringContaining("[RESOLVED] dubbing_vendor_spend_threshold"),
      })
    );
  });
});
