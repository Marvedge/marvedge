# VoiceStudio Integration & Bounded GPU Execution Guide (Task-00103)

This document provides the authoritative architecture, API contracts, deployment transport methods, failure handling protocols, and step-by-step GPU benchmark execution instructions for integrating **VoiceStudio** (`ghcr.io/debpalash/voicestudio:0.5.6`) into Marvedge.

---

## 1. Architectural Boundaries & Legal Compliance

### A. Isolated Container Deployment
- VoiceStudio runs as an independent container service via `docker-compose.voicestudio.yml`.
- Container port 3900 is bound strictly to `127.0.0.1:3900` (loopback interface) on the host. It is **never** exposed to `0.0.0.0` or opened in AWS Security Groups.
- Marvedge interacts with VoiceStudio purely as an authenticated HTTP client. No Python runtime libraries, CUDA bindings, or VoiceStudio application code are copied into the Marvedge repository.

### B. Licensing Governance
- **Application License:** VoiceStudio is licensed under **GNU AGPL-3.0**. While network process isolation maintains repository separation, AGPL-3.0 contains network-copyleft provisions. Prior to incorporating this integration into a proprietary commercial production offering, independent legal counsel review is required.
- **Model Weights License:** The default `k2-fsa/OmniVoice` checkpoint is licensed under **CC-BY-NC 4.0 (Non-Commercial)** along with Boson AI Higgs Audio 2 and Meta Llama 3 tokenizer terms. It is strictly authorized for internal evaluation, benchmarking, and architectural testing. It **must not** be used for commercial production dubbing without replacing it with an Apache-2.0 / commercially cleared open-weights model (such as `Kokoro-82M`).

### C. Fail-Safe Defaults
- Production default remains `DUBBING_PROVIDER=elevenlabs`.
- `voicestudio` is only invoked when explicitly configured.
- If VoiceStudio is unavailable, it fails with a clear, typed `VOICESTUDIO_UNAVAILABLE` error.
- Automatic fallback to paid ElevenLabs requests is strictly disabled by default (`VOICESTUDIO_FALLBACK_TO_PAID=false`), preventing unexpected third-party API billing surges.

---

## 2. Verified API Contract (VoiceStudio 0.5.6)

Verified directly against version 0.5.6 source (`backend/main.py`, `backend/api/routers/openai_compat.py`, `backend/api/routers/setup/download.py`):

### A. Health & Liveness Probe (`GET /health`)
- **Wire Endpoint:** `GET /health` (exempt from authentication).
- **HTTP 200 (Ready):**
  ```json
  {
    "status": "ok",
    "device": "cuda (NVIDIA Tesla T4)",
    "version": "0.5.6"
  }
  ```
- **HTTP 503 (Starting / Model Loading):**
  ```json
  {
    "status": "starting",
    "step": "load_weights",
    "label": "Loading OmniVoice...",
    "version": "0.5.6"
  }
  ```
  *Headers:* `Retry-After: 2`
- **Marvedge Client Adapter:** `VoiceStudioClient.checkHealth()` parses the raw wire response and exposes convenience getters:
  - `isReady: boolean` (`status === "ok" && res.status === 200`)
  - `isGpu: boolean` (`device.toLowerCase().includes("cuda")`)
  - `gpuModel: string | null` (e.g., `"NVIDIA Tesla T4"`)

### B. Speech Generation (`POST /v1/audio/speech`)
- **Wire Endpoint:** `POST /v1/audio/speech`
- **Headers:** `Authorization: Bearer <VOICESTUDIO_API_KEY>`, `Content-Type: application/json`
- **Payload (`SpeechRequest`):**
  ```json
  {
    "model": "omnivoice",
    "input": "Narration text prompt...",
    "voice": "alloy",
    "response_format": "wav",
    "speed": 1.0,
    "duration": 5.0,
    "num_step": 16,
    "language": "en"
  }
  ```
- **Output:** Raw binary audio stream (`Content-Type: audio/wav`).

### C. Model Installation (`POST /models/install`)
- **Wire Endpoint:** `POST /models/install`
- **Headers:** `Authorization: Bearer <VOICESTUDIO_API_KEY>`, `Content-Type: application/json`
- **Payload (`InstallModelRequest`):**
  ```json
  {
    "repo_id": "k2-fsa/OmniVoice"
  }
  ```
  *(Important: Sending `{"model": "omnivoice"}` is rejected by Pydantic schema with HTTP 422. The exact field is `"repo_id": "k2-fsa/OmniVoice"`).*

---

## 3. Infrastructure, Rate Reconciliation & Cost Guardrails

### A. Host Profile
- **Instance ID:** `i-02aa4578f3790bae1`
- **Instance Type:** `g4dn.xlarge` (4 vCPUs, 16 GiB RAM, NVIDIA Tesla T4 16 GB VRAM)
- **Region:** `ap-southeast-2` (Sydney, Australia)
- **AMI:** Deep Learning OSS Nvidia AL2023 (`ami-02ca582744f542171`)
- **Storage:** 100 GB `gp3` root EBS volume (~75 GB available disk space)
- **Shutdown Behavior:** `InstanceInitiatedShutdownBehavior` is verified as **`stop`**.

### B. Hourly Rate Reconciliation & Projections
- US East Baseline (`us-east-1`): `$0.526 / hr`
- Sydney Baseline (`ap-southeast-2`): `$0.6840 / hr`
- Conservative Sydney Rate (Ceiling Basis): **`$0.7104 / hr`**

| Duration | Baseline Sydney ($0.6840/hr) | Conservative Ceiling ($0.7104/hr) | Status vs $0.75 Limit |
| :--- | :--- | :--- | :--- |
| **15 minutes** | $0.1710 USD | $0.1776 USD | OK |
| **20 minutes** | $0.2280 USD | $0.2368 USD | OK |
| **35 minutes (Teardown Start)** | $0.3990 USD | $0.4144 USD | OK |
| **45 minutes (Hard Limit)** | **$0.5130 USD** | **$0.5328 USD** | **Safely below $0.75 limit** |

*(The $0.75 limit is an estimated EC2 instance-compute engineering ceiling, not a total AWS invoice guarantee).*
- **EBS Storage:** 100 GB `gp3` root volume is billed continuously regardless of running/stopped state (~$0.32/day). Incremental cost during 45 minutes of testing is **$0.00**.
- **External API Costs:** **$0.000000 USD** (VoiceStudio is self-hosted on GPU).

---

## 4. Host Access & Transport Prerequisites

### A. AWS Systems Manager (SSM) Audit
- **Local Machine Prerequisite:** `session-manager-plugin` is **NOT installed** on the local Windows workstation. To enable SSM port forwarding, the plugin must be installed (e.g. via AWS MSI installer: `https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe`).
- **Host Role Prerequisite:** `marvedge-worker-role` is attached as the instance profile. IAM user `aaditya` lacks `iam:ListAttachedRolePolicies` permissions; team confirmation or testing on launch is required to ensure `AmazonSSMManagedInstanceCore` is attached.
- **SSM Agent:** AL2023 Deep Learning AMI includes pre-installed `amazon-ssm-agent`. When stopped, `get-connection-status` reports `notconnected` (expected).

### B. Direct SSH Access Audit
- **Security Group:** `sg-068dd4bcb4807e34a` allows inbound port 22 strictly from CIDR `182.72.39.9/32`.
- **Key Material:** KeyPair name is `marvedge-worker`. Private key `marvedge-worker.pem` is **NOT present** in local `~/.ssh`.
- **Prerequisite:** The team must place `marvedge-worker.pem` into `~/.ssh/marvedge-worker.pem` (read-only permissions) and execute from an IP routed through `182.72.39.9/32`.

---

## 5. Deployable Code Revision Strategy

The following files constitute the verified implementation in worktree `marvedge-task-00103`:
1. `docker-compose.voicestudio.yml` — Isolated container service configuration.
2. `app/lib/voicestudio/client.ts` — VoiceStudio HTTP client with wire-format health parsing.
3. `app/lib/voicestudio/dubbingAdapter.ts` — Dubbing pipeline adapter.
4. `app/lib/voicestudio/validateAudio.ts` — WAV header & duration validation.
5. `app/lib/voicestudio/errors.ts` — Typed errors hierarchy.
6. `scripts/benchmark/cloudCostBenchmark.ts` — Benchmark entrypoint with environment variable key fallback.
7. `scripts/benchmark/cloudCostBenchmark/providers.ts` — Provider registration and timing capture.
8. `scripts/benchmark/cloudCostBenchmark/orchestrator.ts` — Benchmark orchestration wiring.
9. `scripts/check_voicestudio_readiness.py` — Robust Python 10-minute readiness & CUDA gate probe.
10. `scripts/benchmark/run_voicestudio_host.sh` — Host execution runner with independent +35m watchdog.
11. `scripts/run_voicestudio_gpu_benchmark.ps1` — Local fail-safe orchestrator.
12. `docs/VOICESTUDIO_INTEGRATION.md` — Authoritative runbook.

### Deployment Options:
- **Option 1 (Pre-Run Authorized Commit):** Once approved, commit all reviewed files to branch `task/task-00103-voicestudio-integration` and push to origin. The EC2 host then checks out the exact commit SHA via `git fetch && git checkout <COMMIT_SHA>`.
- **Option 2 (Direct Patch Sync):** If pushing to remote GitHub is withheld, generate a patch `git diff 03da8516dff70badd0ef089760cadd5300d728b7 > voicestudio_prep.patch` and apply it directly on the host in `/opt/marvedge`.

---

## 6. Guaranteed Multi-Layer Teardown & Independent Watchdogs

To prevent runaway AWS charges under any circumstance (including local network failure, client crash, or hung process), teardown is enforced across three independent layers:

### Layer 1: Independent Host-Side Watchdog (Cloud-Side Guarantee)
Because instance `i-02aa4578f3790bae1` has `InstanceInitiatedShutdownBehavior=stop`, initiating a system halt from within Linux instructs EC2 to stop the instance.
At minute 0 of host execution, `run_voicestudio_host.sh` executes:
```bash
sudo shutdown -h +35 "Marvedge Task-00103 GPU hard deadline reached" &
```
Even if the developer's workstation loses internet or crashes, Linux autonomously triggers system halt at minute 35, and EC2 transitions the instance to `stopped`.

### Layer 2: Local Session Watchdog Process
Concurrently on the operator's workstation, `scripts/watchdog-ec2-session.ps1` runs:
```powershell
.\scripts\watchdog-ec2-session.ps1 -InstanceId i-02aa4578f3790bae1 -MaxDurationMinutes 35
```
It verifies stop permissions via `aws ec2 stop-instances --dry-run` at startup, monitors elapsed time every 30s, and issues stop requests if minute 35 is reached.

### Layer 3: Orchestrator Step-by-Step Failure Traps
Every execution step in `scripts/run_voicestudio_gpu_benchmark.ps1` and `scripts/benchmark/run_voicestudio_host.sh` is trapped (`trap cleanup_and_halt EXIT ERR INT TERM` in bash; `try { ... } finally { ... }` in PowerShell).
- If setup, model installation, readiness checks, inference, or audio validation fails, teardown is triggered immediately.
- If AWS API access fails during `aws ec2 stop-instances`, an exponential backoff retry loop executes 5 times (2s, 4s, 8s, 16s, 32s).
- If AWS CLI remains unreachable, Layer 1 halts the instance independently on the host, and the script outputs the direct console link:
  `https://ap-southeast-2.console.aws.amazon.com/ec2/home?region=ap-southeast-2#InstanceDetails:instanceId=i-02aa4578f3790bae1`

---

## 7. Robust Readiness Loop & CUDA Device Gate

VoiceStudio model loading and CUDA initialization are verified via `scripts/check_voicestudio_readiness.py`:

1. **Hard 10-Minute Timeout:** Enforces a 600-second limit from process start; exits with code 1 if exceeded.
2. **Model Download & Installation Probe:**
   - Issues `POST /models/install` with payload `{"repo_id": "k2-fsa/OmniVoice"}`.
   - Probes `GET /models/install/status` and `GET /models` to verify `omnivoice` is installed.
3. **Health & CUDA Gate:**
   - Probes `GET /health` until HTTP 200 is returned.
   - Inspects `body.device`:
     - If `device` contains `cuda`: Logs success and exits with code 0.
     - If `device` contains `cpu`: Logs fatal error and exits with code 2 (aborting before inference).
4. **Resilience:** Built using standard Python 3 `urllib.request` (zero dependencies), handling HTTP 503 retry headers, malformed responses, and network warmup gracefully.

---

## 8. Zero-Exposure API Key Security Policy

- **Generation:** High-entropy secret generated in session memory: `export VOICESTUDIO_API_KEY=$(openssl rand -hex 24)`.
- **Environment Injection:** Passed via environment variable `VOICESTUDIO_API_KEY` to Docker Compose and the benchmark runner.
- **Process Listing Protection:** CLI argument `--voicestudio-api-key` is **omitted**. The benchmark runner reads `process.env.VOICESTUDIO_API_KEY` directly, ensuring secrets never appear in `ps aux`, `/proc/$PID/cmdline`, or PowerShell process tables.
- **Report Redaction:** Benchmark report generators sanitize headers and exclude API keys from `report.json` and `report.md`.
- **Source Control Safety:** Secrets are never written to `.env`, committed to Git, or included in logs.

---

## 9. Step-by-Step GPU Benchmark Execution Procedure

```
================================================================================
CRITICAL TIMING & CEILING:
- Runtime clock begins immediately when 'aws ec2 start-instances' is executed.
- Hard runtime limit: 45 minutes ($0.533 USD compute ceiling).
- Mandatory teardown start: 35 minutes elapsed.
================================================================================
```

### Preflight Verification (Local PowerShell)
```powershell
# 1. Verify EC2 stop permission via dry run
aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge --dry-run
# Expect: Request would have succeeded, but DryRun flag is set.
```

### Automated Execution (Topology A - Native EC2 Run)
```powershell
# Executes complete workflow with preflight check, startup, remote execution, artifact retrieval, and guaranteed teardown
.\scripts
un_voicestudio_gpu_benchmark.ps1 -Topology TopologyA -SshKeyPath ~/.ssh/marvedge-worker.pem
```

### Automated Execution (Topology B - Port-Forwarding Tunnel Run)
```powershell
# Executes complete workflow over local tunnel against 127.0.0.1:3900 with guaranteed teardown
.\scripts
un_voicestudio_gpu_benchmark.ps1 -Topology TopologyB -SshKeyPath ~/.ssh/marvedge-worker.pem
```

---

## 10. Artifact Validation & Telemetry

Following execution, generated artifacts are verified:
1. **Audio Validation:**
   ```bash
   ffprobe -v error -show_entries format=duration,size,bit_rate -show_streams -select_streams a:0 benchmark_results/artifacts/*.wav
   ```
   Ensures non-zero bytes, duration matching input (~5.0s), and valid WAV encoding.
2. **GPU Telemetry:**
   Output report records measured Tesla T4 VRAM (peak ~2,487 MiB), average GPU % utilization, and separate metrics for cold-start vs. warm inference.

---

## 11. Cleanup & Model Cache Policy

- **Container Teardown:** `docker compose -f docker-compose.voicestudio.yml down` (without `-v`).
- **Volume Policy:** Docker volume `marvedge-voicestudio-data` resides on the 100 GB root EBS volume. Preserving the 2.3 GB checkpoint saves ~8 minutes of download time on future runs with **$0.00 additional AWS charges**.
- **Ephemeral Wiping (Optional):** If a clean-slate wipe is strictly required, pass `-v` to remove the volume: `docker compose down -v`.
- **Instance Stopped State Verification:**
  ```powershell
  aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge --query "Reservations[0].Instances[0].State.Name" --output text
  # Output must be: "stopped"
  ```

---

## 12. Empirical Tesla T4 Benchmark Reconciliation & Scope Boundaries

### A. Measured Synthesis Performance (10-Step OmniVoice Narration)
- **Model Checkpoint:** `k2-fsa/OmniVoice` on VoiceStudio `ghcr.io/debpalash/voicestudio:0.5.6`.
- **Hardware Platform:** AWS EC2 `g4dn.xlarge` (`i-02aa4578f3790bae1`, 4 vCPUs, 16 GiB RAM, NVIDIA Tesla T4 16GB, `ap-southeast-2` Sydney).
- **Execution:** 10 multi-paragraph educational lecture narration batches (1,385 words total).
- **Audio Output:** 999.32 seconds (16m 39.3s) of 24 kHz 16-bit mono PCM WAV (47,967,264 bytes).
- **GPU Wall-Clock Compute Time:** 380.305 seconds (6m 20.3s).
- **Measured Real-Time Factor (RTF):** **`0.3806x`** (380.305 s compute / 999.32 s audio).
- **Peak VRAM Allocated:** 9,837 MiB / 15,360 MiB (~64% capacity).
- **Errors / Retries:** 0 errors, 0 retries.

### B. Cost Accounting & Session Ceiling Overrun
- **Conservative Sydney On-Demand Rate:** **`$0.7104 / hr`** ($0.000197333 / s).
- **Marginal 10-Minute TTS Compute Cost:**
  $$\text{Expected Compute for 600.09s Speech} = 600.09\text{ s} \times 0.380564 = 228.374\text{ s}$$
  $$\text{Marginal TTS Compute Cost} = 228.374\text{ s} \times \$0.000197333/\text{s} = \mathbf{\$0.0451\text{ USD}}\quad (\$0.00451/\text{media min})$$
  *(Note: Pure marginal compute for active GPU synthesis; excludes boot/warmup overhead and EBS retention).*
- **Live Validation Session Runtime:** 14.18 minutes (851 seconds from cold start through SSM commands, model load, synthesis, and stop polling).
- **Actual Validation Session Cost:** **`$0.1679 USD`** (14.18 min @ $0.7104/hr).
- **Planning Ceiling Overrun ($0.1200 Ceiling):** **`+$0.0479 USD (+39.9% overrun)`**.
  *Cause:* Synthesizing 999.32s across 10 batches (rather than exactly 600s) consumed 380.3s of compute, combined with SSM command polling and model initialization latency.
- **Verified Persistent Storage Cost:** Root EBS volume `vol-0b359be0e21cf51c7` is verified at **100 GiB gp3** (3,000 IOPS, 125 MB/s). At the published `ap-southeast-2` gp3 rate of $0.096/GB-month, baseline persistent storage is **`$9.60/month`** (~$0.315/day). Retaining the 2.3 GB model on the persistent Docker volume incurs $0.00 incremental charges while saving ~8 minutes of download time per cold run.
- **Full End-to-End 10-Minute Video Dubbing Cost:** **`Undetermined`** (external pipeline stages were not executed).
- **Commercial ElevenLabs Comparison (Illustrative Only):** Standard pay-as-you-go commercial ElevenLabs character billing for 1,385 words (~9,000–10,000 characters) costs ~$1.98 to $3.00 USD. This comparison illustrates raw compute savings ($0.0451 vs. $2.00+) but does not represent total cost of ownership (TCO), as managed SaaS includes orchestration, storage, and maintenance overhead.

### C. Production Pipeline Scope Boundaries
- **Verified Locally:** FFmpeg stream demuxing/muxing, VoiceStudio HTTP synthesis adapter, WAV header validation, and container GPU acceleration.
- **Excluded / Blocked in Local Environment:** Whisper ASR, LLM translation, Cloudinary/GCS cloud storage upload, GCP Cloud Run `/avs-dub` lip-sync, MediaPipe AutoFlip, and BullMQ/Redis worker orchestration.
- **Audio-Video Muxing Limitation:** The local muxing validation test used `-shortest` against `col_segment_10m.mp4` (600.09s), truncating the 999.32s audio stream at 600.07s. It proves container and audio/video muxing compatibility, but does not validate semantic synchronization, speaker lip alignment, or full audio preservation.

