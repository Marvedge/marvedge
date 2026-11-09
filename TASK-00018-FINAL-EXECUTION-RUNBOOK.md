# TASK-00018 — Final Production Integration Execution Runbook

**Document Version:** 1.0.0 (Production-Ready)  
**Execution Date:** Post-Authorization  
**Target Repository:** `marvedge`  
**Active Worktree:** `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge-task-00103`  
**Branch:** `task/task-00018-neon-prisma-config`  
**Committed Repository Changes:**
- `9d1ba0a` — `feat(db): configure Neon pooled runtime and direct migration endpoints for Prisma`
- `528258e` — `feat(redis): harmonize worker BullMQ connection options and load-test precedence`
**Scope:** Definitive, audited, operational runbook for executing the Marvedge V3 pipeline dry run, establishing hard safety gates, precise network verification, explicit rollback procedures, and strict spend caps.

---

## 1. Architectural Scope Boundary: Reframe-Only vs. Full V3 Pipeline

To minimize operational risk and bound debug complexity, execution is split into two distinct tiers:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               ARCHITECTURAL VALIDATION SCOPE                           │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│ Tier 1: Reframe-Only Validation (Current) │ Tier 2: Complete V3 Pipeline (Subsequent)   │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Queue: "reframe-processing" only       │ • Queues: "video-processing", "dubbing-     │
│ • Worker: reframe-worker (Node.js 20)    │   processing", "subtitle-processing", etc.  │
│ • ML Services: TalkNet, AutoFlip,        │ • Workers: video-worker + reframe-worker    │
│   ML Gateway (ports 8000, 8001, 8002)    │ • External APIs: Deepgram (STT), ElevenLabs │
│ • Storage: Cloudinary (video upload)     │   (TTS), Cloudinary (full exports)          │
│ • External APIs: None (Zero ElevenLabs/  │ • Database: Heavy Prisma writes across jobs │
│   Deepgram API calls needed)             │ • Services: 6 systemd units active          │
│ • Database: Single VideoJob record update│                                             │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

> [!IMPORTANT]
> This runbook is strictly configured for **Tier 1: Reframe-Only Validation**. It validates the complete end-to-end cloud loop (Vercel Webapp $\rightarrow$ Upstash Redis $\rightarrow$ EC2 Tesla T4 GPU $\rightarrow$ Cloudinary $\rightarrow$ Vercel Webhook Callback $\rightarrow$ PostgreSQL) with the smallest possible surface area.

---

## 2. Hard Database Safety Gate

### 2.1 Provider Verification Rule
**Under NO circumstances may an operator switch Vercel's production `DATABASE_URL` to a blank database without verifying the existing production database.**

1. **The Risk:** AWS RDS `marvedge-db` has been dormant for 24+ days (0.0 connections). Vercel Production (`iad1`) is definitively connected to another database provider. If an operator provisions a new empty Neon database and points Vercel to it, all live user accounts, session tokens, and video assets will be disconnected.
2. **Schema Migration vs. Data Migration:**
   * **Schema Migration (`prisma migrate deploy`):** Deploys 27 structural DDL migrations (`User`, `Account`, `VideoJob`, etc.). Safe to run on a new database or staging database.
   * **Data Migration (Dump & Restore):** Required if migrating existing production records from one database to another.
3. **Mandatory Step 0 Gate:**
   The operator must log into the Vercel Dashboard, inspect the production `DATABASE_URL` hostname, and classify it:
   * **If pointing to an existing Neon project (`ep-...aws.neon.tech`):** Obtain the existing project's pooled and direct endpoints. DO NOT create a new blank database.
   * **If pointing to Supabase / AWS / Other:** Verify whether production user data exists. If data exists, an approved data migration plan must be authorized before switching.
   * **If confirmed to be a fresh/test deployment:** A new Neon database may be designated.

### 2.2 Verified Dual-URL Neon Architecture
The repository's dual-URL configuration has been verified in commit `9d1ba0a`:
* **Pooled Runtime URL (`DATABASE_URL`):** Connects to `ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech` (Target DB: `marvedge-neon-db-1`) with `?sslmode=require`.
  * *`pgbouncer=true` Analysis:* Modern Neon runs PgBouncer 1.21.0+, which natively supports prepared statements. In combination with Prisma 6.19.x, appending `&pgbouncer=true` is **not required**; standard `?sslmode=require` is fully compliant.
* **Direct Migration URL (`DIRECT_URL`):** Connects to `ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech` (Target DB: `marvedge-neon-db-1`) with `?sslmode=require`. Used exclusively by Prisma CLI for migrations and session-level advisory locks.

### 2.3 Local Migration History Validation vs. Production Migration Status
* **Local Codebase State:** The 27 migrations in `prisma/migrations/` validate cleanly against `prisma/schema.prisma`. This proves local schema integrity only.
* **Production Database State:** The true production migration state lives **exclusively** in the `_prisma_migrations` table inside the Neon database.
* **CRITICAL SAFETY RULE:** Local migration validation does **NOT** prove that any migrations have been applied to production. An authorized operator must inspect the production database state before running any deploy or migration command.

### 2.4 Mandatory Migration Status Check (Do Not Deploy Blindly)
Before executing `prisma migrate deploy`, the operator must execute `prisma migrate status` via the direct connection:
* If the target database is already tracking migrations and only new migrations are pending: Proceed with `prisma migrate deploy`.
* If tables already exist in Neon without `_prisma_migrations` (e.g. created via `db push` or a database restore): Running `prisma migrate deploy` will fail on table collisions (`relation already exists`). Existing migrations must first be baselined or resolved via `prisma migrate resolve --applied <migration_name>`.
* If all 27 migrations are recorded as completed in `_prisma_migrations`: Running `prisma migrate deploy` is a no-op and unnecessary.

---

## 3. Cost & Spend Transparency

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                             VERIFIED COSTS VS. ESTIMATES                               │
├────────────────────────────┬─────────────────────────────┬─────────────────────────────┤
│ Resource / Service         │ Pricing Model & Rate        │ 30-Minute Dry Run Total     │
├────────────────────────────┼─────────────────────────────┼─────────────────────────────┤
│ EC2 Instance (g4dn.xlarge) │ $0.7100 / hour (Sydney OD)  │ $0.3550 (Verified AWS Rate) │
│ AWS Public IPv4 Address    │ $0.0050 / hour              │ $0.0025 (Verified AWS Rate) │
│ AWS EBS (100 GB gp3 root)  │ $0.0960 / GB-month          │ Fixed ~$0.31/day ($0.013/hr)│
│ Upstash Redis (Sydney)     │ Free Tier (<500k cmds/mo)   │ $0.0000 (1 job = ~25 cmds)  │
│ Cloudinary Upload / Bandwidth Free Tier (<25 GB/mo)      │ $0.0000 (~15 MB MP4 output) │
│ Vercel Serverless Invocation Included in Plan            │ $0.0000 (2 requests)        │
├────────────────────────────┴─────────────────────────────┴─────────────────────────────┤
│ MAXIMUM TOTAL COMPUTE SPEND FOR CONTROLLED DRY RUN:        $0.37 USD                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Verified Cost:** Compute and IPv4 costs are strictly time-bound. Bounding instance execution to 30 minutes guarantees compute spend under **$0.40 USD**.
* **EBS Storage Assumption:** Root volume 100 GB gp3 incurs ~$9.60/month ($0.31/day) continuously regardless of instance state (`running` or `stopped`).
* **External API Cost:** Zero ($0.00) for Tier 1 reframe validation (no ElevenLabs or Deepgram calls).

---

## 4. Readiness Status & Verification Categories

### 4.1 Four-Category Readiness Classification

| Category | Status | Details |
| :--- | :---: | :--- |
| **1. Completed & Locally Verified Implementation** | **100% COMPLETE** | • Neon Prisma Dual-URL configuration (pooled runtime / direct migrations).<br>• Redis environment-aware resolver (`resolveRedisUrl`) across all 4 sites.<br>• Vercel cold-start options: `enableReadyCheck: false`, `connectTimeout: 5000`, `maxRetriesPerRequest: null`.<br>• BullMQ 5.78.0 dedicated worker connection architecture verified.<br>• Local native Redis TLS PING test verified (`PONG` in ~254ms).<br>• 37 vitest unit tests, TypeScript, ESLint, and diff checks passing cleanly. |
| **2. Pending Production Configuration** | **PENDING OPERATOR** | • Vercel Production Environment: Set `REDIS_URL` and `CALLBACK_SECRET`.<br>• EC2 Worker Host: Populate `/etc/marvedge/worker.env` with `REDIS_URL`, `CALLBACK_SECRET`, and `DATABASE_URL`. |
| **3. Pending Authorized Infrastructure Actions** | **PENDING OPERATOR** | • Direct migration status inspection (`prisma migrate status`) against Neon.<br>• Authorized startup of EC2 instance `i-02aa4578f3790bae1` in Sydney.<br>• In-VPC network probes verifying outbound TCP 5432 and TCP 6379. |
| **4. Live Integration Tests Not Yet Performed** | **NOT EXECUTED** | • Controlled Reframe job dispatch from Vercel to Upstash Redis.<br>• EC2 GPU job consumption, TalkNet + AutoFlip inference, Cloudinary upload.<br>• Authenticated callback delivery to `/api/jobs/callback` and DB update.<br>• **CRITICAL:** Production deployment, migrations, and live EC2 pipeline validation have **NOT** yet been executed or succeeded. |

### 4.2 Final Prerequisite & Authorization Checklist

The following 5 sign-offs must be checked before proceeding to live commands:

```
[ ] PREREQUISITE 1: OPERATOR DATABASE & MIGRATION STATUS SIGN-OFF
    Vercel Production dashboard inspected.
    Production database hostname recorded: ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech
    Target database confirmed: marvedge-neon-db-1
    Operator executed `npx prisma migrate status --schema=prisma/schema.prisma` via DIRECT_URL.
    Production migration status recorded (applied count, pending count, drift status): ______________
    Confirmed: Zero unmanaged table collisions; migration strategy approved.

[ ] PREREQUISITE 2: UPSTASH REDIS PROVISIONING
    Serverless Redis created in AWS Sydney (ap-southeast-2).
    Wire connection string verified: rediss://default:[token]@[endpoint].upstash.io:6379
    Confirmed: AWS ElastiCache (marvedge-redis) remains active on standby.

[ ] PREREQUISITE 3: CODE DEPLOYMENT & PR MERGE
    Branch `task/task-00018-neon-prisma-config` (commits 9d1ba0a and 528258e) merged into master.
    Vercel production deployment completed successfully.

[ ] PREREQUISITE 4: TEST USER AUTHENTICATION PREPARATION
    Active user account verified in the target PostgreSQL database.
    Operator has browser session logged into https://marvedge.com OR valid session cookie.

[ ] PREREQUISITE 5: 30-MINUTE HARD-STOP WATCHDOG COMMITMENT
    Operator confirms instance `i-02aa4578f3790bae1` will be stopped within 30 minutes
    regardless of test outcome to prevent runaway compute spend.
```

---

## 5. Exact Step-by-Step Execution Sequence

### Phase 1: Database & Remote Environment Preparation (Zero Compute Spend)

#### Step 1.1 — Inspect Production Migration Status (Mandatory Operator Gate)
Before applying any migration, an authorized operator must inspect the target Neon database state:
```bash
DIRECT_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require" \
DATABASE_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require" \
npx prisma migrate status --schema=prisma/schema.prisma
```
* **Evaluation:**
  * **Case A: Database is up-to-date (`Database schema is up to date`):** Skip to Step 1.2.
  * **Case B: Migrations are pending and database tracks prior migrations:** Execute deploy:
    ```bash
    DIRECT_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require" \
    DATABASE_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require" \
    npx prisma migrate deploy --schema=prisma/schema.prisma
    ```
  * **Case C: Tables exist without `_prisma_migrations`:** Do **NOT** run deploy. Baseline migrations using `npx prisma migrate resolve --applied <migration_name>` for each already-created table to prevent collision errors.

#### Step 1.2 — Configure Vercel Production Environment Variables
In Vercel Project Settings > Environment Variables > Production:
* `DATABASE_URL` = `postgresql://[user]:[password]@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require`
* `DIRECT_URL` = `postgresql://[user]:[password]@ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require`
* `REDIS_URL` = `rediss://default:[token]@[endpoint].upstash.io:6379`
* `CALLBACK_SECRET` = `[64-character-hex-secret]`

#### Step 1.3 — Trigger Vercel Production Build & Verify Ingress Routes
Trigger deployment of `master` and verify routes exist over public internet:
```bash
# Must return HTTP 401 Unauthorized (Confirms route is live and rejecting unauthenticated requests)
curl -s -o /dev/null -w "Reframe Route Status: %{http_code}\n" -X POST https://marvedge.com/api/reframe
curl -s -o /dev/null -w "Callback Route Status: %{http_code}\n" -X POST https://marvedge.com/api/jobs/callback
```
*Expected output: Both return `401`.*

---

### Phase 2: EC2 Worker Configuration & Active Network Probes

> [!WARNING]
> Starting the EC2 instance begins the 30-minute test window. Start a stopwatch immediately.

#### Step 2.1 — Start EC2 GPU Worker
```bash
aws ec2 start-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
aws ec2 wait instance-running --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
```
Retrieve public IP:
```bash
EC2_IP=$(aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --query "Reservations[].Instances[].PublicIpAddress" --output text)
echo "Worker Public IP: $EC2_IP"
```

#### Step 2.2 — Update `/etc/marvedge/worker.env` on Host
SSH into the worker host. Update `/etc/marvedge/worker.env` with exact parameters:
```bash
ssh ec2-user@$EC2_IP
```
```bash
sudo install -d -m 0700 /etc/marvedge
sudo tee /etc/marvedge/worker.env > /dev/null << 'EOF'
NODE_ENV=production
DATABASE_URL="postgresql://[user]:[password]@ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech/marvedge-neon-db-1?sslmode=require"
REDIS_URL="rediss://default:[token]@[endpoint].upstash.io:6379"
BACKEND_URL="https://marvedge.com"
CALLBACK_SECRET="[matching-64-char-secret]"
REFRAME_WORKER_CONCURRENCY=1
WORKER_CONCURRENCY=1
REFRAME_ML_SERVICE_URL="http://127.0.0.1:8000"
AUTOFILP_SERVICE_URL="http://127.0.0.1:8002"
TALKNET_SERVICE_URL="http://127.0.0.1:8001"
TALKNET_S3FD_WEIGHTS="/opt/marvedge/talknet/weights/sfd_face.pth"
TALKNET_MODEL_WEIGHTS="/opt/marvedge/talknet/weights/pretrain_TalkSet.model"
AUTOFILP_BINARY_PATH="/usr/local/bin/run_autoflip_to_json"
CLOUDINARY_CLOUD_NAME="marvedge"
CLOUDINARY_API_KEY="[your-key]"
CLOUDINARY_API_SECRET="[your-secret]"
EOF
sudo chown -R ec2-user:ec2-user /etc/marvedge
sudo chmod 600 /etc/marvedge/worker.env
```
*(Never execute `ec2-worker-userdata.sh` or `ec2-worker-remediate.sh`).*

#### Step 2.3 — Execute Preflight Script & Active Network Probes
Run the repo preflight gate followed by live network socket probes:
```bash
# 1. Run local file & environment syntax gate
sudo /opt/marvedge/infra/gpu-deployment/preflight-gate.sh

# 2. Source environment safely (never print secrets)
set -a && source /etc/marvedge/worker.env && set +a

# 3. Live Upstash Redis TCP/TLS Probe
node -e '
const Redis = require("/opt/marvedge/node_modules/ioredis");
const r = new Redis(process.env.REDIS_URL, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
r.ping().then(res => {
  console.log("✅ Upstash Redis TCP/TLS Connected (PING -> " + res + ")");
  r.disconnect();
  process.exit(0);
}).catch(e => {
  console.error("❌ Upstash Redis Probe Failed:", e.message);
  r.disconnect();
  process.exit(1);
});
'

# 4a. Live Neon Outbound TCP Probes (Pooled & Direct Endpoints on TCP 5432 — Credential-Free)
node -e '
const net = require("net");
const hosts = [
  { name: "Neon Pooled", host: "ep-holy-lab-a48mzff9-pooler.us-east-1.aws.neon.tech" },
  { name: "Neon Direct", host: "ep-holy-lab-a48mzff9.us-east-1.aws.neon.tech" }
];
let pending = hosts.length;
hosts.forEach(({ name, host }) => {
  const s = net.createConnection(5432, host, () => {
    console.log("✅ " + name + " TCP 5432 Reachable (" + host + ")");
    s.end();
    if (--pending === 0) process.exit(0);
  });
  s.on("error", (e) => {
    console.error("❌ " + name + " TCP 5432 Unreachable (" + host + "):", e.message);
    process.exit(1);
  });
  s.setTimeout(5000, () => {
    console.error("❌ " + name + " TCP 5432 Connection Timed Out (" + host + ")");
    s.destroy();
    process.exit(1);
  });
});
'

# 4b. Live Neon PostgreSQL Authenticated SSL Probe
node -e '
const { Client } = require("/opt/marvedge/node_modules/pg");
const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
c.connect().then(() => {
  return c.query("SELECT 1 AS connected;");
}).then(res => {
  console.log("✅ Neon PostgreSQL Connected via SSL (Query -> " + res.rows[0].connected + ")");
  return c.end();
}).catch(e => {
  console.error("❌ Neon Database Probe Failed:", e.message);
  return c.end().catch(() => {}).then(() => process.exit(1));
});
'

# 5. Live Vercel Ingress Probe (Expect HTTP 401 confirming route alive)
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BACKEND_URL}/api/jobs/callback")
if [ "$HTTP_STATUS" = "401" ]; then
  echo "✅ Vercel Webhook Ingress Reachable (HTTP 401 Confirmed)"
else
  echo "❌ Vercel Ingress Probe Failed: Received HTTP $HTTP_STATUS"
  exit 1
fi
```
**STOP CONDITION:** If any probe fails, do NOT proceed. Jump immediately to Section 7 (Rollback & Shutdown).

---

### Phase 3: Start Services & Controlled End-to-End Test Execution

#### Step 3.1 — Start Tier 1 Systemd Services in Strict Order
On the EC2 host:
```bash
# Startup sequence: Downstream models -> Gateway -> Worker
sudo systemctl start marvedge-talknet
sudo systemctl start marvedge-autoflip
sudo systemctl start marvedge-ml-gateway
sudo systemctl start marvedge-reframe-worker

# Verify all 4 units report 'active (running)'
sudo systemctl status marvedge-talknet marvedge-autoflip marvedge-ml-gateway marvedge-reframe-worker --no-pager
```

#### Step 3.2 — Attach Live Logging Watchdog
Open a second terminal window or background log stream:
```bash
sudo journalctl -u marvedge-reframe-worker -u marvedge-ml-gateway -f
```

#### Step 3.3 — Dispatch Single Controlled Reframe Job
Using an authenticated browser session at `https://marvedge.com`:
1. Navigate to the video reframe interface.
2. Submit the benchmark video:
   * **Source Video URL:** `https://marvedge-raw-ap2.s3.ap-southeast-2.amazonaws.com/test/1.mp4`
   * **Target Aspect Ratio:** `9:16`
3. Click **Submit Reframe**. Record the returned `jobId`.

#### Step 3.4 — Verify End-to-End Execution Milestones
Confirm the following telemetry sequence in logs:
1. `[reframe-worker]` Job lock acquired from Upstash Redis via `BLMOVE`.
2. `[reframe-worker]` Source video downloaded to scratch space.
3. `[ml-gateway]` Saliency detection executed on Tesla T4 GPU ($<2.5\text{s}$).
4. `[reframe-worker]` Valid `cropTargets` schema validated.
5. `[reframe-render]` FFmpeg crop filter applied and MP4 encoded.
6. `[reframe-render]` Output uploaded to Cloudinary: `reframed_[jobId].mp4`.
7. `[reframe-worker]` Callback delivered to `https://marvedge.com/api/jobs/callback` returning `HTTP 200 { success: true }`.

#### Step 3.5 — Confirm Database Record in Neon
Verify the PostgreSQL record updated to final state:
* `status` = `COMPLETED`
* `progress` = `100`
* `exportedUrl` = `https://res.cloudinary.com/.../reframed_[jobId].mp4`
* `error` = `null`

---

### Phase 4: Mandatory Post-Test Shutdown & Cost Termination

> [!CAUTION]
> Execute this phase immediately post-test to restore zero hourly compute spend.

#### Step 4.1 — Stop Systemd Services (Strict Reverse Order)
```bash
sudo systemctl stop marvedge-reframe-worker
sudo systemctl stop marvedge-ml-gateway
sudo systemctl stop marvedge-autoflip
sudo systemctl stop marvedge-talknet
```

#### Step 4.2 — Stop EC2 Instance
From local operator workstation:
```bash
aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
aws ec2 wait instance-stopped --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2
```
Verify stopped state:
```bash
aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --query "Reservations[].Instances[].State.Name" --output text
```
*(Expected output: `stopped`). Hourly compute spend is now **$0.00**.*

---

## 6. Explicit STOP Conditions

Halt execution and shut down EC2 immediately if any of the following occur:
1. **Network Probe Failure:** Redis PING times out or Neon database query fails.
2. **Watchdog Exceeded:** 30 minutes elapsed since `aws ec2 start-instances`.
3. **Queue Stall:** Reframe worker fails to acquire job from Upstash within 60 seconds of submission.
4. **ML Inference Hang:** `marvedge-ml-gateway` or AutoFlip runs for $>180\text{ seconds}$ without response.
5. **Callback Failure:** POST to `/api/jobs/callback` returns HTTP 400 (validation failure) or HTTP 500.

---

## 7. Deterministic Rollback Procedures

### Rollback Scenario A: Upstash Redis Connectivity or Rate-Limit Anomaly
1. **Vercel Webapp:**
   * In Vercel Project Settings > Environment Variables > Production: **Delete/Unset `REDIS_URL`**.
   * Redeploy `master`.
   * *Effect:* Restores the pre-test baseline where queue producers fail fast with HTTP 500 Internal Server Error instead of hanging on unreachable Redis.
   * *Crucial Rule:* **NEVER** set Vercel's `REDIS_URL` to ElastiCache (`172.31.25.184:6379`) — Vercel cannot reach private VPC IPs.
2. **EC2 Worker Host:**
   * If testing VPC-internal processing without Vercel: Revert `REDIS_URL` in `/etc/marvedge/worker.env` to `redis://marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379`.
   * ElastiCache has remained untouched and operational throughout.

### Rollback Scenario B: Neon Database Connection Failure
1. **Vercel Webapp:**
   * In Vercel Project Settings > Environment Variables: Revert `DATABASE_URL` and `DIRECT_URL` to the pre-test values identified in Step 0.
   * Redeploy `master`.
   * AWS RDS `marvedge-db` has remained 100% untouched and preserved.

### Rollback Scenario C: Worker Service Fault
1. Stop systemd units:
   ```bash
   sudo systemctl stop marvedge-reframe-worker marvedge-ml-gateway marvedge-autoflip marvedge-talknet
   ```
2. Stop EC2 instance immediately (`aws ec2 stop-instances`).
3. Inspect persistent journal logs:
   ```bash
   journalctl -u marvedge-reframe-worker -n 100 --no-pager
   ```

---

## 8. Remaining Infrastructure Dependencies & Next Actions

All repository Prisma schemas, application runtime data layers, and worker connection patterns are 100% complete. Prior to executing the live dry run, four external operational dependencies remain:

1. **Shared Redis Provisioning:**
   * Provision Upstash Redis (or Redis Cloud) in AWS Sydney (`ap-southeast-2`) to keep worker network latency $<2\text{ms}$.
   * Obtain the native Redis TCP/TLS URL (`rediss://default:[token]@[host]:6379`).
2. **`CALLBACK_SECRET` Generation & Synchronization:**
   * Generate a 64-character high-entropy hex string:
     ```bash
     openssl rand -hex 32
     ```
   * Populate identically in Vercel Production environment and on EC2 host in `/etc/marvedge/worker.env`.
3. **Vercel Production Environment Synchronization:**
   * Update Vercel Project Settings with `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `REDIS_URL`, and `CALLBACK_SECRET`.
   * Deploy `master` to Vercel production.
4. **Maintenance Window & Deployment Authorization:**
   * Operator schedules the 30-minute EC2 execution window.
   * Authorized operator executes `prisma migrate status` via the direct connection before triggering any migration deploy.

