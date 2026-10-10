# Marvedge AWS Infrastructure Reference

> **Primary cloud provider: Amazon Web Services**
> Account: Marvedge Central · ID `753369745408` · Region `ap-southeast-2` (Sydney)
> Last updated: 2026-10-10

---

## Provisioned Resources

| Service | Resource | Endpoint / ARN | Status |
|---------|----------|----------------|--------|
| **S3** | `marvedge-raw-ap2` | `arn:aws:s3:::marvedge-raw-ap2` | ✅ Active |
| **S3** | `marvedge-processed-ap2` | `arn:aws:s3:::marvedge-processed-ap2` | ✅ Active |
| **DynamoDB** | `marvedge-recipes` | `ap-southeast-2` · PAY_PER_REQUEST | ✅ Active |
| **DynamoDB** | `marvedge-chunks` | `ap-southeast-2` · PAY_PER_REQUEST | ✅ Active |
| **RDS** | `marvedge-db` | `marvedge-db.cfggeg20sv42.ap-southeast-2.rds.amazonaws.com:5432` | ✅ Active |
| **ElastiCache** | `marvedge-redis` | `marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379` | ✅ Active |
| **EC2 GPU** | `marvedge-gpu-worker` | `g4dn.xlarge` · T4 GPU · Pending quota | ⏳ Quota pending |

---

## Security Configuration

| Resource | Security Group | Inbound Rules |
|----------|---------------|---------------|
| RDS PostgreSQL | `sg-05c4436fe3afb09ac` | `:5432` from dev IP only (no public access) |
| ElastiCache Redis | `sg-07d2f395268e1cefa` | `:6379` from VPC CIDR `172.31.0.0/16` only |
| EC2 GPU Worker | `sg-068dd4bcb4807e34a` | `:8080` from VPC · `:22` from dev IP only |

> All S3 buckets have **Block All Public Access** enabled + **AES-256 encryption** at rest.
> RDS is **non-publicly-accessible** — connect via EC2 bastion or VPN only.

---

## IAM

| Principal | Role / Policy | Grants |
|-----------|--------------|--------|
| EC2 Worker | `marvedge-worker-role` | `AmazonS3FullAccess` · `AmazonDynamoDBFullAccess` · `CloudWatchLogsFullAccess` |
| Local Dev | `marvedge` CLI profile | `aws login --profile marvedge` (12-hour session tokens) |

> For CI/CD and containers: inject `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_SESSION_TOKEN`
> from your secrets manager. **Never hardcode credentials in source code or Docker images.**

---

## Code Architecture

```
STORAGE_PROVIDER=aws  (default — production)
       │
       ▼
app/lib/storage/index.ts          ← Next.js API routes
cloudrun-worker/storage.cjs       ← Video processing worker
       │
       ▼
   AWS S3 (ap-southeast-2)
   marvedge-raw-ap2      ← raw video uploads from browser
   marvedge-processed-ap2 ← worker output (MP4, MP3, composites)

STORAGE_PROVIDER=gcs  (cold-standby — activate ONLY on AWS outage)
       │
       ▼
   Google Cloud Storage (marvedge-1)
   marvedge-raw-us-fast
   marvedge-processed-us-fast
```

```
DATABASE_URL = AWS RDS PostgreSQL 16.15  ← Prisma ORM (app layer)
RECIPES / CHUNKS = AWS DynamoDB          ← cloudrun-worker job state
REDIS_URL = AWS ElastiCache Redis 7.1    ← BullMQ job queue
```

---

## EC2 GPU Worker — Launch Checklist

The `g4dn.xlarge` vCPU quota increase is pending (Request ID: `771b95a2e462450c92f75603a5980d21OsbVojO7`).

Once approved, launch with:

```bash
aws ec2 run-instances \
  --image-id ami-02ca582744f542171 \
  --instance-type g4dn.xlarge \
  --key-name marvedge-worker \
  --security-group-ids sg-068dd4bcb4807e34a \
  --subnet-id subnet-03547601323aa5e5e \
  --iam-instance-profile Name=marvedge-worker-role \
  --user-data file://infra/ec2-worker-userdata.sh \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":100,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=marvedge-gpu-worker}]' \
  --region ap-southeast-2 \
  --profile marvedge
```

After launch, get the private IP:
```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=marvedge-gpu-worker" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --region ap-southeast-2 --profile marvedge --output text
```

Then update `.env`:
```bash
GCP_VIDEO_WORKER_URL=http://<private-ip>:8080
USE_GCP_WORKER=true
```

---

## Quota Status

| Quota | Code | Current | Requested | Status |
|-------|------|---------|-----------|--------|
| Running On-Demand G and VT instances | `L-DB2E81BA` | 0 vCPU | 4 vCPU | ⏳ PENDING |

Check status:
```bash
aws service-quotas get-requested-service-quota-change \
  --request-id 771b95a2e462450c92f75603a5980d21OsbVojO7 \
  --region ap-southeast-2 --profile marvedge
```

---

## GCS Fallback Activation (emergency only)

In the event of a critical AWS outage:

1. Set `STORAGE_PROVIDER=gcs` in your deployment environment
2. Ensure `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_CLIENT_EMAIL`, `GOOGLE_CLOUD_PRIVATE_KEY` are set
3. Redeploy Next.js app and restart the worker
4. When AWS is restored: revert to `STORAGE_PROVIDER=aws` and redeploy

> Both `s3://` and `gs://` URIs are handled by the resolve endpoint — no database migration needed.
