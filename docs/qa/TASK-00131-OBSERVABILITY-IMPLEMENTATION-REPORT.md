# Task-00131: Observability Dashboards, Query Catalog & Actionable On-Call Runbook Implementation Report

**Date:** 2026-11-12  
**Repository:** `Marvedge/marvedge`  
**Working Branch:** `task/task-00130`  
**Base Commit:** `b0490cb9f60ee025d160e19d9718c1f94b73a434` (origin/master)  
**Status:** IMPLEMENTATION COMPLETE — VERIFIED

---

## Executive Summary

Task-00131 requested adding dashboards or log queries for latency, failures, and queue depth, and extending the on-call runbook with actionable procedures for checking system health and safely restarting stuck jobs.

In accordance with strict safety constraints and the audit recommendations, **zero application code changes were required**. Instead, the operational capabilities of Marvedge's existing `@prometheus-io/client` telemetry, BullMQ state engine, and systemd services were leveraged to deliver:

1. **Deliverable 1: A Dedicated Observability & Query Catalog** (`docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md`) providing exact copy-paste PromQL queries for p50/p95/p99 latency quantiles, rolling failure rates, queue backlogs, and corresponding `journalctl` / CloudWatch Logs Insights queries.
2. **Deliverable 2: Enhanced Actionable On-Call Runbook** (`docs/ON_CALL_RUNBOOK.md`) adding §9.1 through §9.4 with diagnostic trees for latency spikes, rising failure rates, queue stalls, and a concrete, safe, 5-step BullMQ job recovery workflow that prevents duplicate GPU processing and billing.

---

## 1. Files Created and Modified

| File Path                                                   | Action                   | Description                                                                                                                                                                                                                      |
| :---------------------------------------------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md`           | **Created**              | Comprehensive catalog of verified PromQL expressions for latency, failures, and queue depth, along with operational systemd `journalctl` commands and CloudWatch Logs Insights queries.                                          |
| `docs/ON_CALL_RUNBOOK.md`                                   | **Modified**             | Extended Section 9 with subsections 9.1 (Elevated Latency Triage), 9.2 (Job Failure Investigation), 9.3 (Stuck Queue Diagnosis), and 9.4 (Actionable Stuck-Job Recovery Procedure). Preserved all pre-existing runbook sections. |
| `docs/qa/TASK-00131-OBSERVABILITY-READINESS-AUDIT.md`       | **Created** (Prior Step) | Initial readiness audit and gap analysis report.                                                                                                                                                                                 |
| `docs/qa/TASK-00131-OBSERVABILITY-IMPLEMENTATION-REPORT.md` | **Created**              | This formal implementation and verification report.                                                                                                                                                                              |

---

## 2. Metric and PromQL Query Inventory

All queries use the verified Prometheus metrics exposed at `/api/monitoring/metrics`:

### Latency Percentiles

- **Reframe ML Inference p50 / p95 / p99:**
  - `histogram_quantile(0.50, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))`
  - `histogram_quantile(0.95, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))`
  - `histogram_quantile(0.99, sum(rate(marvedge_reframe_inference_duration_seconds_bucket{status="completed"}[5m])) by (le))`
- **Dubbing Pipeline p50 / p95 / p99:**
  - `histogram_quantile(0.50, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))`
  - `histogram_quantile(0.95, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))`
  - `histogram_quantile(0.99, sum(rate(marvedge_dubbing_duration_seconds_bucket{status="completed"}[10m])) by (le))`
- **Completed vs. Failed Processing Duration:**
  - `sum(rate(marvedge_reframe_inference_duration_seconds_sum[5m])) by (status) / sum(rate(marvedge_reframe_inference_duration_seconds_count[5m])) by (status)`

### Failure Rates & Outcomes

- **Terminal Job Failure Rate (Rolling 5m Window):**
  - `sum(rate(marvedge_jobs_total{status="failed"}[5m])) / sum(rate(marvedge_jobs_total[5m]))`
- **Pipeline-Specific Terminal Failures:**
  - `sum(rate(marvedge_jobs_total{status="failed"}[5m])) by (pipeline)`
- **Success Percentage:**
  - `(sum(rate(marvedge_jobs_total{status="completed"}[5m])) by (pipeline) / sum(rate(marvedge_jobs_total[5m])) by (pipeline)) * 100`

### Queue Depth & Backlog

- **Backlog by State (`waiting`, `active`, `delayed`, `failed`):**
  - `sum(marvedge_queue_depth) by (pipeline, state)`
- **Waiting Backlog vs. Thresholds:**
  - `marvedge_queue_depth{pipeline="reframe", state="waiting"}` (Threshold: > 100)
  - `marvedge_queue_depth{pipeline="dubbing", state="waiting"}` (Threshold: > 50)
- **Active Worker Capacity:**
  - `marvedge_queue_depth{state="active"}`

---

## 3. Runbook Enhancements Added

`docs/ON_CALL_RUNBOOK.md` was enhanced with structured, operational triage trees:

- **§9.1 Diagnosing elevated processing latency:** Explains how to distinguish outlier large video files from host hardware saturation using p50 vs. p95 quantiles, host inspection via `nvidia-smi` and `htop`, and container health checks against ML Gateway (`http://127.0.0.1:8000/health`).
- **§9.2 Investigating rising job failure rates:** Differentiates intermediate retry delays (`delayed` queue state) from exhausted terminal failures, and categorizes error signatures (`ECONNREFUSED`, `Cloudinary upload failed`, `Callback 500`, `UnrecoverableError`).
- **§9.3 Diagnosing stuck queues:** Analyzes queue starvation (`waiting > 0, active == 0`) versus queue stall (`active > 0` beyond timeout), highlighting the empty queue zero false-alarm guarantee.
- **§9.4 Actionable Stuck-Job Recovery Procedure:** Introduces a safe 5-step operational runbook procedure.

---

## 4. Stuck-Job Recovery Procedure & Implementation Evidence

### Verified Architecture & BullMQ Methods

Inspection of the installed BullMQ library (`version 5.78.0`) and `app/lib/queue.ts` confirmed:

- Queues: `reframe-processing` (attempts: 3, backoff: 2s) and `dubbing-processing` (attempts: 2, backoff: 5s).
- Verified BullMQ Job Methods: `job.getState()`, `job.retry()`, `job.moveToFailed()`, `job.discard()`.

### Safe Recovery Workflow (§9.4):

1. **Step 1: Read-Only Job Identification:** Operators run a safe inspection command via `app/lib/queue.ts` to retrieve the oldest active jobs, job data payloads, `processedOn` timestamps, and attempt counts without modifying any state.
2. **Step 2: Check Worker Process Liveness:** Operators verify whether the worker process PID is actively executing via `ps aux` and `nvidia-smi`, preventing the interruption of valid long-running jobs.
3. **Step 3: Check External Output Artifacts (Duplicate Spend Prevention):** Operators check Cloudinary/S3 keys (`reframe/<job-id>`) and PostgreSQL status before re-running compute. If the video was already rendered and uploaded, the database status is synchronized rather than incurring duplicate GPU compute costs.
4. **Step 4: Executable BullMQ Recovery:** If an orphaned or hung job is confirmed:
   - For `state === "failed"`, calls supported `await job.retry()`.
   - For `state === "active"` (orphaned worker crash), calls `await job.moveToFailed(err, '0', true)` followed by `await job.retry()`, cleanly clearing stale locks and moving the job back to `waiting`.
   - Explicitly rejects manual Redis key deletion or arbitrary script hacks.
5. **Step 5: Verify Recovery:** Operators confirm queue backlog increments, observe worker pickup in `journalctl -u marvedge-reframe-worker -f`, and verify resolution of the monitoring alert.

---

## 5. Validation Results

1. **PromQL Syntax & Metric Alignment:**
   - Every metric name and label was verified against `app/lib/monitoring/metrics.ts` and `app/lib/monitoring/queueMetrics.ts`.
   - Histogram bucket intervals (`[0.1, ... 120]` for reframe, `[1, ... 600]` for dubbing) match the exact configured boundaries.
2. **Codebase Test Suite Verification:**
   - The entire monitoring test suite was executed:
     `npx vitest run app/lib/monitoring/`
     **Result:** **15 test files passed, 91 tests passed, 0 failures**.
3. **Markdown & Formatting Compliance:**
   - Prettier formatting was run on all modified and newly created markdown files:
     `npx prettier --write "docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md" "docs/ON_CALL_RUNBOOK.md"`
     **Result:** All files formatted cleanly with 0 syntax or whitespace errors (`git diff --check` passed).

---

## 6. Git State & Branch Safety

- **Branch Check:** Confirmed working tree is on `task/task-00130` (tracking `origin/master`).
- **File Safety:** All untracked QA audits (`MARVEDGE-FINAL-CLOSURE-AUDIT.md`, `TASK-00018-DEV-INTEGRATION-VALIDATION.md`, `TASK-00130-*.md`) and test scripts were strictly preserved.
- **Zero Accidental Changes:** No application code, environment files, or infrastructure scripts were altered.
