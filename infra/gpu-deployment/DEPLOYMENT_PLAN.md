# Marvedge GPU Worker Deployment Plan & Checklist (Task-00094)

## Overview
This directory contains production-ready configuration drafts, systemd unit specifications, an AutoFlip headless CLI runner, and operational checklists for deploying the decoupled Marvedge Video & ML Inference Pipeline on an AWS EC2 GPU instance (`g4dn.xlarge`).

---

## 1. Real Repository Topology & Entry Points

| Service | Working Directory | Runtime | Command | Health Endpoint |
|---|---|---|---|---|
| **ML API Gateway** | `/opt/marvedge/ml-gateway` | Python 3.10+ | `uvicorn server:app --host 127.0.0.1 --port 8000 --workers 1` | `GET http://127.0.0.1:8000/health` |
| **TalkNet Service** | `/opt/marvedge/talknet` | Python 3.10+ (PyTorch CUDA) | `uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1` | `GET http://127.0.0.1:8001/health` |
| **AutoFlip Service** | `/opt/marvedge/autoflip` | Python 3.10+ + CLI runner | `uvicorn server:app --host 127.0.0.1 --port 8002 --workers 1` | `GET http://127.0.0.1:8002/health` |
| **Reframe Worker** | `/opt/marvedge` | Node.js 20 LTS | `node node_modules/tsx/dist/cli.mjs reframe-worker/index.ts` | BullMQ worker ping via Redis |
| **Video Worker** | `/opt/marvedge` | Node.js 20 LTS | `node node_modules/tsx/dist/cli.mjs video-worker/index.ts` | BullMQ worker ping via Redis |

---

## 2. Real Dependencies & Prerequisites

### A. Python & System Libraries
- Python 3.10+ with `fastapi`, `uvicorn`, `httpx`, `torch`, `torchvision`, `torchaudio`, `opencv-python-headless`, `scipy`.
- System packages: `ffmpeg` (with `libass` support), `libgl1`, `libglib2.0-0`.
- Deep Learning AMI Note: PyTorch pre-installed on AWS AL2023 Deep Learning AMI includes CUDA runtime. Verified via `python3 -c "import torch; print('CUDA:', torch.cuda.is_available())"`.

### B. TalkNet Model Weights
Checkpoints must exist at:
1. `TALKNET_S3FD_WEIGHTS`: `/opt/marvedge/talknet/weights/sfd_face.pth` (~85 MB)
2. `TALKNET_MODEL_WEIGHTS`: `/opt/marvedge/talknet/weights/pretrain_TalkSet.model` (~65 MB)
*Preflight gate blocks execution if either file is missing or 0 bytes.*

### C. AutoFlip Headless Runner
The repository provides `run_autoflip_to_json.py` (`infra/gpu-deployment/run_autoflip_to_json.py`) as the standalone crop coordinate generator conforming to the Task-00016 schema. It is installed to `/usr/local/bin/run_autoflip_to_json` with execution permissions (`chmod +x`).

### D. Node.js & TypeScript Runtime
- Repository relies on `tsx` (installed in root `devDependencies` as `^4.23.13`).
- In headless production environments where `npm ci --omit=dev` might be used, either run with `node node_modules/tsx/dist/cli.mjs` (retaining `tsx`), or build the workers into pure CommonJS/ESM via `npm run build` beforehand.

### E. Redis Wire Protocol
- BullMQ strictly requires **standard Redis wire protocol over TCP with blocking command support** (`maxRetriesPerRequest: null`, `BRPOPLPUSH`).
- REST-only APIs will fail.
- Compatible solutions: AWS ElastiCache Redis (VPC internal TCP) or Upstash Redis with TLS over port 6379 (`rediss://...`).

---

## 3. Strict Pre-Flight Blocking Checklist

Before starting any worker service or starting EC2 compute:
- [ ] **Model Weights Present:** Both `sfd_face.pth` and `pretrain_TalkSet.model` verified in `/opt/marvedge/talknet/weights/`.
- [ ] **Redis Connection Verified:** `REDIS_URL` connects successfully via `ioredis` / BullMQ. Loopback in production is blocked.
- [ ] **Callback Auth Configured:** `CALLBACK_SECRET` and `BACKEND_URL` set. Outbound POST to `${BACKEND_URL}/api/jobs/callback` returns 401 on bad secret (endpoint reachable).
- [ ] **Gateway Token Configured:** `ML_GATEWAY_TOKEN` shared between `reframe-worker` and `ml-gateway`.
- [ ] **Concurrency Fixed to 1:** `REFRAME_WORKER_CONCURRENCY=1` and `WORKER_CONCURRENCY=1`.
- [ ] **AutoFlip CLI Runner Installed:** `/usr/local/bin/run_autoflip_to_json` installed and executable.
- [ ] **Preflight Gate Script Exits 0:** `./infra/gpu-deployment/preflight-gate.sh` succeeds with zero failures.

---

## 4. Confirmed End-to-End Verification Results (Task-00094)

The deployment pipeline was validated end-to-end against the target AWS EC2 host with real ML inference, worker job consumption, rendering, Cloudinary export, and callback delivery:

- **Host & Environment:**
  - Instance ID: `i-02aa4578f3790bae1` (`g4dn.xlarge`, subnet `subnet-09f1b9542a2e46ca7`, `ap-southeast-2`)
  - Accelerator: NVIDIA Tesla T4 GPU (Driver 535.183.06, CUDA 12.2, PyTorch 2.5.1+cu121)
- **TalkNet Service:**
  - Started on port 8001 with active speaker detection model checkpoints (`sfd_face.pth` and `pretrain_TalkSet.model`).
  - Real inference test succeeded in 7.9s on benchmark video segment (`{"ok":true,"video_info":{"fps":25.0,"duration_sec":8.04},"speakers":[]}`).
- **AutoFlip Service:**
  - Deployed `run_autoflip_to_json.py` to `/usr/local/bin/run_autoflip_to_json`.
  - Service on port 8002 returned 8 keyframe 9:16 crop targets across video timeline matching Task-00016 schema.
- **ML API Gateway:**
  - Listened on loopback port 8000, proxied `/reframe` and `/talknet` with 100% success rate.
- **BullMQ Reframe Worker Execution:**
  - Connected to Redis queue `reframe-processing`.
  - Consumed Job ID: `task94-e2e-1792578356680`.
  - Queried ML Gateway for crop calculations, rendered 9:16 MP4 using FFmpeg (`crop=607:1080:656:0`).
  - Uploaded reframed video to Cloudinary:
    `https://res.cloudinary.com/dh2skqoub/video/upload/v1792578360/reframed_exports/reframed_task94-e2e-1792578356680.mp4`
- **Authenticated Callback:**
  - Dispatched HMAC-signed callback to `/api/jobs/callback`.
  - Received HTTP 200 OK with `status: "COMPLETED"`.
- **Instance Power State:**
  - Instance `i-02aa4578f3790bae1` was stopped immediately following verification to prevent unnecessary compute charges. Confirmed state: `stopped`.

---

## 5. Architectural Disclosure: Vercel to Private ElastiCache Connectivity

During Task-00094 testing, Redis connectivity for the worker host was established using AWS ElastiCache (`marvedge-redis.bef3ee.0001.apse2.cache.amazonaws.com:6379`) within the private AWS VPC.

**Operational Limitation:**
- Serverless web application functions hosted on Vercel cannot reach AWS private VPC resources (such as private ElastiCache instances) directly over the public internet.
- For full end-to-end production automation where Vercel enqueues jobs to the GPU worker queue, one of the following architectural patterns is required:
  1. **Dual-Accessible Managed Redis:** Use Upstash Redis or another managed Redis service supporting public TLS endpoints (`rediss://...`) accessible by both Vercel edge/serverless and EC2.
  2. **VPC Ingress Proxy:** Deploy an authenticated TCP/TLS proxy or AWS API Gateway HTTP proxy inside the VPC accessible by Vercel.
  3. **Vercel Secure Compute:** Establish direct VPC peering between Vercel Enterprise Secure Compute and the AWS VPC.