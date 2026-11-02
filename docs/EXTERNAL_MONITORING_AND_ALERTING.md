# External Monitoring & Alerting Guide (Task-00105)

## Overview

Marvedge's external monitoring and alerting system continuously assesses pipeline health, queue latency, worker failure rates, and infrastructure / vendor spend. It issues real-time external notifications via **Email (Resend)** and **Chat Webhooks (Slack, Discord, Microsoft Teams, or custom webhooks)** when thresholds are breached, and sends recovery notifications when issues resolve.

The architecture emphasizes operational safety:

- **Zero false alarms during normal inactivity**: Queue age metrics evaluate active and waiting jobs only; empty queues report zero latency.
- **Accurate failure accounting**: Evaluates terminal job failures in BullMQ, ignoring intermediate retry attempts during exponential backoff.
- **Estimated vs. measured cost distinction**: Operational cost alerts calculate estimates from active worker durations or character counts using configured unit rates. They do not claim to be direct cloud provider billing invoices.
- **Bounded delivery & fault tolerance**: External notifications use a 5-second timeout, bounded retries with exponential backoff, and non-blocking execution so notification delivery errors cannot crash monitoring loops or background workers.
- **Credential safety**: URLs and credentials are sanitized in log outputs.
- **Dry-run mode**: Evaluates and logs formatted notification payloads without transmitting network traffic.

---

## Alert Rules & Supported Metrics

| Alert Name                       | Pipeline | Category        | Description                   | Firing Condition                                                                                  |
| :------------------------------- | :------- | :-------------- | :---------------------------- | :------------------------------------------------------------------------------------------------ |
| `reframe_job_failure_rate`       | Reframe  | Reliability     | Windowed job failure rate     | $\frac{\text{terminal failures}}{\text{completed} + \text{terminal failures}} > \text{threshold}$ |
| `dubbing_job_failure_rate`       | Dubbing  | Reliability     | Windowed job failure rate     | $\frac{\text{terminal failures}}{\text{completed} + \text{terminal failures}} > \text{threshold}$ |
| `reframe_stuck_queue`            | Reframe  | Latency / Queue | Oldest active/waiting job age | $\max(\text{age}) > \text{threshold seconds}$ (ignores empty queues & delayed retries)            |
| `dubbing_stuck_queue`            | Dubbing  | Latency / Queue | Oldest active/waiting job age | $\max(\text{age}) > \text{threshold seconds}$ (ignores empty queues & delayed retries)            |
| `reframe_queue_depth`            | Reframe  | Queue Depth     | Waiting jobs in BullMQ        | $\text{waiting jobs} > \text{threshold}$                                                          |
| `dubbing_queue_depth`            | Dubbing  | Queue Depth     | Waiting jobs in BullMQ        | $\text{waiting jobs} > \text{threshold}$                                                          |
| `reframe_inference_latency`      | Reframe  | Latency         | Average inference latency     | Mean latency over observation window $>$ threshold                                                |
| `dubbing_processing_latency`     | Dubbing  | Latency         | Average dubbing latency       | Mean latency over observation window $>$ threshold                                                |
| `gpu_hours_threshold`            | Reframe  | Cost / Usage    | GPU worker runtime            | Active worker runtime in hours $>$ threshold                                                      |
| `gpu_spend_threshold`            | Reframe  | Estimated Cost  | Estimated GPU worker spend    | $(\frac{\text{runtime seconds}}{3600}) \times \text{hourly rate USD} > \text{threshold USD}$      |
| `dubbing_vendor_spend_threshold` | Dubbing  | Estimated Cost  | Estimated vendor spend        | $\text{characters} \times \text{unit rate USD} > \text{threshold USD}$                            |
| `dubbing_vendor_usage_threshold` | Dubbing  | Usage           | Vendor character volume       | ElevenLabs character consumption $>$ threshold                                                    |

---

## Distinction: Measured Runtime vs. Estimated Cost vs. Billing Invoices

> [!IMPORTANT]
> **Production Billing Architecture Notice**:
>
> 1. **Worker Runtime Measurement**: Marvedge tracks real active worker execution time in Redis minute buckets (`category: "gpu_worker"`, `provider: "reframe"`). This measures worker compute time, not EC2 instance uptime (EC2 instances incur costs while idle until stopped by auto-scaling or power management).
> 2. **Vendor Usage Measurement**: Dubbing tracks character volume consumed through ElevenLabs APIs in Redis minute buckets (`category: "dubbing"`, `provider: "elevenlabs"`).
> 3. **Estimated Cost Calculation**: Alerts convert runtime and character counts to USD using configured unit rates (`MONITORING_GPU_HOURLY_RATE_USD` and `MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD`).
> 4. **Invoices**: These metrics are **operational estimates** for anomaly detection and cost control. They are distinct from AWS Cost Explorer or ElevenLabs monthly invoices, which reflect tiered discounts, taxes, network egress, and idle instance hours.

---

## Notification Channels & Setup

### 1. Chat Webhooks (Slack / Discord / Microsoft Teams / Custom)

Configure `MONITORING_ALERT_WEBHOOK_URL` in the environment.

The dispatcher generates a universal payload containing:

- `text`: Plaintext summary formatted with alert status and icons.
- `blocks`: Slack Block Kit structured blocks with header, key-value fields, and context timestamp.
- `content`: Markdown text compatible with Discord Webhooks.
- `event`: Full structured `MonitoringAlertEvent` object for custom webhook ingestion.

**Safety features**:

- Bounded 5,000ms timeout using `AbortController`.
- Up to 2 retries with exponential backoff on HTTP 5xx or connection drops.
- Sanitized URLs in logs to prevent accidental exposure of Slack tokens in query parameters or URL paths.

### 2. Email Notifications (Resend)

Configure:

- `RESEND_API_KEY`: Resend API key.
- `MONITORING_ALERT_EMAIL_RECIPIENT`: Comma-separated list of recipient emails (e.g., `oncall@marvedge.com,team@marvedge.com`).
- `MONITORING_ALERT_EMAIL_SENDER`: Optional verified sender address (defaults to `alerts@marvedge.com`).

**Safety features**:

- Generates both styled HTML and plain-text fallback messages.
- Highlights whether an alert is a reliability failure or an estimated spend alert.
- 5,000ms timeout per dispatch attempt.

### 3. Dry-Run Mode

Set `MONITORING_ALERT_DRY_RUN="true"`.
In dry-run mode:

- Evaluator evaluates metrics, checks thresholds, and constructs full notification messages.
- Logs formatted alert payloads with `[monitoring:dry-run]`.
- Skips network requests to Resend and webhook endpoints.
- Ideal for staging environments, CI testing, and threshold calibration.

---

## Environment Variables Reference

| Variable                                               | Type    | Default               | Description                                                                                          |
| :----------------------------------------------------- | :------ | :-------------------- | :--------------------------------------------------------------------------------------------------- |
| `MONITORING_REFRAME_STUCK_QUEUE_THRESHOLD_SECONDS`     | Integer | Optional              | Alert threshold in seconds for oldest waiting/active job in reframe queue.                           |
| `MONITORING_DUBBING_STUCK_QUEUE_THRESHOLD_SECONDS`     | Integer | Optional              | Alert threshold in seconds for oldest waiting/active job in dubbing queue.                           |
| `MONITORING_STUCK_QUEUE_THRESHOLD_SECONDS`             | Integer | Optional              | Default fallback stuck queue threshold for both pipelines.                                           |
| `MONITORING_GPU_SPEND_THRESHOLD_USD`                   | Number  | Optional              | Spend threshold in USD over observation window.                                                      |
| `MONITORING_GPU_HOURLY_RATE_USD`                       | Number  | Optional              | Configured hourly rate (e.g. `0.7104` for Sydney `g4dn.xlarge`). Required if spend threshold is set. |
| `MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS`      | Integer | Optional              | Observation window in seconds (must be whole minute multiple).                                       |
| `MONITORING_DUBBING_VENDOR_SPEND_THRESHOLD_USD`        | Number  | Optional              | Estimated spend threshold in USD for dubbing vendor.                                                 |
| `MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD`    | Number  | Optional              | Estimated cost per character (e.g. `0.0003`). Required if vendor spend threshold is set.             |
| `MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS` | Integer | Optional              | Observation window in seconds for vendor spend/usage.                                                |
| `MONITORING_ALERT_WEBHOOK_URL`                         | URL     | Optional              | Webhook endpoint for chat notifications (Slack / Discord / Teams).                                   |
| `MONITORING_ALERT_EMAIL_RECIPIENT`                     | String  | Optional              | Comma-separated list of recipient email addresses.                                                   |
| `MONITORING_ALERT_EMAIL_SENDER`                        | String  | `alerts@marvedge.com` | Verified sender address for alert emails.                                                            |
| `RESEND_API_KEY`                                       | String  | Optional              | API key for Resend email delivery.                                                                   |
| `MONITORING_ALERT_DRY_RUN`                             | Boolean | `false`               | When `true`, evaluates and logs notifications without making network calls.                          |
| `MONITORING_ALERT_COOLDOWN_SECONDS`                    | Integer | `300`                 | Cooldown period between repeated firing alerts for the same condition.                               |

---

## On-Call Runbook & Troubleshooting

### 1. `reframe_stuck_queue` or `dubbing_stuck_queue` Firing

1. **Verify Worker Health**:
   - Check if GPU or CPU worker processes are active: `docker compose ps` or host process monitor.
   - Inspect worker logs for deadlocks, OOM kills, or unhandled exceptions.
2. **Inspect BullMQ State**:
   - Verify Redis connection: `redis-cli ping`.
   - Inspect queue status using BullMQ commands or monitoring dashboards.
3. **Check Job Retries**:
   - Normal retry delays (backoffs) are excluded from stuck queue evaluation.
   - If jobs are permanently in `active` state, a worker may have crashed without acknowledging the job. BullMQ will stall and reassign after `stalledInterval`.

### 2. `gpu_spend_threshold` Firing

1. **Inspect Worker Activity**:
   - Review active job count and queue volume to see if a batch processing spike occurred.
2. **Confirm Pricing Model**:
   - Verify `MONITORING_GPU_HOURLY_RATE_USD` matches current AWS instance pricing for the deployment region.
3. **Verify EC2 Idle Shutdown**:
   - Confirm idle EC2 instances shut down as expected when queues clear.

### 3. Notification Delivery Failures

1. **Webhook Issues**:
   - Ensure the webhook URL has not been revoked or regenerated in Slack/Discord.
   - Check logs for HTTP status codes (e.g., 404, 400).
2. **Email Issues**:
   - Confirm `RESEND_API_KEY` is valid and active.
   - Ensure `MONITORING_ALERT_EMAIL_SENDER` domain is verified in Resend.
