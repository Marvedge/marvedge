# Task-00128 — Live AWS GPU Benchmark Execution & Hardware Verification Report

**Document Version:** 1.1.0
**Execution Date:** 2026-11-11T18:15:00+05:30 (12:45:00 UTC)
**Reconciliation Date:** 2026-11-11T18:30:00+05:30
**Repository Working Directory:** `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge`
**Active Branch:** `task/task-00127-portable-cloud-benchmark`
**Task ID:** Task-00128
**Target Hardware:** AWS EC2 `g4dn.xlarge` (`i-02aa4578f3790bae1`) with NVIDIA Tesla T4 16 GB
**Region:** `ap-southeast-2` (Sydney)
**Execution Profile:** AWS CLI profile `marvedge` via AWS Systems Manager Session Manager (SSM)
**Engineer:** Antigravity System Agent

---

## 1. Executive Summary

Under explicit user authorization, AWS EC2 GPU instance `i-02aa4578f3790bae1` was started for a controlled live benchmark session. Physical hardware telemetry was captured, distinguishing verified GPU tensor inference from CPU native execution, container health checks, and unexecuted stages.

### Key Outcomes:

1. **Hardware Verification & Execution Provenance:**
   - **NVIDIA Tesla T4 GPU (16 GB GDDR6)** was verified active with NVIDIA Driver `595.91.07` and CUDA `13.2`.
   - **TalkNet Active Speaker Detection (AVS) — Physical CUDA Execution Confirmed:** Executed real PyTorch CUDA inference on the Tesla T4. Across **77 physical polling samples**, telemetry recorded **54% peak GPU compute utilization**, **19.2% average GPU compute utilization**, **435 MiB peak VRAM** (a 330 MiB increase above baseline), and a peak temperature of **38°C** over **9.778 seconds** of wall-clock time on 8.04s media.
   - **AutoFlip Video Reframing — Native MediaPipe (GPU Acceleration Unverified):** Processed 192 frames (8.0s) in **0.052 seconds** (153.8x real-time) using native C++ MediaPipe binaries. Telemetry showed 0% GPU compute utilization and baseline VRAM (105 MiB). CUDA usage was not demonstrated; this stage is classified as **native CPU-bound MediaPipe execution**.
   - **VoiceStudio — Container Health & CUDA Device Visibility Only (Inference Unexecuted):** Container `ghcr.io/debpalash/voicestudio:0.5.6` ran under NVIDIA container runtime and verified operational via `GET /health` (`status: ok, device: cuda (Tesla T4)`). No actual speech generation or dubbing inference benchmark was executed, so no dubbing inference telemetry or audio outputs are claimed.
   - **ML Gateway — Service Health Verified:** Health check confirmed both AutoFlip (`:8002`) and TalkNet (`:8001`) services ready (`:8000/health`).
2. **Zero External Model Weight Downloads:**
   - Pre-flight checks confirmed all required model weights were already present on the instance EBS disk (`/opt/marvedge/talknet/weights/sfd_face.pth` 89.8 MB; `pretrain_TalkSet.model` 63.2 MB). Zero external network weight downloads occurred.
3. **Session Budget & Financial Accounting:**
   - **Incremental EC2 Compute Spend:** Running duration was **22.35 minutes** (1,341 seconds: 12:22:10 UTC to 12:44:31 UTC). At the On-Demand rate of $0.7104/hour, incremental compute spend was **$0.2646 USD** (~$0.26 USD), well below the approved ~$0.40 budget and $10.00 hard guardrail.
   - **EBS Storage Accounting (Ongoing vs Incremental):** The 100 GB `gp3` root volume costs $0.096/GB-month ($9.60/month, ~$0.315/day). This storage cost is an ongoing fixed monthly infrastructure charge that continues to accrue 24x7 regardless of whether EC2 is running or stopped. It is separated from incremental session compute and not double-counted.
   - **Per-Stage Compute Allocations:** AutoFlip ($0.00001) and TalkNet ($0.00193) compute values are derived informational allocations representing fractions of the EC2 runtime; they are subsumed within the $0.2646 EC2 compute cost and are not additive.
4. **Clean Teardown & Verified Stopped State:**
   - Containers and background services were cleanly stopped and removed.
   - Host watchdog was canceled.
   - Instance `i-02aa4578f3790bae1` was stopped via AWS CLI and verified in the **`stopped`** state (`Code 80`, User initiated).

---

## 2. Hardware and Environment Verification

### 2.1 Host Infrastructure (AWS EC2 `g4dn.xlarge`)

- **Instance ID:** `i-02aa4578f3790bae1`
- **Instance Type:** `g4dn.xlarge`
- **Region / Availability Zone:** `ap-southeast-2` / `ap-southeast-2a`
- **Virtual CPU:** 4 vCPUs (Intel Xeon Platinum 8259CL @ 2.50 GHz)
- **Host Memory:** 15.3 GiB Total (14.2 GiB Free at idle)
- **Operating System:** Amazon Linux 2023 (`kernel 6.1.134-149.204.amzn2023.x86_64`)
- **Storage Volume:** 100 GB `gp3` root EBS NVMe (`/dev/nvme1n1p1`), 38 GB used, **63 GB available (63% free)**
- **IAM / Access:** Managed via AWS Systems Manager (`PingStatus: Online`). Zero SSH ports exposed (`0.0.0.0/0:22` closed). Zero credential keys exposed.

### 2.2 Physical GPU Specifications

- **GPU Accelerator:** NVIDIA Tesla T4 (Turing TU104, Device ID: `1EB8`)
- **VRAM Total:** 15,360 MiB (16 GB GDDR6)
- **Driver Version:** `595.91.07`
- **CUDA Runtime / Version:** `13.2`
- **Idle Power / Temperature:** 26W / 35°C
- **Container Runtime:** Docker Engine 25.0.14 with `nvidia` runtime configured (`io.containerd.runc.v2 nvidia runc`)
- **PyTorch Environment:** Python 3.11 with PyTorch `2.5.1+cu121` (`torch.cuda.is_available() == True`, `torch.cuda.get_device_name(0) == "Tesla T4"`)

---

## 3. Benchmark Executions, Hardware Provenance & Telemetry

### 3.1 Stage 1 — AutoFlip Video Reframing (Aspect Ratio Conversion)

- **Media Input:** `/opt/marvedge/public/icons/1.mp4` (Duration: 8.00s, Resolution: 1280x720, Framerate: 24.0 fps, Total Frames: 192)
- **Execution Command:** `/usr/local/bin/run_autoflip_to_json`
- **Execution Output:** `/opt/marvedge/benchmark_results/autoflip_1_crop.json`
- **Target Aspect Ratio:** 9:16 Portrait
- **Measured Duration:** **0.052 seconds** (effective throughput: **153.8x real-time**)
- **Crop Target Verification:** Generated 8 interpolated keyframe bounding boxes matching schema version 1.
- **Hardware Execution Provenance & Classification:**
  - VRAM Utilization: 105 MiB (static idle driver footprint; zero VRAM delta).
  - GPU Compute Utilization: 0% peak, 0.0% average (1 polling sample).
  - **Classification:** **Native MediaPipe execution with GPU acceleration unverified.** Because telemetry did not demonstrate active CUDA kernel execution or GPU load, GPU acceleration cannot be claimed merely from the presence of the NVIDIA driver. The binary executed natively on the host vCPUs.
- **Status:** **PASS (Functional reframing output verified; CPU-bound native execution)**

### 3.2 Stage 2 — TalkNet Active Speaker Detection (AVS)

- **Media Input:** `/opt/marvedge/public/icons/1.mp4` (8.04s audio/video sync)
- **Model Architecture:** S3FD Face Detection (CNN) + TalkNet Audio-Visual Cross-Attention & Bi-directional LSTM
- **Execution Method:** Direct Python PyTorch CUDA inference on GPU 0 (`cuda:0`)
- **Measured Duration:** **9.778 seconds**
- **Real-Time Factor:** **1.216x media duration** (0.82x processing rate)
- **Hardware Execution Provenance & Telemetry:**
  - **Polling Samples:** **77 discrete physical samples** captured via `nvidia-smi` background loop during inference.
  - **Peak GPU Compute Load:** **54%**
  - **Average GPU Compute Load:** **19.2%**
  - **Peak VRAM Consumed:** **435 MiB** (a verified delta of +330 MiB above 105 MiB idle context).
  - **Peak GPU Temperature:** **38°C** (up from 35°C idle).
  - **Classification:** **Verified Physical CUDA Tensor Inference on Tesla T4.**
- **Output Artifact:** `/opt/marvedge/benchmark_results/talknet_1_result.json` (`ok: true, fps: 25.0, duration_sec: 8.04`)
- **Status:** **PASS (Fully verified physical GPU execution)**

### 3.3 Stage 3 — ML Gateway Service Health

- **Endpoint:** `http://127.0.0.1:8000/health`
- **Reported Status:** `{"status":"ok","services":{"autoflip":"healthy","talknet":"healthy"},"ready":{"reframe":true,"talknet":true}}`
- **Classification:** **Service Health Check Only.** Gateway correctly detected healthy background endpoints for AutoFlip (port 8002) and TalkNet (port 8001).
- **Status:** **PASS (Health check)**

### 3.4 Stage 4 — VoiceStudio Container Runtime

- **Container Image:** `ghcr.io/debpalash/voicestudio:0.5.6`
- **Endpoint:** `http://127.0.0.1:3900/health`
- **Reported Status:** `{"status":"ok","device":"cuda (Tesla T4)","version":"0.5.6"}`
- **Hardware Execution Provenance & Classification:**
  - Container initialized with Docker `--runtime=nvidia` and successfully detected the Tesla T4 CUDA device in its `/health` probe.
  - **Dubbing Inference Execution Status:** **Unexecuted.** No actual speech synthesis or dubbing inference pipeline was executed during this live session, and no output audio or dubbing GPU telemetry was recorded.
  - **Classification:** **Container Health & CUDA Device Visibility Verified Only.** Actual GPU dubbing benchmark remains unexecuted.
- **Status:** **PASS (Container readiness verified; dubbing inference unexecuted)**

---

## 4. Financial Audit & Session Cost Reconciliation

### 4.1 Incremental Session Compute vs. Ongoing Storage Accounting

| Cost Category                       | Billing Rate / Formula                      | Usage / Duration      | Incurred Cost (USD) | Accounting Classification                                     |
| ----------------------------------- | ------------------------------------------- | --------------------- | ------------------- | ------------------------------------------------------------- |
| **EC2 `g4dn.xlarge` Compute**       | $0.7104 / hour ($0.01184 / min)             | 22.35 min (1,341 sec) | **$0.2646**         | **Incremental Session Spend**                                 |
| **AWS Public IPv4 Address**         | $0.0050 / hour                              | 22.35 min (0.3725 hr) | $0.0019             | Incremental Session Spend                                     |
| **External Paid APIs**              | Per API invocation                          | 0 calls               | $0.0000             | Incremental Session Spend                                     |
| **Total Incremental Session Spend** | **Sum of incremental compute & IP**         | **22.35 minutes**     | **~$0.27 USD**      | **Actual Spend Incurred**                                     |
| _EBS 100 GB gp3 Root Volume_        | _$0.096 / GB-month ($9.60/mo, ~$0.315/day)_ | _Ongoing (24x7)_      | _$9.60 / month_     | _Ongoing Infrastructure Commitment (Not Session Incremental)_ |

> [!IMPORTANT]
> **EBS Volume Accounting Clarification:**
> The 100 GB `gp3` root volume continues to accrue charges at **$9.60 USD / month** (~$0.315 USD / day) indefinitely while the EC2 instance is in `stopped` state. EBS storage is an ongoing persistent infrastructure commitment that does **not** stop when the instance stops. It is therefore strictly separated from the **$0.2646 USD incremental compute charge** incurred during this 22.35-minute benchmarking window.

### 4.2 Per-Stage Informational Compute Allocations

The compute values below represent derived fractional allocations of the active EC2 runtime ($0.7104/hr). They are **informational allocations already included within the $0.2646 EC2 compute cost** and are **not** additive:

| Pipeline Stage                    | Measured Wall-Clock       | Fractional Allocation Formula | Informational Cost (USD) | Included in Session Spend?      |
| --------------------------------- | ------------------------- | ----------------------------- | ------------------------ | ------------------------------- |
| AutoFlip Reframing                | 0.052 sec                 | $0.7104 / 3600 × 0.052 s      | $0.000010                | Yes (subsumed in EC2 compute)   |
| TalkNet AVS Inference             | 9.778 sec                 | $0.7104 / 3600 × 9.778 s      | $0.001930                | Yes (subsumed in EC2 compute)   |
| System Setup & Telemetry Polling  | ~1,331 sec                | $0.7104 / 3600 × 1331 s       | $0.262660                | Yes (subsumed in EC2 compute)   |
| **Total Active Instance Compute** | **1,341 sec (22.35 min)** | **$0.7104 × 0.3725 hr**       | **$0.2646**              | **Authoritative Total Compute** |

- **Approved Target Budget:** ~$0.40 USD
- **Hard Guardrail Ceilings:** $10.00 USD / 30 minutes
- **Budget Variance:** -$0.13 USD (under budget)
- **Double-Counting Avoidance:** Stage allocations are strictly marked as sub-components; total incremental session cost is exactly **$0.2646 USD** (~$0.27 USD with public IP).

---

## 5. Teardown and Final Security Verification

1. **Watchdog Cancellation:** Host-side watchdog (`shutdown -h +30`) was explicitly canceled via `shutdown -c`.
2. **Container Cleanup:** VoiceStudio container `marvedge-voicestudio` was cleanly stopped and removed.
3. **Process Termination:** Background `uvicorn` and MediaPipe processes were terminated.
4. **EC2 Stop Command:** Instance `i-02aa4578f3790bae1` was stopped via `aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge`.
5. **Final Instance State:** Confirmed in **`stopped`** state (`Code 80`, reason: `User initiated (2026-11-11 12:44:32 GMT)`).

---

## 6. Stage Completion and Provenance Summary

| Pipeline Stage            | Execution Status                 | Provenance & Hardware Classification                                 | Measured Duration     | Key Telemetry / Artifact                                                              |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| **Reframe (AutoFlip)**    | **Completed**                    | **Native MediaPipe (GPU acceleration unverified / CPU-bound)**       | 0.052 s               | 192 frames, 153.8x RT, 0% GPU load (`autoflip_1_crop.json`)                           |
| **AVS (TalkNet)**         | **Completed**                    | **Physical CUDA Tensor Inference on Tesla T4**                       | 9.778 s               | 77 samples, 54% peak GPU load, 19.2% avg load, 435 MiB VRAM (`talknet_1_result.json`) |
| **ML Gateway**            | **Completed**                    | **Gateway Route & Service Health Only**                              | Instantaneous         | AutoFlip & TalkNet routes verified ready on port 8000                                 |
| **Dubbing (VoiceStudio)** | **Partially Completed**          | **Container Health & CUDA Visibility Verified (Dubbing Unexecuted)** | Instantaneous         | Health probe returned `device: cuda (Tesla T4)`; 0 inference runs                     |
| **Captions (Whisper)**    | **Unexecuted (in this session)** | **External API (Groq Whisper Large V3 verified in Phase 1)**         | N/A (Phase 2 session) | Preserved historical Phase 1 result: 1.29s, $0.003038                                 |
