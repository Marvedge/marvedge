# Marvedge On-Call Runbook

**Purpose:** Diagnose failed or stalled processing jobs, recover unhealthy
services safely, and support a controlled production launch.

**Scope:** Next.js application, BullMQ/Redis queues, reframe and video workers,
ML Gateway, TalkNet, AutoFlip, monitoring alerts, and the AWS GPU worker.

## 1. Incident handling principles

1. Record the incident start time, affected job ID, pipeline, observed status,
   error message, and impact before changing anything.
2. Check service and dependency health before retrying work.
3. Prefer fixing the underlying dependency over repeatedly restarting a job.
4. Preserve relevant logs and job details before taking recovery action.
5. Never print, paste, or commit secrets, access tokens, signed URLs, or
   complete environment files.
6. Do not delete Redis keys or manually edit BullMQ internal data.
7. Do not start the GPU instance without confirming that processing is needed
   and that the expected cost is approved.

## 2. Identify the affected pipeline

The root queue configuration defines these default retry policies:

| Queue               | Attempts | Backoff                             |
| ------------------- | -------: | ----------------------------------- |
| video-processing    |        3 | Exponential, 5-second initial delay |
| subtitle-processing |        3 | Exponential, 5-second initial delay |
| audio-processing    |        3 | Exponential, 5-second initial delay |
| reframe-processing  |        3 | Exponential, 2-second initial delay |
| dubbing-processing  |        2 | Exponential, 5-second initial delay |

These are configured defaults; inspect the individual job options if a job
overrides them. Do not assume all processing pipelines use the same queue.

Completed and failed jobs are retained according to queue-specific limits.
Collect evidence promptly because old job records may eventually be removed.

## 3. Initial triage checklist

For every incident:

- [ ] Record the affected job ID and user-visible failure.
- [ ] Identify the pipeline and corresponding queue.
- [ ] Determine whether the job is waiting, active, delayed, completed, or failed.
- [ ] Inspect application and worker logs around the incident time.
- [ ] Check Redis connectivity and queue activity.
- [ ] Check required downstream services and external dependencies.
- [ ] Check the monitoring metrics endpoint and alert-process logs.
- [ ] Record the suspected cause and recovery action.

Do not classify a job as stuck solely because it is taking longer than expected.
Compare elapsed time with the job's normal processing duration and inspect logs.

## 4. Check application and monitoring

Run these checks from a host that can reach the application.

Check the application response:

    curl -sS -o /dev/null -w '%{http_code}\n' \
      http://localhost:3000/api/monitoring/metrics

Inspect the metrics endpoint:

    curl -fsS -H "x-marvedge-rollup-secret: ${OVERLAYS_ROLLUP_SECRET}" http://localhost:3000/api/monitoring/metrics

The metrics endpoint is useful only when the application is reachable from
the host where the command runs. A non-200 response requires further diagnosis.

The monitoring evaluator is a separate long-running process. First check
whether it is already running under the deployment's process manager. Start it
only if it is not running:

    npm run monitoring:alerts

Inspect its logs for configuration errors, Redis failures, or alert evaluation
errors. Do not start a second replica just because alerts are not visible: the
evaluator uses process-local cooldown state and is intended to run as one replica.

The evaluator emits structured process logs; it does not send external
notifications. An alert may therefore require an operator to take action.

## 5. Diagnose Redis and queue problems

Symptoms:

- Jobs accumulate in waiting or delayed states.
- Workers cannot acquire jobs.
- Logs report Redis connection errors or connection timeouts.
- Queue depth cannot be collected.

Actions:

1. Confirm the expected REDIS_URL is configured in the relevant runtime.
2. Verify network reachability and authentication from that runtime.
3. Check Redis service health and resource pressure using approved
   infrastructure monitoring.
4. Confirm the worker and application target the same intended Redis instance.
5. Check queue depth and worker logs before restarting anything.

For production, the reframe worker rejects an accidental localhost Redis
configuration unless the explicit development override is enabled.
Do not change production configuration to localhost as a workaround.

Never expose REDIS_URL in incident reports. It may contain credentials.

## 6. Diagnose the reframe and ML services

The GPU deployment plan documents these local health endpoints:

| Service    | URL                          |
| ---------- | ---------------------------- |
| ML Gateway | http://127.0.0.1:8000/health |
| TalkNet    | http://127.0.0.1:8001/health |
| AutoFlip   | http://127.0.0.1:8002/health |

Run these commands on the GPU worker host:

    curl -fsS http://127.0.0.1:8000/health
    curl -fsS http://127.0.0.1:8001/health
    curl -fsS http://127.0.0.1:8002/health

These endpoints are local to the GPU host in the documented deployment.
A failed request indicates that the service is unreachable or unhealthy from
that host; inspect service logs before restarting it.

Check the reframe worker configuration for:

- REDIS_URL pointing to the intended shared Redis instance.
- CALLBACK_SECRET being configured.
- BACKEND_URL resolving to the intended application.
- REFRAME_ML_SERVICE_URL pointing to the ML Gateway.
- REFRAME_WORKER_CONCURRENCY matching the approved deployment configuration.

The reframe worker defaults to a 180-second ML request timeout and retries
callbacks according to its configured callback retry settings. A timeout or
callback failure should be diagnosed before resubmitting the job.

## 7. Inspect GPU worker services

The deployment plan defines these systemd services:

- marvedge-ml-gateway
- marvedge-talknet
- marvedge-autoflip
- marvedge-reframe-worker
- marvedge-video-worker

First verify which services are installed and active on the target host:

    sudo systemctl --no-pager --type=service --state=running

Inspect a specific service:

    sudo systemctl status marvedge-reframe-worker --no-pager
    sudo journalctl -u marvedge-reframe-worker --since "30 minutes ago" \
      --no-pager

Replace the service name as appropriate. Use the actual service installed on
the host; the repository also contains a separate legacy
marvedge-worker.service definition for cloudrun-worker.

For repeated failures, inspect recent logs and dependency health before
restarting the affected service.

If an authorized restart is necessary, restart only the affected service:

    sudo systemctl restart marvedge-reframe-worker

Then verify status and logs:

    sudo systemctl status marvedge-reframe-worker --no-pager
    sudo journalctl -u marvedge-reframe-worker --since "5 minutes ago" \
      --no-pager

A restart can interrupt in-flight work. Follow the incident owner's approval
and the deployment's change policy before restarting production services.
Do not restart every service indiscriminately.

## 8. GPU preflight and launch

The documented GPU instance is:

- Instance ID: i-02aa4578f3790bae1
- Region: ap-southeast-2
- Instance type: g4dn.xlarge
- GPU: NVIDIA T4
- Documented default state: stopped to control costs

Before starting it, confirm that compute use is needed and approved. Then
check its current state:

    aws ec2 describe-instances \
      --instance-ids i-02aa4578f3790bae1 \
      --region ap-southeast-2 \
      --profile marvedge \
      --query 'Reservations[0].Instances[0].[State.Name,PrivateIpAddress]' \
      --output table

Only if approved and stopped, start the instance:

    aws ec2 start-instances \
      --instance-ids i-02aa4578f3790bae1 \
      --region ap-southeast-2 \
      --profile marvedge

Wait for the instance to reach the running state and verify the private
address and service health. Starting EC2 does not by itself prove that the
application pipeline is ready.

On the GPU host, run the documented preflight gate if the repository is
deployed at /opt/marvedge and the script exists at the documented path:

    cd /opt/marvedge
    sudo ./infra/gpu-deployment/preflight-gate.sh

If the repository or script is installed elsewhere, verify the deployment path
with the infrastructure owner before running the gate.

The gate checks the environment file, TalkNet weights, AutoFlip executable,
Redis URL configuration, callback configuration, and worker concurrency.
It also checks for NVIDIA tooling and reports a warning if it is missing.
Resolve critical failures before starting the processing services.

The preflight script expects /etc/marvedge/worker.env. Do not display that
file in logs or attach it to an incident ticket.

## 9. Failed, active, or stalled jobs

### 9.1 Diagnosing elevated processing latency

When `marvedge_reframe_inference_duration_seconds` or `marvedge_dubbing_duration_seconds` triggers an alert:

1. **Isolate Pipeline & Quantiles:**
   Run the PromQL queries in `docs/qa/OBSERVABILITY_DASHBOARDS_AND_QUERIES.md`:
   - Inspect p50 vs. p95/p99 latency.
   - If p50 is normal but p95 is spiked, the delay is caused by outlier large video files or occasional network latency to downstream APIs.
   - If p50 itself is elevated, the worker host is under CPU/GPU saturation or throttling.
2. **Inspect Host Hardware & Compute Utilisation:**
   On the GPU worker host (`g4dn.xlarge`):

   ```bash
   # Check GPU utilization, VRAM usage, and active compute PIDs
   nvidia-smi

   # Check host CPU load and memory usage
   htop -t
   ```

3. **Check Downstream ML Service Latencies:**
   Test container responsiveness locally:
   ```bash
   curl -o /dev/null -s -w 'ML Gateway: %{time_total}s\n' http://127.0.0.1:8000/health
   curl -o /dev/null -s -w 'TalkNet: %{time_total}s\n' http://127.0.0.1:8001/health
   curl -o /dev/null -s -w 'AutoFlip: %{time_total}s\n' http://127.0.0.1:8002/health
   ```
   If TalkNet or AutoFlip responses exceed 1.0s on the health check, the Python process is CPU-bound or deadlocked.

### 9.2 Investigating rising job failure rates

When `reframe_job_failure_rate` or `dubbing_job_failure_rate` breaches threshold:

1. **Distinguish Retries from Terminal Failures:**
   BullMQ jobs automatically retry up to the configured limit (3 attempts for reframe, 2 attempts for dubbing) with exponential backoff.
   - Jobs in `state="delayed"` are actively retrying. Do not intervene while retries remain.
   - Jobs increment `marvedge_jobs_total{status="failed"}` only when all attempts have been exhausted.
2. **Extract Affected Job IDs and Error Signatures:**
   Run journalctl filtering to capture the root error messages:
   ```bash
   sudo journalctl -u marvedge-reframe-worker --since "30 minutes ago" --no-pager | grep -E "\[reframe-worker\] BullMQ Job failed"
   ```
3. **Categorize Root Cause:**
   - **`ECONNREFUSED` / `ETIMEDOUT` to 8000/8001/8002:** ML container died. Check `docker ps` and restart the affected container.
   - **`Cloudinary upload failed` / `S3 Access Denied`:** Storage credential or network egress issue.
   - **`Callback failed with status 500`:** Application backend error; inspect Next.js application logs.
   - **`UnrecoverableError`:** Invalid video format, missing audio stream, or corrupt media. Retrying will not succeed; job was intentionally discarded.

### 9.3 Diagnosing stuck queues

When `reframe_stuck_queue` or `dubbing_stuck_queue` breaches threshold (> 300s / > 600s):

1. **Check Queue Depth Distribution:**
   Inspect BullMQ job counts across states:
   ```bash
   curl -fsS -H "x-marvedge-rollup-secret: ${OVERLAYS_ROLLUP_SECRET}" http://localhost:3000/api/monitoring/metrics | grep marvedge_queue_depth
   ```
2. **Determine if Queue is Starved vs. Stalled:**
   - **Starved (`waiting > 0` and `active == 0`):** Worker process is not running or disconnected from Redis. Check worker status: `sudo systemctl status marvedge-reframe-worker`.
   - **Stalled (`active > 0` for duration > timeout):** A job is actively locked by a worker that may have hung, or the worker crashed without unlocking the job.
   - **Empty / Idle (`waiting == 0` and `active == 0`):** Normal state. The stuck queue metric automatically reports 0s when queue is empty (guaranteed zero false alarms).

### 9.4 Actionable Stuck-Job Recovery Procedure

> [!CAUTION]
> **Duplicate Processing & Billing Warning:**
> Never restart a job without verifying whether it has already produced output or executed billable vendor calls (e.g. ElevenLabs audio synthesis or GPU rendering). Blindly re-running jobs can lead to duplicate cloud spend and corrupted database records.

Follow this strict step-by-step procedure to inspect and recover a stuck job:

#### Step 1: Identify the Stalled Job

Inspect the oldest active jobs using an administrative Node inspection script from the application root:

```bash
# Run safe, read-only inspection of active jobs
npx tsx -e "
import { reframeQueue, dubbingQueue } from './app/lib/queue';
async function inspect() {
  const queues = [reframeQueue, dubbingQueue];
  for (const q of queues) {
    const active = await q.getJobs(['active']);
    console.log(q.name, 'Active count:', active.length);
    for (const j of active) {
      console.log('Job ID:', j.id, 'Data ID:', j.data?.jobId, 'ProcessedOn:', new Date(j.processedOn).toISOString(), 'Attempts:', j.attemptsMade);
    }
  }
  process.exit(0);
}
inspect();
"
```

#### Step 2: Determine if Worker Process is Still Alive

On the worker host:

1. Check if the worker PID is actively using CPU/GPU:
   ```bash
   ps aux | grep -E "reframe-worker|video-worker"
   nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
   ```
2. Check recent logs for that specific job ID:
   ```bash
   sudo journalctl -u marvedge-reframe-worker --since "15 minutes ago" --no-pager | grep "<job-id>"
   ```
3. **If the process is actively writing logs or consuming GPU:** Do NOT interrupt. The job is processing a large file.

#### Step 3: Check External Output Artifacts (Avoid Duplicate Work)

Before modifying the job state, check whether the worker already finished rendering and uploaded the result:

- Check Cloudinary / S3 for the destination key: `reframe/<job-id>` or `dubbing/<job-id>`.
- Check database state in PostgreSQL (`SELECT status, output_url FROM "Job" WHERE id = '<job-id>';`).
- If the output artifact already exists in storage and database, the job was completed, but BullMQ failed to record the acknowledgment. In this case, simply update the job record; do NOT re-enqueue the compute job.

#### Step 4: Safely Retry a Stalled or Failed Job Using BullMQ API

If the worker crashed, the process died, and no output was generated, use standard BullMQ APIs (`job.retry()` or `job.moveToFailed()`) rather than manual Redis key manipulation:

```bash
# Execute safe BullMQ retry via administrative command
npx tsx -e "
import { reframeQueue, dubbingQueue } from './app/lib/queue';
async function recoverJob(queueName, jobId) {
  const queue = queueName === 'reframe' ? reframeQueue : dubbingQueue;
  const job = await queue.getJob(jobId);
  if (!job) {
    console.error('Job not found in queue:', jobId);
    process.exit(1);
  }
  const state = await job.getState();
  console.log('Current state of job', jobId, 'is:', state);

  if (state === 'failed') {
    console.log('Retrying failed job...');
    await job.retry();
    console.log('Job moved to waiting for retry.');
  } else if (state === 'active') {
    console.log('Moving orphaned active job to failed state first...');
    await job.moveToFailed(new Error('Manual operator recovery: worker orphaned/hung'), '0', true);
    console.log('Retrying job...');
    await job.retry();
    console.log('Job safely reset to waiting.');
  } else {
    console.warn('Job is currently in state', state, '; manual intervention not required.');
  }
  process.exit(0);
}
// Usage: recoverJob('reframe', '<target-job-id>')
const [,, qName, jId] = process.argv;
if (qName && jId) {
  recoverJob(qName, jId);
} else {
  console.log('Usage: npx tsx <script> <reframe|dubbing> <job-id>');
}
" reframe "<target-job-id>"
```

#### Step 5: Verify Recovery

1. Run `marvedge_queue_depth{state="waiting"}` and verify job count increments.
2. Watch worker logs: `sudo journalctl -u marvedge-reframe-worker -f --no-pager`.
3. Confirm worker picks up the job, outputs progress logs, and reports `BullMQ Job completed`.
4. Verify the `reframe_stuck_queue` alert transitions to `[RESOLVED]` in monitoring logs.

## 10. Escalation criteria

Escalate to the service owner or infrastructure owner when:

- Redis or a critical dependency remains unavailable.
- The GPU preflight gate reports critical failures.
- Required model weights or executables are missing.
- A worker repeatedly crashes after restart.
- A job remains stuck and no documented recovery operation exists.
- The failure could cause duplicate processing, data loss, or incorrect output.
- The application is failing to receive authenticated callbacks.
- Production recovery requires a configuration, infrastructure, or credential
  change outside the on-call operator's authorization.

Include incident time, affected job and queue IDs, observed status, redacted
error messages, relevant log excerpts, checks performed, and actions taken.

## 11. Launch-support checklist

Before launch:

- [ ] Confirm the release and deployment owner.
- [ ] Confirm the correct production environment and Redis target.
- [ ] Confirm required credentials are present without printing their values.
- [ ] Confirm the GPU instance should be running and cost approval is recorded.
- [ ] Pass the GPU preflight gate where applicable.
- [ ] Verify worker and ML service health.
- [ ] Verify the monitoring evaluator is running exactly once.
- [ ] Confirm the on-call contact and escalation channel.
- [ ] Run an approved test job and verify completion and output delivery.

During launch:

- [ ] Monitor application, worker, and monitoring logs.
- [ ] Check queue depth, failed jobs, processing latency, and service health.
- [ ] Record incidents and recovery actions.
- [ ] Avoid repeated retries while a dependency remains unhealthy.
- [ ] Escalate sustained failures or unexpected resource consumption.

After launch:

- [ ] Verify test output and callback delivery.
- [ ] Confirm queues are progressing and errors are returning to baseline.
- [ ] Record outstanding issues, owners, and next actions.
- [ ] Stop unneeded GPU compute only after confirming no required work is active
      and following the deployment owner's shutdown procedure.
- [ ] Hand over unresolved incidents and links to relevant logs.

## 12. Known limitations and follow-up work

- The monitoring evaluator emits logs but does not deliver external alerts.
- The general media-job retry procedure is not exposed as a documented
  operator API in the inspected repository.
- Production service names must be verified on the target host; the repository
  contains both GPU systemd units and a separate legacy worker service.
- Confirm the current deployment topology and approved restart/resubmission
  procedure with the service owner before using this document for a live
  production incident.

## References

- README.md — Monitoring alert evaluation
- app/lib/queue.ts — Queue retry and retention defaults
- reframe-worker/index.ts — Reframe worker lifecycle and logging
- reframe-worker/config.ts — Worker environment validation
- scripts/monitoringAlerts.ts — Monitoring evaluator lifecycle
- infra/AWS_INFRASTRUCTURE.md — AWS resources and GPU instance details
- infra/gpu-deployment/DEPLOYMENT_PLAN.md — GPU service topology and preflight
- infra/gpu-deployment/preflight-gate.sh — GPU deployment gate
- infra/gpu-deployment/marvedge-\*.service — systemd service definitions
