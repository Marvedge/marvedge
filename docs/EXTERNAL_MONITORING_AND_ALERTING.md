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
- **Redis-backed state persistence**: Prevents duplicate notifications across process restarts and coordinates concurrent evaluators atomically.

---

## Alert Rules & Supported Metrics

| Alert Name                       | Pipeline   | Category       | What It Measures              | Alert Condition / Breach Formula                                                                 |
| :------------------------------- | :--------- | :------------- | :---------------------------- | :----------------------------------------------------------------------------------------------- |
| `reframe_stuck_queue`            | Reframe    | Queue Latency  | Oldest active/waiting job age | $\text{Oldest uncompleted job age in seconds} > \text{threshold}$ (zero false alarms when empty) |
| `dubbing_stuck_queue`            | Dubbing    | Queue Latency  | Oldest active/waiting job age | $\text{Oldest uncompleted job age in seconds} > \text{threshold}$ (zero false alarms when empty) |
| `reframe_job_failure_rate`       | Reframe    | Worker Quality | Terminal job failure ratio    | $\frac{\text{Failed terminal jobs}}{\text{Total completed + failed}} > \text{threshold}$         |
| `dubbing_job_failure_rate`       | Dubbing    | Worker Quality | Terminal job failure ratio    | $\frac{\text{Failed terminal jobs}}{\text{Total completed + failed}} > \text{threshold}$         |
| `reframe_queue_depth`            | Reframe    | Queue Backlog  | Waiting job count in BullMQ   | $\text{Waiting jobs} > \text{threshold}$                                                         |
| `dubbing_queue_depth`            | Dubbing    | Queue Backlog  | Waiting job count in BullMQ   | $\text{Waiting jobs} > \text{threshold}$                                                         |
| `reframe_inference_latency`      | Reframe    | Worker Latency | Mean model execution duration | $\text{Mean histogram duration} > \text{threshold}$                                              |
| `dubbing_processing_latency`     | Dubbing    | Worker Latency | Mean dubbing duration         | $\text{Mean histogram duration} > \text{threshold}$                                              |
| `gpu_hours_threshold`            | Reframe    | Resource Usage | GPU worker active runtime     | $\frac{\text{Active worker execution seconds}}{3600} > \text{threshold GPU hours}$               |
| `gpu_spend_threshold`            | Reframe    | Estimated Cost | Estimated GPU compute spend   | $\text{GPU hours} \times \text{hourly rate USD} > \text{threshold USD}$                          |
| `dubbing_vendor_spend_threshold` | Dubbing    | Estimated Cost | Estimated vendor spend        | $\text{characters} \times \text{unit rate USD} > \text{threshold USD}$                           |
| `dubbing_vendor_usage_threshold` | Dubbing    | Usage          | Vendor character volume       | ElevenLabs character consumption $>$ threshold                                                   |
| `monitoring_data_unavailable`    | Monitoring | System Scrape  | Telemetry collection health   | Telemetry metric inspection failed or queue unreachable                                          |

---

## Alert State Persistence & Concurrency Safety

Alert state tracking ensures high operational reliability across process lifecycles and horizontal scaling:

1. **Stable State Storage**: Alert state is keyed by stable identifier:
   `marvedge:monitoring:alert:v1:state:${alertName}`
2. **Atomic State Transitions**: Evaluators execute an atomic Redis Lua script (`transitionLuaScript`) that reads existing state and executes transitions in a single atomic operation:
   - `EMIT_FIRING`: Condition breaches threshold and cooldown has elapsed.
   - `EMIT_RESOLVED`: Condition returns below threshold; emits recovery notification **exactly once**.
   - `SUPPRESSED`: Condition remains firing but within cooldown, or concurrent evaluation was already recorded.
   - `NOOP`: Condition is healthy and was already resolved; no duplicate messages.
3. **Multi-Process Concurrency**: Multiple evaluator processes running concurrently cannot emit duplicate notifications for the same breach; only the first evaluator executing the Lua script transitions state, while concurrent evaluators receive `SUPPRESSED`.
4. **Cross-Restart Cooldown Persistence**: If an evaluator crashes and restarts, previous `lastFiringAt` timestamps are loaded from Redis, preventing alert re-triggering within cooldown windows.
5. **Notification Storm Prevention**: When Redis reconnects after a transient disconnection, existing keys in Redis are preserved with their `lastFiringAt` intact. Evaluators will not refire firing alerts unless the cooldown period has legitimately expired.
6. **Automatic Cleanup (TTL)**: All state keys in Redis use a configurable TTL (default 7 days / 604,800 seconds via `MONITORING_ALERT_STATE_TTL_SECONDS`) preventing unbounded Redis memory growth.
7. **Resilient In-Memory Fallback & Degraded Mode Disclosure**: If Redis is offline or commands time out, the system automatically logs a diagnostic warning and delegates to a process-local in-memory store. Evaluators never crash or unhandled-reject due to Redis errors. _Degraded mode disclosure:_ While operating in in-memory fallback, single-process deduplication and cooldowns remain active, but cross-process deduplication across multiple host instances cannot be guaranteed until Redis connectivity is restored.
8. **Never Treat Missing Data as Healthy**: If queues, Redis, or Prometheus data sources cannot be reached, pipeline alerts are skipped (never assumed to be 0 or healthy), and a separate `monitoring_data_unavailable` alert is triggered.
9. **Notification Delivery Failure Recovery**: If an alert breaches threshold but external dispatch fails on all configured channels (e.g. transient HTTP 5xx or network drops), the evaluator resets the cooldown for that alert so the subsequent evaluation tick immediately retries delivery rather than suppressing on-call alerts for the full cooldown window.

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

## Runtime Deployment & Process Supervision

The independent monitoring evaluator runs as a dedicated Node.js/TS process (`scripts/monitoringAlerts.ts`).

### Systemd Service Configuration

A production-grade systemd service definition is provided in:
`infra/gpu-deployment/marvedge-monitoring-alerts.service`

```ini
[Unit]
Description=Marvedge External Monitoring and Alert Evaluator
After=network.target redis.service
Wants=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/marvedge
EnvironmentFile=/etc/marvedge/monitoring.env
ExecStart=/usr/bin/node node_modules/tsx/dist/cli.mjs scripts/monitoringAlerts.ts
Restart=always
RestartSec=10s
TimeoutStopSec=30s
KillMode=process
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marvedge-monitoring-alerts

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### Operational Characteristics

- **Automatic Restart on Failure**: Configured with `Restart=always` and `RestartSec=10s`.
- **Graceful Shutdown**: Handles `SIGTERM` and `SIGINT` signals, halts the alert evaluation loop, awaits inflight evaluations, and cleanly closes BullMQ queues and Redis connections within `TimeoutStopSec=30s`.
- **Concurrency & Singleton Safety**: Systemd manages a single service instance. If horizontal instances run (e.g. during deployment transitions), Redis-backed atomic Lua operations guarantee that notifications are never duplicated.
- **Deployment Status**: The service definition is versioned in the repository. It is configured for host deployment but remains inactive until provisioned on running infrastructure (preserving stopped EC2 instance constraints).

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

| Variable                                               | Type    | Default               | Description                                                                                           |
| :----------------------------------------------------- | :------ | :-------------------- | :---------------------------------------------------------------------------------------------------- |
| `MONITORING_REFRAME_STUCK_QUEUE_THRESHOLD_SECONDS`     | Integer | Optional              | Alert threshold in seconds for oldest waiting/active job in reframe queue.                            |
| `MONITORING_DUBBING_STUCK_QUEUE_THRESHOLD_SECONDS`     | Integer | Optional              | Alert threshold in seconds for oldest waiting/active job in dubbing queue.                            |
| `MONITORING_STUCK_QUEUE_THRESHOLD_SECONDS`             | Integer | Optional              | Default fallback stuck queue threshold for both pipelines.                                            |
| `MONITORING_GPU_SPEND_THRESHOLD_USD`                   | Number  | Optional              | Spend threshold in USD over observation window.                                                       |
| `MONITORING_GPU_HOURLY_RATE_USD`                       | Number  | Optional              | Configured hourly rate (e.g. `0.7104` for Sydney `g4dn.xlarge`). Required if spend threshold is set.  |
| `MONITORING_GPU_HOURS_OBSERVATION_WINDOW_SECONDS`      | Integer | Optional              | Observation window in seconds (must be whole minute multiple).                                        |
| `MONITORING_DUBBING_VENDOR_SPEND_THRESHOLD_USD`        | Number  | Optional              | Estimated spend threshold in USD for dubbing vendor.                                                  |
| `MONITORING_DUBBING_VENDOR_ESTIMATED_UNIT_COST_USD`    | Number  | Optional              | Estimated cost per character (e.g. `0.0003`). Required if vendor spend threshold is set.              |
| `MONITORING_DUBBING_VENDOR_OBSERVATION_WINDOW_SECONDS` | Integer | Optional              | Observation window in seconds for vendor spend/usage.                                                 |
| `MONITORING_ALERT_WEBHOOK_URL`                         | URL     | Optional              | Webhook endpoint for chat notifications (Slack / Discord / Teams).                                    |
| `MONITORING_ALERT_EMAIL_RECIPIENT`                     | String  | Optional              | Comma-separated list of recipient email addresses.                                                    |
| `MONITORING_ALERT_EMAIL_SENDER`                        | String  | `alerts@marvedge.com` | Verified sender address for alert emails.                                                             |
| `RESEND_API_KEY`                                       | String  | Optional              | API key for Resend email delivery.                                                                    |
| `MONITORING_ALERT_DRY_RUN`                             | Boolean | `false`               | When `true`, evaluates and logs notifications without making network calls.                           |
| `MONITORING_ALERT_COOLDOWN_SECONDS`                    | Integer | `300`                 | Cooldown period between repeated firing alerts for the same condition.                                |
| `MONITORING_ALERT_STATE_TTL_SECONDS`                   | Integer | `604800`              | Redis TTL in seconds (7 days) for persisted alert state keys (`marvedge:monitoring:alert:v1:state:*`) |

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

### 4. `monitoring_data_unavailable` Firing

1. **Check Redis Connectivity**:
   - Confirm Redis daemon is reachable: `redis-cli ping`.
2. **Check BullMQ Queue Connectivity**:
   - Verify worker and API connectivity to `reframe-processing` and `dubbing-processing` queues.
3. **Inspect Logs**:
   - Inspect monitoring evaluator logs for specific connection timeout or socket error details.
