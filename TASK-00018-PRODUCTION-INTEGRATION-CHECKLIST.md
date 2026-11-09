# TASK-00018 — Production Pipeline Integration Dependency & Authorization Checklist

**Date:** 2026-11-04  
**Branch:** `task/task-00018-neon-prisma-config`  
**Execution Context:** Worktree `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge-task-00103`  
**Completed Implementation Commits:**
- `9d1ba0a` — `feat(db): configure Neon pooled runtime and direct migration endpoints for Prisma`
- `528258e` — `feat(redis): harmonize worker BullMQ connection options and load-test precedence`
**Scope:** Consolidated operational, infrastructure, credential, authorization, and execution sequence for the Marvedge V3 production pipeline dry run.

---

## 1. Redis Provider Selection & Provisioning Requirements

* **Current Status:**
  * AWS ElastiCache (`marvedge-redis` at `172.31.25.184:6379`) is active and healthy in `ap-southeast-2` (VPC `vpc-017e4bbdf3e18a004`), but strictly private. Vercel serverless functions running over the public internet in `iad1` cannot reach it.
  * Application codebase, workers, and load tests are 100% harmonized for native Redis TCP/TLS (`rediss://...:6379`) via commit `528258e`.
* **What is Missing:**
  * Operator decision to provision or link an external serverless Redis database (Upstash recommended).
  * Provisioning of Upstash Redis instance in AWS Sydney (`ap-southeast-2`) to maintain sub-2ms network latency to the EC2 GPU worker.
  * Retrieval of the native TCP/TLS connection string: `rediss://default:[token]@[endpoint].upstash.io:6379`.
* **Required Authorization / Role:**
  * **Operator / Infrastructure Lead:** Account owner access to Upstash (or Redis Cloud).
* **Cost & Production Impact:**
  * **Cost:** $0.00/month on Upstash Free Tier (<500,000 commands/month; sufficient for staging and dry runs), or ~$2.00–$5.20/month on Pay-As-You-Go under continuous load.
  * **Production Impact:** Zero impact on existing ElastiCache. ElastiCache remains active on standby as an immediate fallback.
* **Dependencies & Execution Order:**
  * **Order 1.1:** Must be provisioned before setting environment variables in Vercel or EC2.

---

## 2. Vercel Production Database Provider Identification

* **Current Status:**
  * AWS RDS PostgreSQL 16.15 instance `marvedge-db` (`db.t3.micro`, Sydney) has had **0.0 active database connections for 24 consecutive days** (verified via AWS CloudWatch metrics).
  * RDS Security Group `sg-05c4436fe3afb09ac` drops all ingress except `182.72.39.9/32`.
  * Vercel Production functions execute in `iad1` on dynamic IP pools; Vercel is definitively **not** communicating with `marvedge-db`.
  * Local Vercel CLI is unauthenticated; direct metadata inspection from the terminal was restricted.
* **What is Missing:**
  * Visual verification of the Vercel Production `DATABASE_URL` hostname classification via the Vercel Web Dashboard (Project Settings > Environment Variables > Production).
  * Confirmation of whether Vercel currently connects to Neon (`*.neon.tech`), Supabase, or another provider.
* **Required Authorization / Role:**
  * **Vercel Project Admin / Team Owner:** Access to inspect environment variables in the Vercel dashboard.
* **Cost & Production Impact:**
  * **Cost:** $0.00 (read-only inspection).
  * **Production Impact:** None.
* **Dependencies & Execution Order:**
  * **Order 1.2:** Must be verified before executing migrations or updating database strings to determine whether production data migration is required.

---

## 3. Verified Neon Project Availability & Migration Readiness Gate

* **Current Status:**
  * Neon dual-URL Prisma configuration is fully verified and committed via commit `9d1ba0a`:
    * `url = env("DATABASE_URL")` (Neon connection-pooled endpoint for runtime queries).
    * `directUrl = env("DIRECT_URL")` (Neon direct compute endpoint for schema migrations and DDL locks).
  * **Verified Endpoints:**
    * Pooled Host: `ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech` (Target DB: `marvedge-neon-db-1`).
    * Direct Host: `ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech` (Target DB: `marvedge-neon-db-1`).
  * **Pooler & Driver Compatibility:** Neon's pooler runs PgBouncer 1.21.0+, which natively tracks prepared statements. With Prisma 6.19.x, appending `&pgbouncer=true` is **not required**; standard `?sslmode=require` is fully supported.
  * **Local Schema vs. Production Migration Status:**
    * Validating the 27 migration files in `prisma/migrations/` confirms that the local schema datamodel matches local migration history.
    * **Crucial distinction:** Local validation does **NOT** prove that migrations have been applied to production. Production migration status lives exclusively in the `_prisma_migrations` table inside the Neon database.
* **Mandatory Pre-Deployment Status Inspection:**
  * An authorized operator must inspect the migration status via the direct connection before executing any migration:
    ```bash
    npx prisma migrate status --schema=prisma/schema.prisma
    ```
    *or direct read-only SQL in Neon Console:*
    ```sql
    SELECT id, migration_name, finished_at, applied_steps_count, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC;
    ```
  * **Safety Gate:** Do **NOT** run `prisma migrate deploy` blindly. If tables exist without `_prisma_migrations` records, `prisma migrate deploy` will fail on table collisions; existing migrations must be resolved (`prisma migrate resolve --applied`) first.
* **Required Authorization / Role:**
  * **Authorized Operator / Database Administrator:** Direct connection access to inspect `_prisma_migrations`.
* **Cost & Production Impact:**
  * **Cost:** $0.00 for read-only status inspection.
  * **Production Impact:** Zero modification to database records or tables during inspection.
* **Dependencies & Execution Order:**
  * **Order 1.3:** Operator status check must be completed before Vercel environment deployment.

---

## 4. Required Vercel Environment Variables

* **Current Status:**
  * Repository configuration templates (`.env.example`) have been completely documented.
* **What is Missing:**
  * Configuration of the following variables in Vercel Project Settings (Production Environment):
    | Variable | Target Value / Format | Purpose |
    |---|---|---|
    | `DATABASE_URL` | `postgresql://...@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require` | Application runtime query pooling |
    | `DIRECT_URL` | `postgresql://...@ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require` | Prisma migration lock execution |
    | `REDIS_URL` | `rediss://default:[token]@[endpoint].upstash.io:6379` | BullMQ queue producer dispatch |
    | `CALLBACK_SECRET` | 64-character high-entropy hex string | HMAC/Bearer auth for `/api/jobs/callback` |
* **Required Authorization / Role:**
  * **Vercel Team Admin:** Update environment variables in dashboard or via authenticated CLI.
* **Cost & Production Impact:**
  * **Cost:** $0.00.
  * **Production Impact:** Requires a production redeployment to take effect.
* **Dependencies & Execution Order:**
  * **Order 2.1:** Depends on Sections 1 & 3 (obtaining Redis and Neon URLs).

---

## 5. Required EC2 Worker Environment Variables

* **Current Status:**
  * File location on EC2 host: `/etc/marvedge/worker.env` (managed with `chmod 600`).
  * Updated template committed at [`infra/gpu-deployment/worker.env.template`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/worker.env.template).
* **What is Missing:**
  * Operator updating `/etc/marvedge/worker.env` on EC2 instance `i-02aa4578f3790bae1` with the reconciled variables:
    ```bash
    NODE_ENV=production
    DATABASE_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require"
    REDIS_URL="rediss://default:[token]@[endpoint].upstash.io:6379"
    BACKEND_URL="https://marvedge.com"
    CALLBACK_SECRET="[matching_64_char_secret]"
    WORKER_CONCURRENCY="1"
    DEEPGRAM_API_KEY="[valid_key]"
    ELEVENLABS_API_KEY="[valid_key]"
    CLOUDINARY_CLOUD_NAME="[name]"
    CLOUDINARY_API_KEY="[key]"
    CLOUDINARY_API_SECRET="[secret]"
    ```
* **Required Authorization / Role:**
  * **AWS Operator / System Administrator:** SSH/SSM access to the EC2 worker instance.
* **Cost & Production Impact:**
  * **Cost:** $0.00.
  * **Production Impact:** Only affects worker process once started.
* **Dependencies & Execution Order:**
  * **Order 2.2:** Execute concurrently with Vercel environment update (Order 2.1).

---

## 6. AWS SSM Parameter Store Requirements

* **Current Status:**
  * EC2 setup scripts reference `/marvedge/worker/*` in AWS SSM (`ap-southeast-2`).
* **What is Missing:**
  * Verification/population of SecureString parameters:
    * `/marvedge/worker/DATABASE_URL`
    * `/marvedge/worker/REDIS_URL`
    * `/marvedge/worker/WORKER_SECRET` (or `CALLBACK_SECRET`)
    * `/marvedge/worker/DEEPGRAM_API_KEY`
    * `/marvedge/worker/ELEVENLABS_API_KEY`
* **Required Authorization / Role:**
  * **AWS IAM Administrator:** Permissions for `ssm:PutParameter`, `ssm:GetParameter`.
* **Cost & Production Impact:**
  * **Cost:** Free (Standard SSM parameters are free of charge).
  * **Production Impact:** Zero.
* **Dependencies & Execution Order:**
  * **Order 2.3:** Required before worker instances rebuild or pull parameters via launch scripts.

---

## 7. Vercel Deployment & Route Ingress Verification

* **Current Status:**
  * PR for `task/task-00018-neon-prisma-config` (containing `9d1ba0a` and `528258e`) is ready for review and merge into `origin/master`.
* **What is Missing:**
  * Pull request review, approval, and merge into `master`.
  * Triggering a fresh Vercel production build.
  * Ingress route sanity verification:
    ```bash
    # Verify routes exist and return HTTP 401 Unauthorized (Auth working; not 404 or 500)
    curl -I -X POST https://marvedge.com/api/reframe
    curl -I -X POST https://marvedge.com/api/avs/dub
    curl -I -X POST https://marvedge.com/api/jobs/callback
    ```
* **Required Authorization / Role:**
  * **Repository Reviewer & Vercel Deployer.**
* **Cost & Production Impact:**
  * **Cost:** $0.00.
  * **Production Impact:** Activates the dual-URL Prisma schema and Redis options in production web runtime.
* **Dependencies & Execution Order:**
  * **Order 3.1:** Depends on Sections 3 & 4 (database migrations deployed and environment variables set).

---

## 8. EC2 Startup & Worker Preflight Verification

* **Current Status:**
  * Worker instance `i-02aa4578f3790bae1` is currently **STOPPED** ($0/hr compute).
  * Preflight script [`infra/gpu-deployment/preflight-gate.sh`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/infra/gpu-deployment/preflight-gate.sh) is verified and ready.
* **What is Missing:**
  * Operator starts the EC2 instance:
    ```bash
    aws ec2 start-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
    ```
  * Operator runs preflight gate on host:
    ```bash
    ssh ec2-user@[ec2-ip] "sudo /opt/marvedge/infra/gpu-deployment/preflight-gate.sh"
    ```
  * Preflight validation gates:
    * Gate 1: NVIDIA Tesla T4 GPU driver & CUDA operational (`nvidia-smi`).
    * Gate 2: Node.js 20 LTS runtime verified.
    * Gate 3: Upstash Redis TCP/TLS connectivity (`rediss://...:6379`) confirmed.
    * Gate 4a: Neon TCP Outbound Connectivity Probes (both pooled & direct endpoints on port 5432, credential-free):
      ```bash
      node -e '
      const net = require("net");
      ["ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech", "ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech"].forEach(host => {
        const s = net.createConnection(5432, host, () => {
          console.log("OK: TCP 5432 reachable -> " + host);
          s.end();
        });
        s.on("error", e => console.error("FAIL: " + host + " - " + e.message));
      });
      '
      ```
    * Gate 4b: Neon PostgreSQL SSL connection (`sslmode=require`) authenticated query probe confirmed.
    * Gate 5: Backend callback URL (`https://marvedge.com`) reachable.
  * Start systemd services:
    ```bash
    sudo systemctl start marvedge-autoflip marvedge-reframe-worker marvedge-video-worker
    ```
* **Required Authorization / Role:**
  * **AWS Operator / Sysadmin.**
* **Cost & Production Impact:**
  * **Cost:** EC2 `g4dn.xlarge` runs at ~$0.65/hour on-demand in Sydney. A 30-minute test run costs $\approx \$0.33$.
  * **Production Impact:** Workers begin polling BullMQ on Upstash for incoming jobs.
* **Dependencies & Execution Order:**
  * **Order 4.1:** Depends on Section 5 & 7 (worker environment set and Vercel deployed).

---

## 9. Controlled Single-Job End-to-End Test

* **Current Status:**
  * Benchmark test video verified: `https://marvedge-raw-ap2.s3.ap-southeast-2.amazonaws.com/test/1.mp4` (8.04 seconds, 1280x720, 25 fps).
* **What is Missing:**
  * Execution of a single authenticated end-to-end video reframe job via the webapp API.
* **Execution & Telemetry Tracking Steps:**
  1. **Job Enqueue:** POST request to `https://marvedge.com/api/reframe` with target aspect ratio `9:16`.
  2. **BullMQ Dispatch:** Inspect Upstash Redis dashboard; confirm 1 job added to `reframe-processing`.
  3. **Worker Processing:** Monitor `journalctl -u marvedge-reframe-worker -f` on EC2:
     * Job lock acquired via `BLMOVE`.
     * Media downloaded to temporary scratch storage.
     * AutoFlip ML inference executed on Tesla T4 GPU ($<2.5\text{s}$).
     * FFmpeg crop filter applied and MP4 rendered.
     * Rendered asset uploaded to Cloudinary (`reframed_[jobId].mp4`).
     * Authenticated callback delivered to `https://marvedge.com/api/jobs/callback`.
  4. **Database Verification:** Verify Prisma record updated in Neon: status = `COMPLETED`, `exportedUrl` populated, `error` = `null`.
  5. **Total Processing Watchdog:** Entire pipeline completes within 60–90 seconds.
* **Required Authorization / Role:**
  * **Test Operator / QA Engineer.**
* **Cost & Production Impact:**
  * **Cost:** Negligible (<$0.01 in Cloudinary bandwidth and Deepgram/ElevenLabs API calls).
  * **Production Impact:** 1 test video generated.
* **Dependencies & Execution Order:**
  * **Order 5.1:** Follows successful preflight gate (Section 8).

---

## 10. Rollback & Post-Test Immediate Shutdown Procedure

* **Current Status:**
  * EC2 instance is currently safely stopped.
* **Post-Test Shutdown Procedure (MANDATORY TO RESTORE ZERO SPEND):**
  1. Stop systemd services on host:
     ```bash
     sudo systemctl stop marvedge-reframe-worker marvedge-video-worker marvedge-autoflip
     ```
  2. Immediately issue AWS EC2 stop command:
     ```bash
     aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
     ```
  3. Verify instance status transitions from `stopping` to `stopped`:
     ```bash
     aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --query "Reservations[].Instances[].State.Name" --output text
     ```
* **Rollback Plan (In the Event of Test Anomaly):**
  1. **If Redis Fails:** Revert Vercel `REDIS_URL` and EC2 `/etc/marvedge/worker.env` back to ElastiCache VPC internal address. ElastiCache has remained untouched.
  2. **If Neon Database Fails:** Revert Vercel `DATABASE_URL` and `DIRECT_URL`. AWS RDS `marvedge-db` has remained 100% untouched and preserved.
  3. **If Worker Inference Wedges:** Terminate worker process; logs are preserved in systemd journal and CloudWatch.
* **Required Authorization / Role:**
  * **AWS Operator.**
* **Cost & Production Impact:**
  * Prevents accidental continuous billing on `g4dn.xlarge`. Restores zero hourly spend.
* **Dependencies & Execution Order:**
  * **Order 6.1:** Must execute immediately after the single-job test concludes.

---

## 11. Final Operator Authorization & Sign-Off Checklist

Before any live command is executed, the operator must review and confirm the following 5 critical decisions:

```
[ ] DECISION 1: REDIS PROVIDER APPROVAL
    Approve provisioning serverless Redis in AWS Sydney (ap-southeast-2) via Upstash (Free/Pay-As-You-Go).
    Confirmed: AWS ElastiCache remains active on standby.

[ ] DECISION 2: DATABASE RECONCILIATION & MIGRATION STATUS APPROVAL
    Inspect Vercel production dashboard to identify current DATABASE_URL host.
    Approve standardizing on Neon PostgreSQL (ep-holy-lab-a48mzff9, us-east-1, db: marvedge-neon-db-1) with dual-URL configuration.
    Operator executes `npx prisma migrate status --schema=prisma/schema.prisma` via DIRECT_URL to verify whether migrations are pending.
    Confirmed: AWS RDS marvedge-db is preserved untouched.

[ ] DECISION 3: PR MERGE & VERCEL DEPLOYMENT APPROVAL
    Approve merging branch `task/task-00018-neon-prisma-config` (commits 9d1ba0a and 528258e) into master.
    Approve deploying dual-URL Prisma and harmonized Redis options to Vercel production.

[ ] DECISION 4: ENVIRONMENT VARIABLES APPROVAL
    Approve setting DATABASE_URL, DIRECT_URL, REDIS_URL, and CALLBACK_SECRET across Vercel and EC2 worker.env.

[ ] DECISION 5: EC2 TEST WINDOW & SHUTDOWN COMMITMENT
    Authorize starting EC2 instance `i-02aa4578f3790bae1` for a strict 30-minute maximum test window.
    Commit to immediate execution of `aws ec2 stop-instances` upon test completion.
```

