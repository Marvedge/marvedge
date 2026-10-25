# Task-00095: Stage 1 — Local Concurrent Load & Graceful Degradation Report

- **Date:** 2026-10-25T15:51:00.000Z
- **Workspace:** `marvedge-task-00095`
- **Branch:** `task/task-00095-concurrent-load-testing`
- **Execution Mode:** `SIMULATED_TEST_DOUBLE` (Zero cloud cost, in-memory mock doubles)
- **Production Concurrency Guardrails Verified:** Initial = 1, Peak Approved = 4

> **CRITICAL ARCHITECTURAL DISTINCTION:**
> - **Simulated In-Memory Benchmark:** Measures worker orchestration, BullMQ state machine transitions, retry backoffs, and center-crop fallback mechanisms using fast in-memory doubles.
> - **Simulated Throughput != Hardware Performance:** The simulated throughput (11–51 jobs/s) reflects in-memory mock completion speeds and must NOT be interpreted as measured Tesla T4 GPU hardware throughput.
> - **Real In-VPC GPU Testing:** Documented below as **PENDING** until the stopped EC2 GPU worker instance is powered on.

---

## 1. Summary of Simulated Concurrency Scenarios

| Scenario Name | Concurrency | Total Jobs | Completed | Failed | Fallbacks | Elapsed (ms) | Throughput (jobs/s) | P50 (ms) | P95 (ms) | Max (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| `concurrency_1_baseline` | **1** | 4 | 4 | 0 | 0 | 335 | **11.94** | 79 | 96 | 96 |
| `concurrency_2_scaling` | **2** | 8 | 8 | 0 | 0 | 369 | **21.68** | 89 | 94 | 94 |
| `concurrency_4_peak` | **4** | 16 | 16 | 0 | 0 | 313 | **51.12** | 64 | 93 | 93 |
| `degradation_autoflip_empty_targets` | **2** | 4 | 4 | 0 | 4 | 124 | **32.26** | 62 | 63 | 63 |
| `degradation_transient_gateway_timeout` | **2** | 4 | 4 | 0 | 4 | 265 | **15.09** | 125 | 138 | 138 |

---

## 2. Graceful Degradation & Resilience Evidence

### Scenario: `degradation_autoflip_empty_targets`
- **Observed Fallbacks:** 4 of 4 jobs triggered graceful degradation.
- **Completion Rate:** 100% completed without unhandled exceptions.
- **Immediate Fallback Contract:** AutoFlip returning 0 targets triggers immediate static center-crop without wasting retries.
- **Sample Fallback Reasons Recorded:**
  - Job `load-degradation_autoflip_empty_targets-job-001`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1
  - Job `load-degradation_autoflip_empty_targets-job-002`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1
  - Job `load-degradation_autoflip_empty_targets-job-003`: Reason = `AUTOFLIP_EMPTY_CROP_TARGETS`, Attempts = 1

### Scenario: `degradation_transient_gateway_timeout`
- **Observed Fallbacks:** 4 of 4 jobs triggered graceful degradation.
- **Completion Rate:** 100% completed without unhandled exceptions.
- **Retry Backoff & Fallback Contract:** Transient HTTP 504 errors retried up to 3 attempts with exponential backoff before falling back to center-crop on attempt 3.
- **Sample Fallback Reasons Recorded:**
  - Job `load-degradation_transient_gateway_timeout-job-001`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3
  - Job `load-degradation_transient_gateway_timeout-job-002`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3
  - Job `load-degradation_transient_gateway_timeout-job-003`: Reason = `AUTOFLIP_RETRY_EXHAUSTED`, Attempts = 3

---

## 3. Concurrency Scaling Efficiency (Simulated)

- **Concurrency 1 Throughput:** 11.94 jobs/s
- **Concurrency 4 Throughput:** 51.12 jobs/s
- **Simulated Scaling Speedup:** **4.28x** under controlled simulation.

---

## 4. Previously Reported Vitest Regression Results

The earlier report recorded 74 passing tests across the following suites:

| Test Suite | Previously Reported Tests | Status in This Review |
|---|---:|---|
| `scripts/benchmark/concurrentLoadRunner.test.ts` | 8 passed | Not independently reverified |
| `reframe-worker/config.test.ts` | 9 passed | Not independently reverified |
| `reframe-worker/orchestrator.test.ts` | 57 passed | Not independently reverified |

**Previously reported total:** 74 passed, 0 failed.

**Verification limitation:** These results were recorded during earlier testing. They could not be independently reproduced in the current environment because of a Vitest dependency-version mismatch. Do not treat them as freshly verified results from this review.

The callback mapping regression tests added during this review are separate: **3 passed, 0 failed**, using Node's built-in test runner.

---

## 5. Real In-VPC GPU Load Testing Status

- **Status:** **PENDING / DEFERRED**
- **In-VPC Harness:** `infra/gpu-deployment/in_vpc_load_test.mjs` is fully implemented and audited.
- **Target Host:** AWS EC2 `g4dn.xlarge` instance `i-02aa4578f3790bae1` (NVIDIA Tesla T4 GPU).
- **Current State:** Instance is intentionally STOPPED to prevent compute charges.
- **Execution Prerequisites Before Running In-VPC:**
  1. Authorize starting instance `i-02aa4578f3790bae1` via `aws ec2 start-instances`.
  2. Launch worker with isolated test queue: `REFRAME_QUEUE_NAME=reframe-benchmark-queue node node_modules/tsx/dist/cli.mjs reframe-worker/index.ts`.
  3. Execute in-VPC load test script: `node infra/gpu-deployment/in_vpc_load_test.mjs --concurrency 4 --total-jobs 8 --queue-name reframe-benchmark-queue`.
  4. Verify NVIDIA SMI GPU utilization, VRAM usage, and queue drain rate.
  5. Stop EC2 instance immediately post-test via `scripts/watchdog-ec2-session.ps1` or AWS CLI.
