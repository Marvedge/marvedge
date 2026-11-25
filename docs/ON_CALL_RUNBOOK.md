# Marvedge On-Call Runbook

**Purpose:** Diagnose failed or stalled processing jobs, recover unhealthy
services safely, and support a controlled production launch.

**Scope:** Next.js application, BullMQ/Redis queues, reframe and video workers,
ML Gateway, TalkNet, AutoFlip, monitoring alerts, and the AWS GPU worker.

## 1. Incident handling principles

1. Record the incident start time, affected job ID, pipeline, observed status,
   error message, and impact before changing anything.
2. Check service and dependency health before attempting any recovery.
3. Prefer fixing the underlying dependency over restarting worker services.
4. Preserve relevant application, worker, and monitoring logs before taking action.
5. Never print, paste, or commit secrets, access tokens, signed URLs, or
   complete environment files.
6. Do not delete Redis keys or manually edit BullMQ internal hash/zset structures.
7. Do not execute ad-hoc manual BullMQ retry commands or direct database `UPDATE`
   mutations on live jobs without explicit service owner authorization.
8. Do not start the GPU instance without confirming that processing is needed
   and that the expected cost is approved.

## 2. Identify the affected pipeline

### 2.1 Queue configuration and retry defaults

The queue configuration in `app/lib/queue.ts` defines these verified defaults:

| Queue               | Attempts | Backoff                             | Retention (Complete / Failed) | Queue Name Resolver                    |
| ------------------- | -------: | ----------------------------------- | ----------------------------- | -------------------------------------- |
| video-processing    |        3 | Exponential, 5-second initial delay | 200 / 1000                    | Static: `video-processing`             |
| subtitle-processing |        3 | Exponential, 5-second initial delay | 200 / 1000                    | Static: `subtitle-processing`          |
| audio-processing    |        3 | Exponential, 5-second initial delay | 200 / 1000                    | Static: `audio-processing`             |
| reframe-processing  |        3 | Exponential, 2-second initial delay | 100 / 500                     | `resolveReframeQueueName()` (Task 115) |
| dubbing-processing  |        2 | Exponential, 5-second initial delay | 200 / 1000                    | `resolveDubbingQueueName()` (Task 115) |

These are configured defaults; inspect individual job options if a caller
overrides them. In staging (`APP_ENV=staging`), `reframe-processing` and
`dubbing-processing` fail closed if dedicated staging queue names are missing or
set to production defaults.

Completed and failed jobs are retained according to the queue limits above.
Collect evidence promptly because old job records are eventually purged by BullMQ.

### 2.2 Approved read-only database queries

To inspect job state in the PostgreSQL database without modifying data or exposing
sensitive credentials, execute read-only queries against the `VideoJob` table
(defined in `prisma/schema.prisma`).

> [!NOTE]
> In PostgreSQL, Prisma model column names with camelCase must be double-quoted.

**Inspect a single job by ID:**

```sql
SELECT
  id,
  "userId",
  status,
  progress,
  "videoUrl",
  "exportedUrl",
  "captionUrl",
  error,
  "createdAt",
  "updatedAt"
FROM "VideoJob"
WHERE id = '<target-job-id>';
```

**Find recent failed or in-flight jobs:**

```sql
SELECT
  id,
  status,
  progress,
  error,
  "createdAt",
  "updatedAt"
FROM "VideoJob"
WHERE status IN ('FAILED', 'PROCESSING')
ORDER BY "createdAt" DESC
LIMIT 10;
```

**Check completed jobs missing an export URL:**

```sql
SELECT
  id,
  status,
  "exportedUrl",
  "captionUrl",
  error,
  "updatedAt"
FROM "VideoJob"
WHERE status = 'COMPLETED'
  AND ("exportedUrl" IS NULL OR "exportedUrl" = '')
ORDER BY "updatedAt" DESC
LIMIT 10;
```

Do not execute `UPDATE` or `DELETE` statements on `VideoJob` during triage.

## 3. Initial triage checklist

For every incident:

- [ ] Record the affected job ID and user-visible failure.
- [ ] Query the `VideoJob` record in PostgreSQL using read-only SQL.
- [ ] Identify the pipeline and corresponding BullMQ queue.
- [ ] Determine whether the BullMQ job is waiting, active, delayed, completed, or failed.
- [ ] Inspect application and worker logs around the incident time.
- [ ] Check Redis connectivity and queue activity.
- [ ] Check required downstream services and external dependencies.
- [ ] Check the monitoring metrics endpoint and alert evaluator daemon.
- [ ] Record the suspected cause and recovery action before proceeding.

Do not classify a job as stuck solely because it is taking longer than expected.
Long source media naturally requires proportional processing time. Compare
elapsed time with normal duration and inspect live process activity before intervening.

## 4. Check application and monitoring

### 4.1 Authenticated metrics endpoint

Run these checks from a host that can reach the Next.js application:

```bash
# Verify endpoint response code (expects 401 without secret)
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://localhost:3000/api/monitoring/metrics

# Query Prometheus metrics with authenticated header
curl -fsS -H "x-marvedge-rollup-secret: ${OVERLAYS_ROLLUP_SECRET}" \
  http://localhost:3000/api/monitoring/metrics
```

**Response Code Interpretation:**

- `200 OK`: Endpoint healthy. Returns Prometheus text metrics and collects real-time queue depths for `reframeQueue` and `dubbingQueue`.
- `401 Unauthorized`: Header `x-marvedge-rollup-secret` is missing, blank, or does not match `OVERLAYS_ROLLUP_SECRET`.
- `503 Service Unavailable`: `OVERLAYS_ROLLUP_SECRET` is unset in the application environment.
- Connection failure: Application is down or unreachable. Check Next.js container / service status.

### 4.2 Alert evaluator daemon

The alert evaluator (`scripts/monitoringAlerts.ts`) runs as a dedicated daemon
supervised by systemd:

```bash
sudo systemctl status marvedge-monitoring-alerts --no-pager
sudo journalctl -u marvedge-monitoring-alerts --since "30 minutes ago" --no-pager
```

If running outside systemd in a test or local environment:

```bash
npm run monitoring:alerts
```

**Alert State Store & Cooldown Architecture:**

- **Redis-Backed State Store (Default):** The evaluator uses `stateRedis` to persist active alert conditions and cooldown timestamps across evaluation loops.
- **In-Memory Fallback:** If `stateRedis` is disconnected or unavailable, the evaluator falls back to a process-local in-memory store.
  - _Limitation:_ With in-memory fallback, restarting the process clears all cooldown timestamps, which may re-emit alerts immediately.
  - _Constraint:_ Run **exactly one** replica of the monitoring evaluator. Multiple concurrent evaluators without shared Redis state will duplicate alerts.
- **Alert Delivery:** The evaluator logs structured alerts to stdout/journal; it does not dispatch external webhooks or emails directly unless configured with an external notification forwarder.

## 5. Diagnose Redis and queue problems

### 5.1 Symptoms

- Jobs accumulate in `waiting` or `delayed` states.
- Workers fail to acquire jobs.
- Worker logs report `ECONNREFUSED`, `ETIMEDOUT`, or `Command timed out` for Redis.
- Queue depth cannot be collected by `/api/monitoring/metrics`.

### 5.2 Actions

1. Confirm `REDIS_URL` is configured in the environment (`/etc/marvedge/worker.env` on worker hosts).
2. Verify reachability and authentication:
   ```bash
   # Test ping without echoing REDIS_URL
   node -e "const Redis = require('ioredis'); const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 }); r.ping().then(res => { console.log('Redis ping:', res); process.exit(0); }).catch(err => { console.error('Redis error:', err.message); process.exit(1); });"
   ```
3. Check Redis memory pressure and client connection limits on the managed Redis provider.
4. Confirm both the Next.js application producer and the worker consumer connect to the exact same Redis instance.
5. In production, the reframe worker strictly rejects `localhost` or `127.0.0.1` Redis URLs (`ALLOW_LOCAL_REDIS=true` is permitted only in non-production environments).

Never paste or expose `REDIS_URL` in tickets or incident reports.

## 6. Diagnose the reframe and ML services

### 6.1 Local ML endpoints on the GPU worker

The GPU deployment plan provisions three local HTTP microservices:

| Service    | Endpoint                     | Function                                              |
| ---------- | ---------------------------- | ----------------------------------------------------- |
| ML Gateway | http://127.0.0.1:8000/health | Reverse proxy / orchestrator for TalkNet and AutoFlip |
| TalkNet    | http://127.0.0.1:8001/health | Active speaker detection and audio-visual sync        |
| AutoFlip   | http://127.0.0.1:8002/health | Saliency detection and intelligent video cropping     |

Test local responsiveness from the GPU worker host:

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8001/health
curl -fsS http://127.0.0.1:8002/health
```

**Diagnostic Interpretation:**

- A `502 Bad Gateway` from port 8000 indicates the ML Gateway is running but TalkNet (8001) or AutoFlip (8002) is down.
- A slow health check response (> 1.0s) suggests host CPU/GPU saturation or event-loop contention, but does not prove a deadlock. Check `nvidia-smi` and `htop` before restarting.
- Connection refused (`ECONNREFUSED`) means the container or systemd service has crashed.

### 6.2 Reframe worker configuration

Inspect the reframe worker configuration variables:

- `REDIS_URL`: Must point to the shared production Redis.
- `BACKEND_URL`: Authoritative Next.js base URL for callbacks.
- `CALLBACK_SECRET`: Shared secret used for `Authorization: Bearer <CALLBACK_SECRET>` callbacks to `/api/jobs/callback`.
- `REFRAME_ML_SERVICE_URL`: URL of the ML Gateway (typically `http://127.0.0.1:8000`).
- `REFRAME_WORKER_CONCURRENCY`: Concurrency limit (must match approved deployment capacity, default `1`).
- `REFRAME_ML_TIMEOUT_MS`: Timeout for ML inference (defaults to `180000` ms / 3 minutes).

## 7. Inspect GPU worker services

### 7.1 Service inventory

The GPU deployment defines these systemd service units:

- `marvedge-ml-gateway.service`: ML Gateway proxy
- `marvedge-talknet.service`: TalkNet speaker model service
- `marvedge-autoflip.service`: AutoFlip crop service
- `marvedge-reframe-worker.service`: Reframe BullMQ consumer
- `marvedge-video-worker.service`: Dubbing / video BullMQ consumer
- `marvedge-monitoring-alerts.service`: External alert evaluator

Verify active services on the GPU host:

```bash
sudo systemctl --no-pager --type=service --state=running | grep marvedge
```

Inspect service status and recent journal logs:

```bash
sudo systemctl status marvedge-reframe-worker --no-pager
sudo journalctl -u marvedge-reframe-worker --since "30 minutes ago" --no-pager
```

### 7.2 Safe restart procedure

> [!WARNING]
> Restarting a worker service interrupts active in-flight jobs. Only restart services
> when an unrecoverable crash, deadlocked process, or configuration reload requires it.

1. Notify the incident commander or escalation lead before restarting.
2. Restart **only** the affected unit:
   ```bash
   sudo systemctl restart marvedge-reframe-worker
   ```
3. Immediately verify status and follow output logs:
   ```bash
   sudo systemctl status marvedge-reframe-worker --no-pager
   sudo journalctl -u marvedge-reframe-worker -n 50 --no-pager
   ```
4. Do not restart all services simultaneously. If multiple services are unhealthy,
   restart dependencies in order: ML backends (TalkNet/AutoFlip) -> ML Gateway -> Workers.

## 8. GPU preflight and launch

### 8.1 Instance details & cost approval

- **Instance ID:** `i-02aa4578f3790bae1`
- **Region:** `ap-southeast-2`
- **Instance Type:** `g4dn.xlarge` (NVIDIA T4 GPU)
- **Documented Default State:** `stopped` to control cloud spend.

**Mandatory Precondition:** Confirm that GPU processing is needed and that cost
approval is recorded in the incident ticket before starting the instance.

### 8.2 Starting the GPU instance

Check current state via AWS CLI:

```bash
aws ec2 describe-instances \
  --instance-ids i-02aa4578f3790bae1 \
  --region ap-southeast-2 \
  --profile marvedge \
  --query 'Reservations[0].Instances[0].[State.Name,PrivateIpAddress]' \
  --output table
```

If stopped and approved, start the instance:

```bash
aws ec2 start-instances \
  --instance-ids i-02aa4578f3790bae1 \
  --region ap-southeast-2 \
  --profile marvedge
```

Wait until `State.Name` reaches `running` and note the private IP address.

### 8.3 Running the preflight gate

Once SSH/SSM access is available on the instance:

```bash
cd /opt/marvedge
sudo ./infra/gpu-deployment/preflight-gate.sh
```

The preflight gate validates:

- Environment file `/etc/marvedge/worker.env` exists and contains required keys.
- TalkNet weights and AutoFlip binary are present and executable.
- Redis connection resolves and passes connectivity checks.
- Callback configuration and worker concurrency are valid.
- NVIDIA drivers and `nvidia-smi` are operational.

Resolve any `[FAIL]` items before enabling worker services. Never output `/etc/marvedge/worker.env`
contents into incident tickets or shared channels.

## 9. Failed, active, or stalled jobs

### 9.1 Diagnosing elevated processing latency

When `reframe_inference_latency` or `dubbing_processing_latency` alerts fire:

1. **Isolate Quantiles via PromQL:**
   Refer to `docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md`:
   - If p50 is normal but p95/p99 is spiked, the delay is driven by large outlier input files or transient network egress latency.
   - If p50 is elevated across all jobs, worker compute is throttled or saturated.
2. **Inspect Host Hardware:**
   On the GPU worker host:
   ```bash
   nvidia-smi
   htop -t
   ```
3. **Inspect Local ML Microservice Latencies:**
   ```bash
   curl -o /dev/null -s -w 'ML Gateway: %{time_total}s\n' http://127.0.0.1:8000/health
   curl -o /dev/null -s -w 'TalkNet: %{time_total}s\n' http://127.0.0.1:8001/health
   curl -o /dev/null -s -w 'AutoFlip: %{time_total}s\n' http://127.0.0.1:8002/health
   ```

### 9.2 Investigating rising job failure rates

When `reframe_job_failure_rate` or `dubbing_job_failure_rate` alerts breach threshold (> 20%):

1. **Distinguish Intermediate Retries from Terminal Failures:**
   BullMQ automatically retries failed attempts with exponential backoff (up to 3 attempts for reframe, 2 for dubbing).
   - Jobs in `state="delayed"` are waiting for their next attempt. Do not manually intervene while automatic retries remain.
   - The metric `marvedge_jobs_total{status="failed"}` increments only after **all** retry attempts are exhausted.
2. **Extract Root Error Signatures:**
   ```bash
   sudo journalctl -u marvedge-reframe-worker --since "30 minutes ago" --no-pager | grep -E "BullMQ Job failed|Error"
   ```
3. **Categorize Root Cause:**
   - **`ECONNREFUSED` on port 8000/8001/8002:** ML service died. Check `systemctl status marvedge-talknet` or `marvedge-autoflip`.
   - **`Cloudinary upload failed` / `S3 Access Denied`:** Storage credential, bucket permission, or network egress error.
   - **`Callback failed with status 500 / 401`:** Backend application error or `CALLBACK_SECRET` mismatch. Check Next.js server logs.
   - **`UnrecoverableError` / corrupt media:** Invalid video codec or missing audio. The job cannot succeed; do not resubmit.

### 9.3 Diagnosing stuck queues

When `reframe_stuck_queue` (> 300s) or `dubbing_stuck_queue` (> 600s) triggers:

1. **Check Queue Depth Distribution:**
   ```bash
   curl -fsS -H "x-marvedge-rollup-secret: ${OVERLAYS_ROLLUP_SECRET}" \
     http://localhost:3000/api/monitoring/metrics | grep marvedge_queue_depth
   ```
2. **Classify Queue State:**
   - **Starved (`waiting > 0` and `active == 0`):** Worker daemon is stopped or disconnected from Redis. Check `systemctl status marvedge-reframe-worker`.
   - **Stalled (`active > 0` for longer than job lock duration):** Worker thread hung or crashed without releasing lock.
   - **Idle (`waiting == 0` and `active == 0`):** Queue is empty. Stuck queue metrics report 0s when queue is empty.

### 9.4 Recovery procedures

> [!CAUTION]
> **Duplicate Processing & Billing Warning:**
> Never restart or resubmit a job without verifying whether output already exists in storage or whether billable vendor APIs (e.g., ElevenLabs dubbing) were already called. Resubmitting active jobs can cause duplicate credit consumption and race conditions.

#### Step 1: Read-Only Job Identification

Use read-only SQL against `VideoJob` to inspect status:

```sql
SELECT id, "userId", status, progress, "exportedUrl", error, "updatedAt"
FROM "VideoJob"
WHERE id = '<job-id>';
```

To inspect BullMQ active jobs safely without modifying state:

```bash
npx tsx -e "
import { reframeQueue, dubbingQueue } from './app/lib/queue';
async function inspect() {
  for (const q of [reframeQueue, dubbingQueue]) {
    const active = await q.getJobs(['active']);
    console.log(q.name, 'Active count:', active.length);
    for (const j of active) {
      console.log('BullMQ Job ID:', j.id, 'VideoJob ID:', j.data?.jobId, 'Attempts:', j.attemptsMade, 'ProcessedOn:', j.processedOn ? new Date(j.processedOn).toISOString() : 'none');
    }
  }
  process.exit(0);
}
inspect();
"
```

#### Step 2: Check Worker Process Liveness

On the worker host:

```bash
ps aux | grep -E "reframe-worker|video-worker"
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
```

- If the worker PID is actively consuming GPU or logging FFmpeg progress: **DO NOT INTERRUPT.** The worker is rendering a large file.

#### Step 3: Check External Output Artifacts

Before taking recovery action, verify whether output was already generated:

- Check Cloudinary / S3 for the destination keys (`reframe/<job-id>` or `dubbing/<job-id>`).
- If the artifact exists in storage and is valid, the compute succeeded. Do not re-enqueue.

#### Step 4: Stalled Worker Recovery vs. Retry Safety

##### A. Stalled Worker Recovery (Process Crash)

If the worker process died or hung and no output exists:

1. Restart the worker service:
   ```bash
   sudo systemctl restart marvedge-reframe-worker
   ```
2. BullMQ's built-in stalled-job mechanism will detect the orphaned lock (`lockDuration=300000` ms), move the job back to waiting, and resume processing up to remaining attempt limits.

##### B. Why Manual BullMQ Job Retries are NOT Supported

> [!IMPORTANT]
> **Do not run ad-hoc scripts invoking `job.retry()` or `job.moveToFailed()`.**
>
> 1. **Database Desynchronization:** BullMQ's `job.retry()` mutates Redis state only. It does not update the PostgreSQL `VideoJob` record.
> 2. **Worker Claim Predicates:** In `video-worker`, jobs are claimed using atomic database predicates:
>    ```ts
>    where: { id: jobId, status: { in: ["PENDING", "PROCESSING"] } }
>    ```
>    If a job is already in `FAILED` state in PostgreSQL, retrying the BullMQ job will result in `claimed.count === 0`, and the worker will reject the job without running it.
> 3. **Duplicate Billing Risk:** Retrying dubbing jobs can trigger duplicate text-to-speech calls to ElevenLabs or secondary Cloudinary uploads.
> 4. **Approved Recovery:** If a terminally failed job must be rerun, follow the [Escalation Criteria](#10-escalation-criteria) to request an authorized resubmission through the application layer.

#### Step 5: Completed Jobs with Missing Output

If a job is marked `COMPLETED` in the database but the user cannot view the video:

1. Query `"VideoJob"`:
   ```sql
   SELECT id, status, "exportedUrl", "captionUrl", error FROM "VideoJob" WHERE id = '<job-id>';
   ```
2. Verify if `"exportedUrl"` is null, malformed, or pointing to a 404/expired URL.
3. Check application callback logs:
   ```bash
   sudo journalctl -u marvedge -S "1 hour ago" --no-pager | grep -E "/api/jobs/callback"
   ```
4. If the artifact exists in S3/Cloudinary but was not recorded in PostgreSQL, escalate to the service owner to update the database record. Do not re-run the compute pipeline.

## 10. Escalation criteria

Escalate to the service owner or infrastructure lead when:

- Redis or PostgreSQL remains unreachable after network checks.
- The GPU preflight gate reports missing model weights, missing AutoFlip binaries, or CUDA driver failures.
- A worker repeatedly crashes upon acquiring a job.
- A job is terminally `FAILED` in PostgreSQL and requires an authorized resubmission from the application layer.
- `CALLBACK_SECRET` authentication repeatedly fails with HTTP 401 across workers.
- Sustained pipeline failure rate exceeds 20% for > 15 minutes.
- A production recovery action requires modifying environment secrets or IAM permissions.

**Incident Handover Template:**

```text
Incident Start: YYYY-MM-DD HH:MM UTC
Pipeline Affected: reframe | dubbing | video | subtitle
Job ID: <job-id> (BullMQ ID: <bullmq-id>)
Database Status: PENDING | PROCESSING | COMPLETED | FAILED
Worker Host / Service: i-02aa4578f3790bae1 / marvedge-reframe-worker
Observed Error: <redacted error message>
Actions Taken: Verified Redis (ok), checked storage (no artifact), worker restarted once.
Blocker: Job terminally FAILED in DB; needs authorized application resubmission.
```

## 11. Launch-support checklist

### Before launch

- [ ] Confirm release version, deployment owner, and escalation contact.
- [ ] Verify production Redis connectivity and queue names (`reframe-processing`, `dubbing-processing`).
- [ ] Confirm required secrets (`CALLBACK_SECRET`, `OVERLAYS_ROLLUP_SECRET`, `ELEVENLABS_API_KEY`) are set without printing values.
- [ ] Verify GPU compute necessity and record cost approval for `i-02aa4578f3790bae1`.
- [ ] Run `sudo /opt/marvedge/infra/gpu-deployment/preflight-gate.sh` on the GPU host.
- [ ] Verify local ML microservices (`curl http://127.0.0.1:8000/health`).
- [ ] Confirm `marvedge-monitoring-alerts.service` is running as a single replica.
- [ ] Run an approved end-to-end canary job and verify output delivery.

### During launch

- [ ] Monitor queue depth, active jobs, and processing latency via `/api/monitoring/metrics`.
- [ ] Monitor worker journal logs: `sudo journalctl -u marvedge-reframe-worker -f`.
- [ ] Verify that failed jobs auto-retry without operator intervention.
- [ ] Avoid manual restarts while upstream dependencies or APIs are degraded.
- [ ] Escalate sustained error rate spikes or queue starvation immediately.

### After launch

- [ ] Verify all launch test outputs and check database completion records.
- [ ] Confirm queues have drained to baseline (`waiting=0`, `active=0`).
- [ ] Confirm alert evaluator reports no active alerts.
- [ ] Stop the GPU instance (`aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge`) once processing is complete and shutdown approval is granted.
- [ ] Archive incident notes, triage logs, and handover items.

## 12. Known limitations and operational constraints

- **Alert Notifications:** The alert evaluator logs alerts to journald/stdout; external webhook/email forwarding depends on external log forwarding.
- **Manual Retries:** Ad-hoc manual BullMQ job retries via CLI scripts are unsupported due to database claim predicates and duplicate billing risks. Resubmissions must occur through application endpoints.
- **Worker Topologies:** The repository contains systemd definitions for the GPU worker (`infra/gpu-deployment/`) and legacy worker definitions (`cloudrun-worker/`). Verify active host units before executing systemctl commands.
- **Single Evaluator Replica:** The monitoring alert evaluator must run as a single replica to avoid duplicate alert notifications when operating with in-memory state fallbacks.

## References

- `app/lib/queue.ts` — Queue definitions, retry policies, and retention limits
- `app/lib/config/dubbingQueue.ts` — Staging queue resolution and isolation logic
- `app/api/monitoring/metrics/route.ts` — Authenticated Prometheus metrics endpoint
- `scripts/monitoringAlerts.ts` — External monitoring alert evaluator daemon
- `app/lib/monitoring/alerts.ts` — Alert rule evaluations, cooldowns, and Redis state store
- `docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md` — PromQL query catalog and dashboard definitions
- `prisma/schema.prisma` — Authoritative `VideoJob` database schema
- `infra/AWS_INFRASTRUCTURE.md` — AWS resources and GPU instance specification
- `infra/gpu-deployment/DEPLOYMENT_PLAN.md` — GPU service topology and preflight procedures
- `infra/gpu-deployment/preflight-gate.sh` — GPU worker deployment verification gate
- `infra/gpu-deployment/marvedge-*.service` — Systemd service unit definitions
