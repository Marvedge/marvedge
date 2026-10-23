# Task-00095: Stage 1 — Local Concurrent Load & Graceful Degradation Report

- **Date:** 2026-10-22T10:44:52.175Z
- **Workspace:** `marvedge-task-00095`
- **Branch:** `task/task-00095-concurrent-load-testing`
- **Execution Mode:** `SIMULATED_TEST_DOUBLE` (Zero cloud cost, no GPU/AWS resources used)
- **Production Concurrency Guardrails Verified:** Initial = 1, Peak Approved = 4

> **NOTICE:** This report reflects simulated execution against controlled in-memory test doubles.
> Concurrency levels conform strictly to production guardrails in `app/lib/config/concurrency.ts`.

## 1. Summary of Concurrency Scenarios

| Scenario Name | Concurrency | Total Jobs | Completed | Failed | Fallbacks | Elapsed (ms) | Throughput (jobs/s) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| `concurrency_1_baseline` | **1** | 4 | 4 | 0 | 0 | 299 | **13.38** | 73 | 86 | 86 |
| `concurrency_2_scaling` | **2** | 8 | 8 | 0 | 0 | 283 | **28.27** | 70 | 76 | 76 |
| `concurrency_4_peak` | **4** | 16 | 16 | 0 | 0 | 327 | **48.93** | 76 | 87 | 87 |
| `degradation_autoflip_empty_targets` | **2** | 4 | 4 | 0 | 4 | 122 | **32.79** | 55 | 68 | 68 |
| `degradation_transient_gateway_timeout` | **2** | 4 | 4 | 0 | 4 | 275 | **14.55** | 130 | 142 | 142 |

## 2. Graceful Degradation & Resilience Evidence

### Scenario: `degradation_autoflip_empty_targets`
- **Observed Fallbacks:** 4 of 4 jobs triggered graceful degradation.
- **Completion Rate:** 100% completed without unhandled exceptions.
- **Sample Fallback Reasons Recorded:**
  - Job `load-degradation_autoflip_empty_targets-job-001`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1
  - Job `load-degradation_autoflip_empty_targets-job-002`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1
  - Job `load-degradation_autoflip_empty_targets-job-003`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1

### Scenario: `degradation_transient_gateway_timeout`
- **Observed Fallbacks:** 4 of 4 jobs triggered graceful degradation.
- **Completion Rate:** 100% completed without unhandled exceptions.
- **Sample Fallback Reasons Recorded:**
  - Job `load-degradation_transient_gateway_timeout-job-001`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3
  - Job `load-degradation_transient_gateway_timeout-job-002`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3
  - Job `load-degradation_transient_gateway_timeout-job-003`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3

## 3. Concurrency Scaling Efficiency

- **Concurrency 1 Throughput:** 13.38 jobs/s
- **Concurrency 4 Throughput:** 48.93 jobs/s
- **Measured Scaling Speedup:** **3.66×** under controlled simulation.
