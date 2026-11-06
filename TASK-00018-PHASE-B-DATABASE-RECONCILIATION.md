# TASK-00018 — Phase B: Production Database Identity & Reconciliation Audit Report

**Audit Date:** 2026-11-04  
**Branch:** `task/task-00018-neon-prisma-config`  
**Base Commit:** `9d1ba0a944785f396bc7776f7d4b42e8f3374ca3`  
**Execution Context:** Dedicated worktree `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge-task-00103` (Protected root workspace `marvedge` untouched)  
**Audit Scope:** Strictly Read-Only Investigation across Vercel, AWS RDS, EC2 Worker, and Prisma Configuration  

---

## 1. Executive Summary

This Phase B audit investigated the production database identity, data preservation status, and connection readiness across the Marvedge platform following the Phase A Prisma configuration implementation.

### Key Audit Findings:
1. **AWS RDS (`marvedge-db`):** The instance is running in `ap-southeast-2` with active 7-day automated backups. CloudWatch metrics confirm that client database connections have been `0.0` for 24 consecutive days (since Oct 11, 2026), and network ingress strictly blocks all traffic except developer IP `182.72.39.9/32`. However, per data preservation guidelines, zero active connections do not prove that the database is empty; the instance must be preserved as-is.
2. **Vercel Production (`marvedge.com`):** Serves active traffic from region `iad1` (US East). Local Vercel CLI is unauthenticated, so the exact `DATABASE_URL` hostname could not be inspected directly via API. However, AWS CloudWatch metrics conclusively prove Vercel is **not** connecting to AWS RDS `marvedge-db`.
3. **Existing Neon Projects:** No active Neon CLI sessions, tokens, or explicit project identifiers exist in the repository or local environment. Neon usage in the repository remains documented as a development/staging pattern.
4. **EC2 Video Worker:** The instance (`i-02aa4578f3790bae1`) is stopped. Its runtime environment currently lacks `/etc/marvedge/worker.env`. The worker code expects `DATABASE_URL` (pooled connection) and does not require `DIRECT_URL`.
5. **Phase A Prisma Compatibility:** Both schemas (`prisma/schema.prisma` and `video-worker/prisma/schema.prisma`) successfully support dual-URL configuration (`directUrl = env("DIRECT_URL")`), runtime queries target `DATABASE_URL`, and all 27 migrations remain pristine.

---

## 2. Actual Vercel Production Database Provider

| Parameter | Observed Status | Evidence / Verification Method |
|---|---|---|
| **Vercel Production Domain** | `https://marvedge.com` | Live HTTP probe (Status: 200 OK, `Server: Vercel`) |
| **Compute Execution Region** | `iad1` (Washington D.C. / US East) | Response Header: `X-Vercel-Id: bom1::iad1::...` |
| **Vercel CLI Authentication** | **Unavailable** | `%APPDATA%\com.vercel.cli\Data\auth.json` is empty `{}`; `vercel whoami` prompts for interactive browser login |
| **`DATABASE_URL` Hostname** | **UNVERIFIED** | Direct Vercel API inspection blocked due to missing CLI token |
| **`DIRECT_URL` Presence** | **UNVERIFIED** | Direct Vercel API inspection blocked due to missing CLI token |
| **AWS RDS Connection Target** | **Conclusively Ruled Out** | AWS CloudWatch metric `DatabaseConnections` for `marvedge-db` has been `0.0` continuously for 24 days |

### Conclusion on Vercel Provider:
The exact provider classification of Vercel Production's `DATABASE_URL` remains **UNVERIFIED** via direct dashboard inspection. However, it is definitively confirmed **not** to be the AWS RDS instance `marvedge-db`.

---

## 3. Existing Neon Project Discovery Results

| Check | Result | Details |
|---|---|---|
| **`neonctl` CLI Installed** | **No** | Not present in system PATH |
| **Environment Credentials** | **None** | No `NEON_API_KEY` or `NEON_PROJECT_ID` in local environment |
| **Local Config Directory** | **None** | No `.neon` directory in User Profile or AppData |
| **Codebase Project References** | **None** | Code references generic Neon documentation and cold-start retry wrappers; no specific project ID or URL string exists in code |
| **Project Status** | **UNKNOWN** | Cannot determine if a Neon project is already provisioned under an operator's personal/team account without credentials |

---

## 4. EC2 Worker Database Configuration

| Attribute | Observed Setting | Source |
|---|---|---|
| **Instance ID & Power State** | `i-02aa4578f3790bae1` (`stopped`) | AWS EC2 DescribeInstances |
| **Attached Security Group** | `sg-068dd4bcb4807e34a` (`marvedge-worker-sg`) | AWS EC2 DescribeInstances |
| **Host Environment File** | `/etc/marvedge/worker.env` (Unprovisioned on host) | UserData launch script audit |
| **Template Target** | Neon pooled endpoint (`worker.env.template`) | Updated in Phase A commit `9d1ba0a` |
| **Runtime Client Target** | Reads `process.env.DATABASE_URL` | [`video-worker/index.ts#L71-L76`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge-task-00103/video-worker/index.ts#L71-L76) |
| **URL Parameter Preservation** | Preserves `pgbouncer=true`, injects `connect_timeout=30` | Verified via Node.js URL string test |
| **`DIRECT_URL` Runtime Requirement** | **NOT REQUIRED** | Worker runtime only executes queries; it never runs migrations |
| **Vercel Database Alignment** | **Currently Disaligned** | Worker is stopped and unconfigured; Vercel points to an active external database |

---

## 5. AWS RDS Data Preservation Assessment

| Attribute | Inspected Value | Source |
|---|---|---|
| **DB Instance Identifier** | `marvedge-db` | AWS RDS DescribeDBInstances |
| **Instance Status** | `available` | AWS RDS DescribeDBInstances |
| **Engine & Version** | PostgreSQL `16.15` | AWS RDS DescribeDBInstances |
| **Instance Class** | `db.t3.micro` (1 GB RAM, max connections $\approx 112$) | AWS RDS DescribeDBInstances |
| **Allocated Storage** | `20 GB (gp3)` | AWS RDS DescribeDBInstances |
| **Instance Creation Time** | `2026-10-10T08:17:30.391Z` | AWS RDS DescribeDBInstances |
| **Backup Configuration** | `BackupRetentionPeriod: 7` days (Active) | AWS RDS DescribeDBInstances |
| **Continuous Recovery** | `LatestRestorableTime: 2026-11-03T23:08:24Z` | AWS RDS DescribeDBInstances |
| **Snapshot Metadata** | Access Denied on `rds:DescribeDBSnapshots` | IAM policy for user `aaditya` lacks snapshot describe permission |
| **Inbound Security Group** | `sg-05c4436fe3afb09ac` (Port 5432 only from `182.72.39.9/32`) | AWS EC2 DescribeSecurityGroups |
| **Historical Connection Activity** | Exactly 1 connection on Oct 10; 0.0 connections Oct 11 – Nov 3 | AWS CloudWatch `DatabaseConnections` |
| **Write IOPS** | Baseline $\approx 2.3$ IOPS (PostgreSQL background checkpoint/WAL activity) | AWS CloudWatch `WriteIOPS` |

### Data Preservation Directive:
While AWS CloudWatch confirms zero application traffic over the past 24 days, **zero active connections do not prove the database contains no data**. The database may contain initial schema definitions, seed data, or test artifacts from launch day (Oct 10). **The RDS instance must remain intact and must NOT be deleted, stopped, or dropped without explicit operator instruction and a verified snapshot.**

---

## 6. Prisma Configuration Compatibility

| Component | Status | Verification Detail |
|---|---|---|
| **Root Schema** (`prisma/schema.prisma`) | ✅ **Compatible** | Contains `directUrl = env("DIRECT_URL")`; validated via `npx prisma validate` |
| **Worker Schema** (`video-worker/prisma/schema.prisma`) | ✅ **Compatible** | Contains `directUrl = env("DIRECT_URL")`; validated via `npx prisma validate` |
| **Runtime Client Architecture** | ✅ **Compatible** | `app/lib/prisma.ts` and `video-worker/index.ts` read `DATABASE_URL` for pooled queries |
| **Migration Architecture** | ✅ **Compatible** | `npx prisma migrate deploy` uses `DIRECT_URL` for session advisory locks |
| **Transaction Compatibility** | ✅ **Compatible** | Concurrency locks (`SELECT ... FOR UPDATE`) run in short transaction blocks supported by PgBouncer |
| **Prisma Migrations Integrity** | ✅ **Untouched** | All 27 migrations under `prisma/migrations/` remain intact |

---

## 7. Evidence & Verification Methods

1. **AWS RDS Configuration & Metrics:**
   - Queried via `aws rds describe-db-instances --profile marvedge --region ap-southeast-2`.
   - Metrics extracted via `aws cloudwatch get-metric-statistics --metric-name DatabaseConnections` and `WriteIOPS` across the full October 10 – November 4 period.
2. **Network Perimeter:**
   - Queried via `aws ec2 describe-security-groups --group-ids sg-05c4436fe3afb09ac,sg-068dd4bcb4807e34a`.
   - Verified TCP port 5432 is blocked for external IPs.
3. **Vercel Production Probing:**
   - Probed via `curl.exe -I -s https://marvedge.com` (analyzed `X-Vercel-Id` and `Server` headers).
   - Probed NextAuth endpoint `https://marvedge.com/api/auth/csrf` (confirmed working CSRF response).
4. **Prisma & Worker Codebase Validation:**
   - Verified schema syntax via `npx prisma validate` (both schemas output `The schema is valid 🚀`).
   - Verified TypeScript compilation via `npx tsc --noEmit` (0 errors).
   - Verified test suites via `npx vitest run` (57 tests passed across root and worker).

---

## 8. Unresolved Questions & Access Limitations

1. **Vercel Dashboard Access Limitation:**
   - Local CLI has no stored session token (`auth.json` is `{}`).
   - Exact value, provider hostname, and `DIRECT_URL` status in Vercel Production could not be verified directly.
2. **Neon Infrastructure Discovery Limitation:**
   - No Neon API token is available locally to query existing organization projects via API.
3. **RDS Internal Table Row Counts:**
   - Direct SQL inspection of `marvedge-db` was not performed because port 5432 is restricted to developer IP `182.72.39.9/32`.

---

## 9. Recommended Next Steps

1. **Obtain Operator Input on Vercel Production Database:**
   - Request the operator to inspect the Vercel Dashboard (*Settings → Environment Variables*) and identify the hostname of `DATABASE_URL`.
2. **Confirm Neon Provisioning:**
   - If a Neon project already exists: retrieve its pooled connection string (`DATABASE_URL`) and direct connection string (`DIRECT_URL`).
   - If no Neon project exists: provision a new project in `ap-southeast-2` (Sydney) with automated connection pooling enabled.
3. **Deploy Schema Migrations to Neon:**
   - Execute `npx prisma migrate deploy` using `DIRECT_URL`.
4. **Align Environments:**
   - Set `DATABASE_URL` (with `&pgbouncer=true`) and `DIRECT_URL` on Vercel.
   - Set `DATABASE_URL` (with `&pgbouncer=true`) in `/etc/marvedge/worker.env` on EC2.
5. **Keep AWS RDS Preserved:**
   - Retain `marvedge-db` until the new Neon configuration is verified end-to-end under live traffic.

---

## 10. Audit Conclusion

### **VERDICT: CONDITIONAL GO**

**Justification:**
- **The code and schema configuration are 100% ready (GO).** The Phase A implementation cleanly supports Neon pooled runtime connections and direct migration execution without any regressions.
- **Next-phase execution is CONDITIONAL** upon:
  1. The operator providing the actual Neon connection endpoints (`DATABASE_URL` pooled and `DIRECT_URL` direct) from their Neon console.
  2. Confirming whether Vercel production already points to an existing Neon database or needs to be re-pointed to a newly provisioned one.
  3. Preserving the existing AWS RDS instance without making destructive changes.

