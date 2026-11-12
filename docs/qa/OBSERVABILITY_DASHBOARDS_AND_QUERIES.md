# Marvedge Observability Dashboards & PromQL Query Catalog

**Task:** Task-00131 (Observability Dashboard & On-Call Runbook)  
**Endpoint:** `/api/monitoring/metrics` (Header: `x-marvedge-rollup-secret: ${OVERLAYS_ROLLUP_SECRET}`)  
**Telemetry Engine:** `@prometheus-io/client` registry (`app/lib/monitoring/metrics.ts`)  
**Daemon Supervisor:** systemd (`marvedge-monitoring-alerts.service`)

---

## Overview

This catalog provides copy-paste-ready PromQL and operational log queries for monitoring Marvedge's core video processing pipelines (`reframe-processing` and `dubbing-processing`). Every query maps directly to verified metrics and label dimensions defined in the codebase.

### Metric Inventory & Label Reference

| Metric Name                                   | Type      | Label Dimensions                                                                            | Buckets / Ranges                               | Code Source                          |
| :-------------------------------------------- | :-------- | :------------------------------------------------------------------------------------------ | :--------------------------------------------- | :----------------------------------- |
| `marvedge_reframe_inference_duration_seconds` | Histogram | `status="completed" \| "failed"`                                                            | `[0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120]` | `app/lib/monitoring/metrics.ts`      |
| `marvedge_dubbing_duration_seconds`           | Histogram | `status="completed" \| "failed"`                                                            | `[1, 5, 10, 30, 60, 120, 300, 600]`            | `app/lib/monitoring/metrics.ts`      |
| `marvedge_jobs_total`                         | Counter   | `pipeline="reframe" \| "dubbing"`<br>`status="completed" \| "failed"`                       | Cumulative integer counter                     | `app/lib/monitoring/metrics.ts`      |
| `marvedge_queue_depth`                        | Gauge     | `pipeline="reframe" \| "dubbing"`<br>`state="waiting" \| "active" \| "delayed" \| "failed"` | Real-time queue job counts                     | `app/lib/monitoring/queueMetrics.ts` |

---

## 1. Latency Queries (PromQL)

### 1.1 Reframe ML Inference Latency Percentiles (p50, p95, p99)

Measures the duration of face tracking and AutoFlip reframing execution on the GPU worker.

- **Median (p50) Latency:**
  ```promql
  histogram_quantile(0.50, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))
  ```
- **95th Percentile (p95) Latency:**
  ```promql
  histogram_quantile(0.95, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))
  ```
- **99th Percentile (p99) Latency:**
  ```promql
  histogram_quantile(0.99, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))
  ```
- **Interpretation:**
  - _Baseline:_ Normal p50 is 2.5s–5.0s per clip; p95 is < 10.0s.
  - _Symptom:_ p95 > 10.0s breaches the default alert threshold (`MONITORING_REFRAME_INFERENCE_LATENCY_THRESHOLD_SECONDS="10"`).
  - _Next Action:_ Check GPU compute load (`nvidia-smi` on EC2) and inspect TalkNet/AutoFlip container health (`curl http://127.0.0.1:8000/health`).

### 1.2 Dubbing Pipeline Latency Percentiles (p50, p95, p99)

Measures end-to-end voice dubbing duration (including ElevenLabs synthesis and audio-video remuxing).

- **Median (p50) Latency:**
  ```promql
  histogram_quantile(0.50, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))
  ```
- **95th Percentile (p95) Latency:**
  ```promql
  histogram_quantile(0.95, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))
  ```
- **99th Percentile (p99) Latency:**
  ```promql
  histogram_quantile(0.99, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))
  ```
- **Interpretation:**
  - _Baseline:_ Dubbing p50 is ~30s–60s depending on speech duration; p95 < 120.0s.
  - _Symptom:_ p95 > 120.0s triggers `dubbing_processing_latency` alert (`MONITORING_DUBBING_LATENCY_THRESHOLD_SECONDS="120"`).
  - _Next Action:_ Inspect vendor API latency (ElevenLabs) and check CPU/network contention on the video worker host.

### 1.3 Completed vs. Failed Processing Duration

Compares execution duration between successful runs and runs that ended in an error.

```promql
sum(rate(marvedge_reframe_inference_duration_seconds_sum[5m])) by (status)
/
sum(rate(marvedge_reframe_inference_duration_seconds_count[5m])) by (status)
```

- **Interpretation:**
  - If `status="failed"` duration is very low (< 0.5s), jobs are fast-failing during input validation or credential pre-checks.
  - If `status="failed"` duration matches or exceeds 180s, jobs are timing out against downstream ML services (`REFRAME_ML_TIMEOUT_MS=180000`).

---

## 2. Failure & Reliability Queries (PromQL)

### 2.1 Terminal Job Failure Rate (Rolling 5-Minute Window)

Calculates the ratio of terminal failures to total processed jobs. Intermediate retries during exponential backoff are excluded from `marvedge_jobs_total{status="failed"}`.

```promql
sum(rate(marvedge_jobs_total{status="failed"}[5m]))
/
sum(rate(marvedge_jobs_total[5m]))
```

- **Interpretation:**
  - _Baseline:_ 0.0 (0%).
  - _Symptom:_ Value > 0.20 (20%) triggers `reframe_job_failure_rate` or `dubbing_job_failure_rate` alert.
  - _Next Action:_ Inspect worker logs for recurring stack traces and verify external storage/database availability.

### 2.2 Terminal Failures Breakdown by Pipeline

Displays the rate of terminal job failures per pipeline.

```promql
sum(rate(marvedge_jobs_total{status="failed"}[5m])) by (pipeline)
```

- **Interpretation:**
  - Identifies whether failures are isolated to `reframe` (GPU/AutoFlip) or `dubbing` (audio synthesis/FFmpeg).

### 2.3 Success Rate Percentage by Pipeline

Tracks real-time pipeline reliability as a percentage.

```promql
(
  sum(rate(marvedge_jobs_total{status="completed"}[5m])) by (pipeline)
  /
  sum(rate(marvedge_jobs_total[5m])) by (pipeline)
) * 100
```

- **Interpretation:**
  - SLO target: $\ge 99.0\%$. Value $< 95.0\%$ indicates active degradation.

---

## 3. Queue Depth & Backlog Queries (PromQL)

### 3.1 Queue Backlog by State (Waiting, Active, Delayed, Failed)

Shows the exact distribution of BullMQ jobs across states for both pipelines.

```promql
sum(marvedge_queue_depth) by (pipeline, state)
```

- **Interpretation:**
  - `state="waiting"`: Backlog awaiting available worker concurrency.
  - `state="active"`: Currently in-flight jobs.
  - `state="delayed"`: Jobs in exponential retry backoff (normal during transient hiccups).
  - `state="failed"`: Terminal failures preserved in BullMQ dead-letter set (`removeOnFail: 500` for reframe, `1000` for dubbing).

### 3.2 Total Waiting Backlog vs. Threshold

Monitors queue starvation against configured queue depth thresholds.

- **Reframe Queue Backlog:**

  ```promql
  marvedge_queue_depth{pipeline="reframe", state="waiting"}
  ```

  _Threshold:_ Triggers `reframe_queue_depth` alert if $> 100$ (`MONITORING_REFRAME_QUEUE_DEPTH_THRESHOLD="100"`).

- **Dubbing Queue Backlog:**
  ```promql
  marvedge_queue_depth{pipeline="dubbing", state="waiting"}
  ```
  _Threshold:_ Triggers `dubbing_queue_depth` alert if $> 50$ (`MONITORING_DUBBING_QUEUE_DEPTH_THRESHOLD="50"`).

### 3.3 Active Worker Capacity Utilization

Compares active processing count against worker concurrency limits (`REFRAME_WORKER_CONCURRENCY`, default 3).

```promql
marvedge_queue_depth{state="active"}
```

- **Interpretation:**
  - If `active == 0` while `waiting > 0`, workers are stopped, crashed, or disconnected from Redis.
  - If `active == concurrency` for extended periods, workers are saturated.

---

## 4. Operational Log Queries (Systemd journalctl)

The following commands run directly on the EC2 GPU worker or application host to investigate incidents identified via the PromQL queries above.

### 4.1 Worker Service Inspection

- **Reframe Worker (Lightweight GPU Queue Consumer):**

  ```bash
  # View live trailing logs
  sudo journalctl -u marvedge-reframe-worker -f --no-pager

  # View errors in the last 1 hour
  sudo journalctl -u marvedge-reframe-worker --since "1 hour ago" -p err --no-pager
  ```

- **Video Worker (FFmpeg / Dubbing Consumer):**

  ```bash
  sudo journalctl -u marvedge-video-worker -f --no-pager
  ```

- **Monitoring Alert Evaluator:**
  ```bash
  sudo journalctl -u marvedge-monitoring-alerts --since "30 minutes ago" --no-pager
  ```

### 4.2 Error & Stack Trace Filtering

Extract concise failure entries across BullMQ jobs:

```bash
# Filter BullMQ job failures with error messages and attempt counts
sudo journalctl -u marvedge-reframe-worker --since "2 hours ago" --no-pager | grep -E "\[reframe-worker\] BullMQ Job failed"

# Filter ML service connection/timeout errors
sudo journalctl -u marvedge-reframe-worker --since "2 hours ago" --no-pager | grep -E "(ECONNREFUSED|ETIMEDOUT|500 Internal Server Error)"
```

### 4.3 Job ID Correlation

Trace the complete lifecycle of an individual job across worker logs using its application or BullMQ ID:

```bash
# Trace specific job ID (e.g. job-abc-123)
sudo journalctl -u marvedge-reframe-worker --since "6 hours ago" --no-pager | grep "job-abc-123"
```

Log output will reveal:

1. `Starting lightweight Reframe Worker...`
2. `BullMQ Job active...`
3. Inference latency duration
4. Callback POST to `/api/jobs/callback`
5. Terminal `BullMQ Job completed` or `BullMQ Job failed`

---

## 5. CloudWatch Logs Insights Queries

Where workers stream logs to AWS CloudWatch Logs (via `awslogs` Docker driver or CloudWatch Agent), run these queries in **CloudWatch > Logs Insights**:

### 5.1 Terminal Job Failures with Error Details

```sql
fields @timestamp, @message
| filter @message like /\[reframe-worker\] BullMQ Job failed/
| parse @message "BullMQ Job failed: * (data.jobId=*, attemptsMade=*): *" as bullmqId, jobId, attempts, errorMsg
| sort @timestamp desc
| limit 100
```

### 5.2 Reframe Latency Extraction & Slow Job Identification

```sql
fields @timestamp, @message
| filter @message like /Inference completed in/ or @message like /durationSeconds/
| sort @timestamp desc
| limit 50
```

### 5.3 Alert Evaluator Firing & Recovery Events

```sql
fields @timestamp, @message
| filter @message like /\[monitoring\]/
| filter @message like /"status":"firing"/ or @message like /"status":"resolved"/
| sort @timestamp desc
| limit 100
```
