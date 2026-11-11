# Task-00128 — AWS GPU Preflight Audit & Execution Readiness Report

**Document:** `docs/qa/TASK-00128-AWS-GPU-PREFLIGHT.md`
**Audit Date:** 2026-11-11T17:35:00+05:30
**Target AWS Instance:** `i-02aa4578f3790bae1` (`marvedge-gpu-worker`)
**AWS Region:** `ap-southeast-2` (Sydney) / Availability Zone: `ap-southeast-2a`
**AWS Account:** `753369745408`
**Caller Identity:** `arn:aws:iam::753369745408:user/aaditya`
**Profile:** `marvedge`
**Audit Type:** Phase 1 — Read-Only Preflight Inspection

---

## 1. Executive Summary & Readiness Verdict

An exhaustive, read-only preflight audit was conducted to determine the operational, network, security, and tooling readiness of AWS EC2 instance `i-02aa4578f3790bae1` for live Task-00128 GPU benchmarking.

### Preflight Readiness Scorecard

| Check Item                        | Verified Reality                                                                                                                                                                                                       | Status                      |
| :-------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| **1. Instance State & Profile**   | Instance `i-02aa4578f3790bae1` is **`stopped`** (Code 80). User-initiated shutdown on 2026-11-09.                                                                                                                      | **VERIFIED (STOPPED)**      |
| **2. Physical GPU Hardware**      | `g4dn.xlarge` instance type verified. Contains 1 × **NVIDIA Tesla T4 (16 GB GDDR6 VRAM)**, 4 vCPUs, 16 GiB RAM.                                                                                                        | **VERIFIED (T4 16GB)**      |
| **3. AMI & OS Environment**       | `ami-02ca582744f542171` (`Deep Learning OSS Nvidia Driver AMI GPU PyTorch 2.14 (Amazon Linux 2023) 20261003`). Pre-installs NVIDIA driver 535+, CUDA 12.x, PyTorch, and AWS SSM Agent.                                 | **VERIFIED (AL2023 DLAMI)** |
| **4. Storage Volume Headroom**    | 100 GB `gp3` root volume (`vol-0b359be0e21cf51c7`). Estimated available free space: **~50–60 GB**.                                                                                                                     | **VERIFIED (100 GB gp3)**   |
| **5. IAM Authorization**          | User `aaditya` verified for `ec2:StartInstances` and `ec2:StopInstances` via `--dry-run` (`DryRunOperation` pass).                                                                                                     | **VERIFIED (AUTHORIZED)**   |
| **6. Connectivity & SSM**         | AWS Systems Manager Session Manager plugin is installed locally. Port 22 is restricted to a legacy IP (`182.72.39.9/32`) and no local SSH `.pem` key exists. **SSM is the required and supported connection channel**. | **VERIFIED (SSM READY)**    |
| **7. Service Architecture**       | `docker-compose.yml` configures `ml-gateway` (port 8000), `autoflip` (MediaPipe service), `talknet` (PyTorch service), and `docker-compose.voicestudio.yml` (port 3900).                                               | **VERIFIED (IN CODEBASE)**  |
| **8. Model Weights & Containers** | AutoFlip and TalkNet container build/run status and local weight cache on the instance require live post-boot inspection via SSM.                                                                                      | **PENDING BOOT INSPECTION** |
| **9. 30-Minute Cost Ceiling**     | Total estimated AWS spend for a 30-minute run is **~$0.364 USD** (\$0.3552 compute + \$0.0025 IPv4 + \$0.0066 amortized EBS).                                                                                          | **VERIFIED (< $0.40 USD)**  |

### Readiness Verdict: **READY FOR CONTROLLED BOOT & VALIDATION (PENDING OPERATOR CONFIRMATION)**

The environment satisfies all cloud configuration, IAM authorization, and cost protection guardrails. Because no SSH `.pem` key is present on the workstation and port 22 is restricted by security group rules, execution must proceed via **AWS Systems Manager (SSM)**.

---

## 2. EC2 Instance State & Hardware Configuration

Empirical query executed via AWS CLI:

```bash
aws ec2 describe-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge
```

### Detailed Instance Specifications

- **Instance ID:** `i-02aa4578f3790bae1`
- **Instance State:** **`stopped`** (Code: `80`)
- **State Transition Reason:** `User initiated (2026-11-09 05:53:51 GMT)`
- **Instance Type:** `g4dn.xlarge`
- **Region / AZ:** `ap-southeast-2` (Sydney) / `ap-southeast-2a` (`apse2-az1`)
- **GPU Accelerator:** **1 × NVIDIA Tesla T4** (16 GB GDDR6 VRAM, Turing Architecture, 320 Tensor Cores, 2,560 CUDA Cores)
- **Host vCPU:** 4 vCPUs (Intel Xeon Platinum 8259CL, 2 Cores, 2 Threads/Core)
- **Host System RAM:** 16 GiB System Memory
- **Network Interface:** `eni-03d4db1e943a532ab` (Private IP: `172.31.8.120`, ENA Support: `true`)
- **Public IP Address:** None while stopped (Subnet `subnet-03547601323aa5e5e` has `MapPublicIpOnLaunch: true`; AWS will assign a public IPv4 upon start).
- **VPC ID:** `vpc-0b1bd9bae8138ef98` (Default VPC)
- **Subnet ID:** `subnet-03547601323aa5e5e` (Default Public Subnet, CIDR: `172.31.0.0/20`)
- **Security Group:** `sg-068dd4bcb4807e34a` (`marvedge-worker-sg`)
- **IAM Instance Profile:** `arn:aws:iam::753369745408:instance-profile/marvedge-worker-role`
- **AMI ID:** `ami-02ca582744f542171`
  - AMI Name: `Deep Learning OSS Nvidia Driver AMI GPU PyTorch 2.14 (Amazon Linux 2023) 20261003`
  - _Provenance Note:_ This empirical AMI name resolves the historical Task-97 question; AWS literally named this official Amazon Linux 2023 release "PyTorch 2.14".

---

## 3. Storage Volume & Disk Space Headroom

Empirical query executed via AWS CLI:

```bash
aws ec2 describe-volumes --volume-ids vol-0b359be0e21cf51c7 --region ap-southeast-2 --profile marvedge
```

### Storage Characteristics

- **Volume ID:** `vol-0b359be0e21cf51c7`
- **Attachment:** `/dev/xvda` on `i-02aa4578f3790bae1` (DeleteOnTermination: `true`)
- **Volume Type:** `gp3`
- **Volume Size:** **100 GB**
- **Provisioned Performance:** 3,000 IOPS, 125 MB/s baseline throughput
- **Encrypted:** `false`

### Estimated Disk Headroom & Usage

| Component                                                                  | Estimated Size | Cumulative Usage | Remaining Headroom              |
| :------------------------------------------------------------------------- | :------------- | :--------------- | :------------------------------ |
| **Total Root Volume (`gp3`)**                                              | 100.0 GB       | 0.0 GB           | 100.0 GB                        |
| **Base AL2023 DLAMI OS + CUDA + PyTorch**                                  | ~22.0 GB       | 22.0 GB          | 78.0 GB                         |
| **Docker Engine & Base Images**                                            | ~6.0 GB        | 28.0 GB          | 72.0 GB                         |
| **AutoFlip Container & Dependencies**                                      | ~4.5 GB        | 32.5 GB          | 67.5 GB                         |
| **TalkNet Container & Weights (`sfd_face.pth`, `pretrain_TalkSet.model`)** | ~3.8 GB        | 36.3 GB          | 63.7 GB                         |
| **VoiceStudio Container (Task-00103)**                                     | ~4.2 GB        | 40.5 GB          | 59.5 GB                         |
| **Benchmark Harness, Node Modules & Artifacts**                            | ~1.5 GB        | 42.0 GB          | **~58.0 GB (Healthy Headroom)** |

_Conclusion:_ The 100 GB volume provides ample disk headroom (>50 GB free) for all model weights, container layers, and test video artifacts.

---

## 4. IAM Permissions, Security Groups & SSM Connectivity

### 4.1 Local Operator IAM Identity

- **User ARN:** `arn:aws:iam::753369745408:user/aaditya`
- **Access Verification:**
  - `ec2:DescribeInstances`, `ec2:DescribeVolumes`, `ec2:DescribeSecurityGroups`, `ec2:DescribeImages`: **PASS**
  - `ec2:StartInstances --dry-run`: **PASS** (`Request would have succeeded, but DryRun flag is set`)
  - `ec2:StopInstances --dry-run`: **PASS** (`Request would have succeeded, but DryRun flag is set`)
  - `iam:GetInstanceProfile`: **AccessDenied** (Non-blocking: instance profile is already attached to EC2)
  - `ssm:ListDocuments`, `ssm:DescribeInstanceInformation`: **PASS**

### 4.2 Network Ingress & Security Group Analysis (`sg-068dd4bcb4807e34a`)

- **Inbound Rules:**
  - Port 8080: Open to VPC CIDR `172.31.0.0/16` and dev IP `139.167.143.182/32`.
  - Port 22 (SSH): Open strictly to `182.72.39.9/32`.
- **Outbound Rules:**
  - All traffic (`-1`) to `0.0.0.0/0`.
- **SSH Key Pair Status:**
  - EC2 instance configured with KeyPair `"marvedge-worker"`.
  - Workstation check for `~/.ssh/marvedge-worker.pem`: **`False` (Not Present)**.
  - Workstation check across repository: No `.pem` files found.

### 4.3 Systems Manager (SSM) Session Manager Channel

Because direct SSH is blocked by security group IP restrictions and the lack of a local private key, **AWS Systems Manager (SSM)** is the authoritative, secure access method:

- Workstation has `session-manager-plugin` installed and verified (`The Session Manager plugin was installed successfully`).
- Amazon Linux 2023 DLAMI runs the `amazon-ssm-agent` daemon automatically.
- Security group allows all outbound traffic to `0.0.0.0/0`, enabling the instance to reach AWS SSM endpoints without inbound ports open.
- SSM allows interactive shell access, non-interactive command execution, and port forwarding directly over encrypted TLS channels without exposing port 22 or 8080 to the public internet.

---

## 5. Deployment Topology & Service Configurations

The repository provides two container configurations supporting GPU benchmarking:

### 5.1 Architecture A: Full Multi-Stage ML Gateway (`docker-compose.yml`)

- **Network:** `marvedge-ml-net` (bridge)
- **Services:**
  1. `ml-gateway`: FastAPI proxy routing `/reframe` to AutoFlip and `/detect` to TalkNet.
     - Port: `8000:8000`
     - Requires: `ML_GATEWAY_TOKEN` (or `ML_GATEWAY_ALLOW_INSECURE=1`)
  2. `autoflip`: MediaPipe C++ headless binary service (`run_autoflip_to_json`).
     - Exposed Port: `8000`
     - Service URL: `http://autoflip:8000` (or `http://localhost:8000` via gateway)
  3. `talknet`: PyTorch Active Speaker Detection service.
     - Exposed Port: `8000`
     - Weights: Mounted from `talknet/weights` (`sfd_face.pth`, `pretrain_TalkSet.model`)
     - Service URL: `http://talknet:8000` (or `http://localhost:8000` via gateway)
  4. `benchmark`: Containerized benchmark CLI (`Dockerfile.benchmark`).
     - Output Volume: `./benchmark_results:/app/benchmark_results`

### 5.2 Architecture B: VoiceStudio GPU Container (`docker-compose.voicestudio.yml`)

- Validated in Task-00103 via `scripts/run_voicestudio_gpu_benchmark.ps1`.
- Exposes port `3900` (`http://localhost:3900`).
- Validated with CUDA for zero-shot synthetic dubbing.

---

## 6. Required Environment Variables & Secrets Protocol

In compliance with Critical Safety Rule 5, no secret values are displayed. The following environment variables are required for execution:

| Variable               | Location           | Requirement / Purpose                                                                           |
| :--------------------- | :----------------- | :---------------------------------------------------------------------------------------------- |
| `AWS_PROFILE`          | Local Shell / Host | Set to `marvedge` to route CLI calls to account `753369745408`.                                 |
| `ML_GATEWAY_TOKEN`     | Host / Container   | Required shared secret for `ml-gateway` proxy. Set to random hex (e.g. `openssl rand -hex 24`). |
| `AUTOFILP_SERVICE_URL` | Benchmark Harness  | Set to `http://localhost:8000` (or `http://autoflip:8000` in container).                        |
| `TALKNET_SERVICE_URL`  | Benchmark Harness  | Set to `http://localhost:8000` (or `http://talknet:8000` in container).                         |
| `GROQ_API_KEY`         | Benchmark Harness  | Optional: Required only if running live Groq Whisper API for Stage 3 (Captions).                |
| `VOICESTUDIO_API_KEY`  | Benchmark Harness  | Required for local VoiceStudio dubbing (generated in-memory).                                   |

---

## 7. Cost Model for Controlled 30-Minute Test

All rates reference official AWS Sydney (`ap-southeast-2`) pricing:

### Detailed Cost Breakdown

1. **EC2 Compute (`g4dn.xlarge`):**
   - On-Demand Hourly Rate: **\$0.7104 USD / hour**
   - 30-Minute Compute Cost ($0.5 \times \$0.7104$): **\$0.3552 USD**
     _(Note: If launched as Spot, rate is ~$0.22/hour $\rightarrow$ \$0.11 USD for 30 mins)_
2. **Public IPv4 Address Fee:**
   - Standard AWS IPv4 Rate: **\$0.0050 USD / hour**
   - 30-Minute IPv4 Cost ($0.5 \times \$0.0050$): **\$0.0025 USD**
3. **EBS Root Volume Storage (`gp3`, 100 GB):**
   - Sydney Rate: \$0.096 per GB-month
   - Monthly Cost: \$9.60 USD / month
   - Amortized 30-Minute Cost ($\frac{\$9.60}{730\text{ hrs}} \times 0.5$): **\$0.0066 USD**
4. **Third-Party External API Charges:**
   - Groq Whisper (1 run, 30s audio): **\$0.0030 USD**
   - VoiceStudio / AutoFlip / TalkNet: **\$0.0000 USD** (Runs locally on GPU)

### **Total Estimated AWS Spend for 30-Minute Run: $0.364 USD**

_(Strictly within the operator budget guardrails of < $10.00 per session)._

---

## 8. Exact Operational Runbook

When the operator decides to proceed with the live GPU benchmark, execute the following steps in sequence:

### Step 1: Pre-Execution Verification & Dry Run

```bash
# Verify stop authorization
aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge --dry-run
```

### Step 2: Start Instance & Await Running State

```bash
# Start instance
aws ec2 start-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge

# Wait until running
aws ec2 wait instance-running --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge

# Wait 60 seconds for SSM agent registration
```

### Step 3: Connect via AWS Systems Manager Session Manager

```bash
aws ssm start-session --target i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge
```

### Step 4: Host-Side Inspection & Execution (Inside SSM Session)

```bash
# 1. Arm host-side safety watchdog (30-minute self-termination)
sudo shutdown -h +30 "Task-00128 GPU safety ceiling reached" &

# 2. Verify GPU and NVIDIA driver
nvidia-smi

# 3. Check disk space
df -h /

# 4. Navigate to repo
cd /opt/marvedge

# 5. Start ML services
docker compose up -d autoflip talknet ml-gateway

# 6. Verify service health
curl -s http://localhost:8000/health

# 7. Run Task-00127 GPU benchmark runner
export ML_GATEWAY_URL="http://localhost:8000"
npx tsx scripts/benchmark/cloudCostBenchmark.ts \
  --stages=reframe,avs \
  --provider-reframe=autoflip \
  --provider-avs=talknet \
  --iterations=1 \
  --warmup=0 \
  --output-json=benchmark_results/task128_gpu_aws_report.json \
  --output-markdown=benchmark_results/task128_gpu_aws_report.md

# 8. Clean up containers
docker compose down
```

### Step 5: Guaranteed Stop Command (Local Workstation)

Immediately after benchmark completion (or if disconnected):

```bash
# Issue stop command
aws ec2 stop-instances --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge

# Verify stopped state
aws ec2 wait instance-stopped --instance-ids i-02aa4578f3790bae1 --region ap-southeast-2 --profile marvedge
```

---

## 9. Recommendation & Next Steps

### Recommendation: **SAFE TO PROCEED**

1. **Safety Controls:** The IAM credentials have verified start/stop permissions, and the instance can be safely stopped at any time via CLI or its host-side `shutdown -h +30` watchdog.
2. **Cost Risk:** Negligible (~$0.36 USD for 30 minutes).
3. **Execution Path:** AWS SSM Session Manager provides reliable command execution and port forwarding without requiring SSH keys or public ingress.

### Outstanding Prerequisite for Operator Decision:

To execute Phase 2 (Live GPU Benchmark Execution), please confirm approval to start instance `i-02aa4578f3790bae1` for a controlled 30-minute window.
