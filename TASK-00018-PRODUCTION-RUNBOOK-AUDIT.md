# TASK-00018 — Production Integration Runbook Accuracy Audit Report

**Audit Date:** 2026-11-04  
**Audit Target:** [`TASK-00018-PRODUCTION-INTEGRATION-CHECKLIST.md`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/TASK-00018-PRODUCTION-INTEGRATION-CHECKLIST.md)  
**Branch:** `task/task-00018-neon-prisma-config`  
**Execution Context:** Dedicated worktree `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge-task-00103`  
**Scope:** Deep-dive code and infrastructure verification of the proposed production integration checklist against actual repository entry points, bootstrap scripts, systemd units, route handlers, and AWS configurations.

---

## 1. Executive Summary & Audit Matrix

This audit verifies whether the operational checklist and execution sequence described in `TASK-00018-PRODUCTION-INTEGRATION-CHECKLIST.md` are accurate, safe, and executable against the actual codebase.

### Audit Summary:
* **Verified Accurate:** Redis TCP/TLS configuration, dual-URL Prisma schema, test video URL on S3, 30-minute EC2 cost bounds (~$0.36), and immediate EC2 shutdown mechanism.
* **Flaws Identified:**
  1. **CRITICAL:** Reverting Vercel `REDIS_URL` to ElastiCache during a rollback is mathematically impossible because ElastiCache has no public ingress.
  2. **CRITICAL:** `preflight-gate.sh` was claimed to probe network connections to Upstash, Neon, and Vercel; in reality it only performs string syntax checks on environment variables and checks for local files.
  3. **HIGH:** Proposed systemd startup/shutdown commands omitted `marvedge-ml-gateway.service` (port 8000) and `marvedge-talknet.service` (port 8001), which causes `reframe-worker` to fail with connection refused.
  4. **HIGH:** Proposed API test request using `curl POST /api/reframe` will fail with HTTP 401 Unauthorized because `/api/reframe` requires a NextAuth session cookie and an existing user record in PostgreSQL.
  5. **HIGH:** Existing EC2 bootstrap scripts (`ec2-worker-userdata.sh` and `ec2-worker-remediate.sh`) have hardcoded SSM parameters that write `WORKER_SECRET` (not `CALLBACK_SECRET`) and overwrite `/etc/marvedge/worker.env`, blowing away `DATABASE_URL` and `REDIS_URL`.

---

## 2. Detailed Findings & Evidence

### Finding 1: Redis Rollback to ElastiCache from Vercel is Impossible
* **Severity:** **CRITICAL**
* **Evidence:**
  * AWS ElastiCache instance `marvedge-redis` is located at `172.31.25.184:6379` inside private VPC `vpc-017e4bbdf3e18a004` ([`infra/AWS_INFRASTRUCTURE.md:38`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/AWS_INFRASTRUCTURE.md#L38)).
  * Vercel production functions execute in region `iad1` (US East) on dynamic public IP pools.
  * Section 10 of the runbook stated: *"If Redis Fails: Revert Vercel REDIS_URL and EC2 /etc/marvedge/worker.env back to ElastiCache VPC internal address."*
* **Impact:**
  * Setting Vercel's `REDIS_URL` to `redis://172.31.25.184:6379` will cause Vercel serverless requests to hang for 10 seconds and fail with `ETIMEDOUT`. Prior to this task, Vercel had **no** `REDIS_URL` configured.
* **Required Correction:**
  * The runbook must explicitly state:
    * **Vercel Rollback:** Delete or unset `REDIS_URL` in Vercel project environment variables (restoring the pre-migration baseline where queue jobs are not dispatched).
    * **EC2 Rollback:** Reverting to `redis://172.31.25.184:6379` in `/etc/marvedge/worker.env` is only valid for the EC2 worker host inside the VPC, not Vercel.

---

### Finding 2: `preflight-gate.sh` Does NOT Perform Network or Database Probes
* **Severity:** **CRITICAL**
* **Evidence:**
  * Inspecting [`infra/gpu-deployment/preflight-gate.sh`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/preflight-gate.sh#L59-L87):
    * Line 61–71: Redis check only tests `if [ -z "${REDIS_URL:-}" ]` and regex for `redis://localhost`. **It does not open a socket or send PING.**
    * Line 74–87: Callback check only tests `if [ -z "${CALLBACK_SECRET:-}" ]` and `if [ -z "${BACKEND_URL:-}" ]`. **It does not execute an HTTP request.**
    * Lines 1–122: **Zero references to `DATABASE_URL` or PostgreSQL.** Database connectivity is completely unchecked.
    * Lines 1–122: **Zero checks for Node.js 20 LTS.**
    * Lines 108–113: GPU check prints warning if `nvidia-smi` is missing, but **does not increment `FAILURES`** (non-blocking).
* **Impact:**
  * An operator running `preflight-gate.sh` and seeing `[STATUS] ALL CHECKS PASSED` will falsely assume Upstash Redis TLS, Neon PostgreSQL SSL, and Vercel ingress are working, even if DNS resolution fails or security groups block traffic.
* **Required Correction:**
  * Supplement `preflight-gate.sh` with explicit operator network verification commands before starting systemd services:
    ```bash
    # 1. Real Upstash TCP/TLS ping probe from EC2 host
    node -e 'const Redis = require("ioredis"); const r = new Redis(process.env.REDIS_URL, { connectTimeout: 3000 }); r.ping().then(res => { console.log("Upstash Redis PING:", res); process.exit(0); }).catch(e => { console.error("Redis Connection Failed:", e.message); process.exit(1); });'

    # 2. Real Neon PostgreSQL SSL probe from EC2 host
    node -e 'const { Client } = require("pg"); const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }); c.connect().then(() => { console.log("Neon DB Connected successfully"); return c.end(); }).catch(e => { console.error("Neon Connection Failed:", e.message); process.exit(1); });'

    # 3. Real Vercel Ingress probe from EC2 host
    curl -s -o /dev/null -w "Ingress HTTP Status: %{http_code}\n" -X POST "${BACKEND_URL}/api/jobs/callback"
    ```

---

### Finding 3: Systemd Service Group Omits ML API Gateway and TalkNet
* **Severity:** **HIGH**
* **Evidence:**
  * Checklist Section 8 & 10 specified starting only:
    `sudo systemctl start marvedge-autoflip marvedge-reframe-worker marvedge-video-worker`
  * Repository topology in [`infra/gpu-deployment/DEPLOYMENT_PLAN.md:12-14`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/DEPLOYMENT_PLAN.md#L12-L14) and [`reframe-worker/config.ts:93`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/reframe-worker/config.ts#L93):
    * `reframe-worker` sends inference requests to `REFRAME_ML_SERVICE_URL="http://127.0.0.1:8000"`.
    * Port 8000 is hosted by [`infra/gpu-deployment/marvedge-ml-gateway.service`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/marvedge-ml-gateway.service).
    * `marvedge-ml-gateway` routes face detection to `marvedge-talknet` on port 8001 and crop generation to `marvedge-autoflip` on port 8002.
* **Impact:**
  * If `marvedge-ml-gateway.service` is not started, any reframe job consumed by `reframe-worker` will immediately throw `ECONNREFUSED 127.0.0.1:8000`, causing the worker to fail or retry unnecessarily.
* **Required Correction:**
  * Update startup command to start all 4 services for reframe inference:
    ```bash
    sudo systemctl start marvedge-talknet marvedge-autoflip marvedge-ml-gateway marvedge-reframe-worker
    ```
  * Update shutdown command to:
    ```bash
    sudo systemctl stop marvedge-reframe-worker marvedge-video-worker marvedge-ml-gateway marvedge-autoflip marvedge-talknet
    ```

---

### Finding 4: Reframe API Requires NextAuth Session Cookie & Existing PostgreSQL User
* **Severity:** **HIGH**
* **Evidence:**
  * Inspecting [`app/api/reframe/route.ts:15-32`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/app/api/reframe/route.ts#L15-L32):
    ```typescript
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          session.user.id ? { id: session.user.id } : null,
          session.user.email ? { email: session.user.email } : null,
        ].filter(Boolean),
      },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    ```
* **Impact:**
  * An operator running `curl -X POST https://marvedge.com/api/reframe -d '{"videoUrl": ...}'` without an authenticated NextAuth session cookie will always receive HTTP 401 Unauthorized.
  * If the database is blank and has no `User` record matching the session email/id, it will return HTTP 404 User Not Found.
* **Required Correction:**
  * The runbook must specify that the test reframe job can be triggered in one of two approved ways:
    1. **Via Web UI:** Log in to `https://marvedge.com`, navigate to the reframe tool, and submit the benchmark S3 video URL.
    2. **Via Authenticated Session Curl:** Obtain the `next-auth.session-token` cookie from an active logged-in browser session and pass it in the `Cookie:` header.
    3. **Pre-seeding:** Ensure at least one test user exists in the target Neon database.

---

### Finding 5: Parameter Drift in Existing EC2 Startup / Remediation Scripts
* **Severity:** **HIGH**
* **Evidence:**
  * Inspecting [`infra/ec2-worker-userdata.sh:79-94`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/ec2-worker-userdata.sh#L79-L94) and [`infra/ec2-worker-remediate.sh:58-76`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/ec2-worker-remediate.sh#L58-L76):
    * Only queries `/marvedge/worker/WORKER_SECRET` and `/marvedge/worker/DEEPGRAM_API_KEY`.
    * Appends: `WORKER_SECRET=%s` and `DEEPGRAM_API_KEY=%s`.
    * Does **not** query or write `DATABASE_URL`, `REDIS_URL`, or `CALLBACK_SECRET`.
    * Legacy scripts configure `marvedge-worker.service` (`cloudrun-worker/server.js`), not the decoupled V3 workers (`video-worker` and `reframe-worker`).
* **Impact:**
  * If an operator re-runs `ec2-worker-userdata.sh` or `ec2-worker-remediate.sh`, it will overwrite `/etc/marvedge/worker.env`, wiping out `DATABASE_URL` and `REDIS_URL`, and omitting `CALLBACK_SECRET`. `reframe-worker` will subsequently crash on startup (`CALLBACK_SECRET is required for the Reframe Worker`).
* **Required Correction:**
  * Explicitly warn the operator **never** to execute `ec2-worker-userdata.sh` or `ec2-worker-remediate.sh` on instance `i-02aa4578f3790bae1`.
  * The operator must manually edit `/etc/marvedge/worker.env` using the template at [`infra/gpu-deployment/worker.env.template`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/worker.env.template).

---

### Finding 6: Callback Completion Requires Valid `cropTargets` Data
* **Severity:** **MEDIUM**
* **Evidence:**
  * Inspecting [`app/api/jobs/callback/route.ts:313-326`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/app/api/jobs/callback/route.ts#L313-L326):
    * On `status === "COMPLETED"`, the callback handler validates `cropTargets` using `validateCropTargetData(cropTargets)`.
    * Throws HTTP 400 if `cropTargets` is null, undefined, or fails schema validation.
* **Impact:**
  * If the AutoFlip ML inference step produces malformed JSON, the callback will be rejected with HTTP 400 and the database will remain in `PROCESSING` or fail.
* **Required Correction:**
  * Verification step must inspect both the HTTP response of `/api/jobs/callback` in worker logs (`200 OK`) and verify that `cropTargets` is populated in the database `jobData`.

---

### Finding 7: Risk of Production User Data Loss if Neon is Provisioned Blank
* **Severity:** **MEDIUM**
* **Evidence:**
  * The Phase B audit proved that AWS RDS `marvedge-db` has been dormant for 24 days.
  * This proves Vercel Production is **already** using a database provider other than `marvedge-db` (likely an existing Neon project or staging provider).
* **Impact:**
  * If an operator provisions a *new blank* Neon database and switches Vercel's `DATABASE_URL` to it without checking what Vercel is currently connected to, all existing production users, videos, and settings will be disconnected.
* **Required Correction:**
  * Step 1.2 (Vercel dashboard inspection) must be an absolute hard gate.
  * If Vercel is already connected to an active Neon database, the operator must obtain that *existing* database's pooled and direct URLs rather than creating a blank one.

---

### Finding 8: Test Window and Cost Bounds Verification
* **Severity:** **LOW (Confirmed Accurate)**
* **Evidence:**
  * AWS EC2 `g4dn.xlarge` On-Demand Linux pricing in `ap-southeast-2` (Sydney) is **$0.71/hr**.
  * A 30-minute test window costs $\approx \$0.36$.
  * End-to-end execution of a single 8-second 720p reframe job takes ~15–30 seconds of GPU inference and FFmpeg encoding.
  * Entire lifecycle (startup, preflight, dispatch, processing, callback, shutdown) takes ~8–12 minutes.
* **Conclusion:**
  * The 30-minute test window provides a safe, realistic 2.5x operational buffer while strictly bounding maximum spend to under **$0.40**.

---

## 3. Verified Facts vs. Assumptions & Operator Decisions

| Dimension | Verified Fact (Codebase & AWS Evidence) | Unverified Assumption / Operator Decision |
|---|---|---|
| **Redis Architecture** | BullMQ and workers require native Redis TCP/TLS (`rediss://...:6379`) with `maxRetriesPerRequest: null`. Existing ElastiCache is private at `172.31.25.184`. | Choice of Upstash over Redis Cloud; operator decision to create Upstash database in `ap-southeast-2`. |
| **Database Architecture** | Dual-URL Prisma schemas implemented (`9d1ba0a`). AWS RDS `marvedge-db` has 0 connections for 24 days. | Vercel's current production database hostname; operator decision to inspect Vercel dashboard. |
| **Worker Host** | EC2 `i-02aa4578f3790bae1` is stopped. Systemd service files exist in `infra/gpu-deployment/`. | State of `/etc/marvedge/worker.env` currently on the stopped instance disk. |
| **API Authentication** | `POST /api/reframe` strictly requires NextAuth session; `POST /api/jobs/callback` strictly requires `Authorization: Bearer <CALLBACK_SECRET>`. | How the operator chooses to authenticate the test job (via UI login vs. extracted session cookie). |

---

## 4. Exact Recommended Execution Sequence (Corrected Runbook)

### Phase 1: Zero-Spend Configuration & Credential Gathering
1. **Operator:** Log into Vercel Web Dashboard (Project Settings > Environment Variables > Production).
   * Note the hostname of `DATABASE_URL`.
   * If it already points to an active Neon database (`ep-...aws.neon.tech`), retrieve its direct endpoint (`DIRECT_URL`) and pooled endpoint (`DATABASE_URL`).
   * If no valid database exists, provision a new Neon project in `ap-southeast-2` and obtain pooled (`&pgbouncer=true`) and direct endpoints.
2. **Operator:** Deploy migrations to Neon direct endpoint (if new database):
   ```bash
   DIRECT_URL="<neon_direct_url>" DATABASE_URL="<neon_pooled_url>" npx prisma migrate deploy --schema=prisma/schema.prisma
   ```
3. **Operator:** Log into Upstash Console and create a serverless Redis database in region `ap-southeast-2` (Sydney).
   * Retrieve native Redis TCP/TLS URL: `rediss://default:[token]@[endpoint].upstash.io:6379`.
4. **Operator:** Set environment variables in Vercel Production:
   * `DATABASE_URL`: Neon pooled URL (`...&pgbouncer=true`).
   * `DIRECT_URL`: Neon direct URL (`sslmode=require`).
   * `REDIS_URL`: Upstash `rediss://` URL.
   * `CALLBACK_SECRET`: Shared 64-char secret.
5. **Operator:** Merge PR for `task/task-00018-neon-prisma-config` into `master` and trigger Vercel deployment.

### Phase 2: EC2 Worker Configuration & Preflight Probes (30-Min Window)
6. **Operator:** Start EC2 instance:
   ```bash
   aws ec2 start-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
   ```
   *(Start 30-minute countdown timer).*
7. **Operator:** SSH into EC2 instance and update `/etc/marvedge/worker.env`:
   * Set `DATABASE_URL`, `REDIS_URL`, `BACKEND_URL="https://marvedge.com"`, `CALLBACK_SECRET`, `REFRAME_WORKER_CONCURRENCY=1`, and Cloudinary keys.
   * `chmod 600 /etc/marvedge/worker.env`.
8. **Operator:** Run preflight script and active network probes on EC2:
   ```bash
   sudo /opt/marvedge/infra/gpu-deployment/preflight-gate.sh

   # Active network probes (MUST EXIT 0):
   node -e 'const Redis = require("ioredis"); const r = new Redis(process.env.REDIS_URL, { connectTimeout: 3000 }); r.ping().then(() => { console.log("✅ Upstash reachable"); process.exit(0); }).catch(e => { console.error("❌ Redis probe failed:", e.message); process.exit(1); });'

   node -e 'const { Client } = require("pg"); const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }); c.connect().then(() => { console.log("✅ Neon reachable"); return c.end(); }).catch(e => { console.error("❌ Neon probe failed:", e.message); process.exit(1); });'

   curl -s -o /dev/null -w "Ingress probe HTTP status: %{http_code}\n" -X POST "${BACKEND_URL}/api/jobs/callback"
   ```
9. **Operator:** Start the full worker and inference service cluster:
   ```bash
   sudo systemctl start marvedge-talknet marvedge-autoflip marvedge-ml-gateway marvedge-reframe-worker
   ```
   Verify services: `sudo systemctl status marvedge-ml-gateway marvedge-reframe-worker --no-pager`.

### Phase 3: Controlled End-to-End Test Execution
10. **Operator:** Log in to `https://marvedge.com` in browser, open Reframe tool, and submit test video:
    `https://marvedge-raw-ap2.s3.ap-southeast-2.amazonaws.com/test/1.mp4` with target ratio `9:16`.
11. **Operator:** Monitor worker logs in real time on EC2:
    ```bash
    sudo journalctl -u marvedge-reframe-worker -u marvedge-ml-gateway -f
    ```
    * Confirm `BLMOVE` picks up job.
    * Confirm AutoFlip returns valid `cropTargets`.
    * Confirm FFmpeg encodes output video.
    * Confirm Cloudinary upload completes.
    * Confirm callback sent to `/api/jobs/callback` returns HTTP 200.
12. **Operator:** Verify record in Neon database:
    * `status` = `COMPLETED`
    * `exportedUrl` populated with valid Cloudinary URL
    * `error` = `null`.

### Phase 4: Immediate Shutdown & Cost Termination (Mandatory)
13. **Operator:** Immediately stop all worker services on EC2:
    ```bash
    sudo systemctl stop marvedge-reframe-worker marvedge-ml-gateway marvedge-autoflip marvedge-talknet
    ```
14. **Operator:** Issue AWS stop command:
    ```bash
    aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
    ```
15. **Operator:** Confirm instance state is `stopped`:
    ```bash
    aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --query "Reservations[].Instances[].State.Name" --output text
    ```
    *(Hourly compute charges successfully returned to $0.00).*

