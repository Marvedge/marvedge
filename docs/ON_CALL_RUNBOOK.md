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

| Queue | Attempts | Backoff |
|---|---:|---|
| video-processing | 3 | Exponential, 5-second initial delay |
| subtitle-processing | 3 | Exponential, 5-second initial delay |
| audio-processing | 3 | Exponential, 5-second initial delay |
| reframe-processing | 3 | Exponential, 2-second initial delay |
| dubbing-processing | 2 | Exponential, 5-second initial delay |

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

    curl -fsS http://localhost:3000/api/monitoring/metrics

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

| Service | URL |
|---|---|
| ML Gateway | http://127.0.0.1:8000/health |
| TalkNet | http://127.0.0.1:8001/health |
| AutoFlip | http://127.0.0.1:8002/health |

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

### Failed jobs

1. Capture the queue name, BullMQ job ID, application job ID if different,
   failure reason, attempts made, and relevant logs.
2. Determine whether the failure is transient or deterministic.
3. Check whether the configured retry attempts are exhausted.
4. Resolve the underlying dependency or input problem first.
5. Use an approved, pipeline-specific recovery mechanism if one exists.

The repository search did not identify a general-purpose HTTP endpoint for
retrying arbitrary video, reframe, or dubbing jobs. Do not use the CRM retry
endpoints for media jobs. Do not invent an API route or manually alter BullMQ
Redis keys.

If no documented recovery operation exists, preserve evidence and escalate
to the service owner to determine the supported recovery procedure.

### Active or apparently stuck jobs

1. Confirm whether the worker is alive and still producing logs.
2. Check Redis connectivity, downstream health, resource usage, and elapsed time.
3. Check whether the worker's configured lock and stalled-job settings apply.
4. Allow BullMQ's configured stalled-job handling to operate while monitoring.
5. If the worker must be restarted, follow the service restart procedure above.
6. Verify the job's state and output before considering resubmission.

Do not assume that restarting a worker guarantees a safe retry. Before
resubmitting work, establish whether the previous attempt produced output or
performed a non-idempotent external action. Escalate if duplicate execution
could cause data loss, duplicate billing, or conflicting artifacts.

### Completed jobs with missing output

Verify the job result, callback delivery, storage destination, and output
artifact. Check S3 or the configured storage provider using approved
read-only access. Do not delete or overwrite artifacts while investigating.

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
- infra/gpu-deployment/marvedge-*.service — systemd service definitions
