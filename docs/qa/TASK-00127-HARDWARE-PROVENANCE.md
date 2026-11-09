# Task-00127: Hardware Provenance Specification & Historical Benchmark Mapping

**Document:** `docs/qa/TASK-00127-HARDWARE-PROVENANCE.md`  
**Task:** Task-00127 — Portable Multi-Cloud Benchmark Harness & Hardware Provenance  
**Author:** AI Engineering & Infrastructure QA  
**Date:** 9 November 2026  
**Status:** ✅ **Approved & Integrated**  

---

## 1. Executive Summary & Objective

In Task-00102 and earlier benchmark efforts (e.g., Task-00097), throughput and cost models were reported without a portable mechanism to verify the execution environment or guarantee whether numbers reflected real physical GPU inference, CPU fallback, or mock/fixture execution. Furthermore, multi-cloud cost models (AWS, GCP, Azure) were either hardcoded or conflated spot and on-demand pricing tiers.

**Task-00127 establishes:**
1. **Accurate Hardware Provenance Logging:** Capturing container status, CPU architecture, host memory, GPU model/driver/VRAM, Python runtime, CUDA availability, and Docker versions.
2. **Deterministic Verification Status Classification:**
   - `verified_hardware`: Live GPU inference confirmed with physical GPU telemetry.
   - `partially_verified`: Live execution attempted on CPU or with some blocked stages.
   - `fixture_simulation`: Deterministic in-memory simulation with zero external spend.
   - `unknown`: Incomplete telemetry or unclassified runtime.
3. **Historical Benchmark Lineage:** Formal mapping between Task-00097 Colab Pro T4 benchmarks, AWS `g4dn.xlarge` extrapolations, and modern local dev workstation environments (e.g., AMD Ryzen AI 7 + NVIDIA RTX 5050).

---

## 2. Historical Hardware Provenance (Task-00097 Benchmark)

The baseline benchmark corpus documented in `docs/qa/task97_benchmark_summary.md` was executed on a Google Colab Pro GPU runtime on 20 October 2026.

### 2.1 Hardware Specification Comparison

| Hardware Parameter | Task-00097 Historical Baseline (Colab Pro) | AWS EC2 `g4dn.xlarge` (Production Target) | Local Validation Environment (Dev Host) |
| :--- | :--- | :--- | :--- |
| **GPU Model** | NVIDIA Tesla T4 | NVIDIA Tesla T4 | NVIDIA GeForce RTX 5050 Laptop GPU |
| **GPU Architecture** | Turing (TU104) | Turing (TU104) | Blackwell (GB20x) |
| **CUDA Cores** | 2,560 | 2,560 | 2,560+ |
| **GPU VRAM** | 16 GB GDDR6 (320 GB/s) | 16 GB GDDR6 (320 GB/s) | 8 GB GDDR6 |
| **Host CPU** | Intel Xeon (2 vCPUs @ 2.20 GHz) | Intel Xeon Cascade Lake (4 vCPUs) | AMD Ryzen AI 7 350 (16 vCPUs @ 2.0 GHz) |
| **System Memory** | 12.7 GB Available | 16.0 GB Available | 24.72 GB (DDR5) |
| **Storage Subsystem** | 78 GB Ephemeral NVMe SSD | EBS gp3 / NVMe Instance Storage | 1 TB PCIe 4.0 NVMe SSD |
| **OS / Runtime** | Ubuntu Linux x86_64, Python 3.10 | Amazon Linux 2 / Ubuntu 22.04 LTS | Windows 11 x64 (bare-metal) |
| **CUDA / PyTorch** | CUDA 12.2 / PyTorch 2.14 | CUDA 12.2 / PyTorch 2.14 | Driver 592.82 / PyTorch local |

---

## 3. Historical Benchmark Results & Throughput Lineage

### 3.1 Task-00097 Real-World Benchmark Corpus (Colab Pro T4)

Across the 8 real-life YouTube assets totaling 5 hours 23 minutes 05 seconds:
- **Cumulative Processing Time:** 2,115.2 s (~35.25 minutes).
- **Aggregate Throughput:** **9.16× Real-Time** (including FFmpeg demux, face tracking, TalkNet forward pass, and render).
- **Peak Stage Throughput:** 16.5× Real-Time (screen tutorial asset `vid03`).
- **Lowest Stage Throughput:** 9.8× Real-Time (feature-length movie `vid05`).
- **Peak TalkNet VRAM:** 2.8 GB during forward pass.

### 3.2 Extrapolated AWS EC2 `g4dn.xlarge` Cost Model

Based on the 9.16× – 12.0× Real-Time sustained throughput observed on the T4:
- **AWS Spot Rate:** $0.22/hr (~70% discount).
- **AWS On-Demand Rate (ap-southeast-2):** $0.7104/hr.
- **AWS On-Demand Rate (us-east-1):** ~$0.526/hr.
- **Compute Cost per 10-Minute Video:**
  - *Spot:* `(10 min / 12) * ($0.22 / 60)` ≈ **$0.0031 per export**.
  - *On-Demand:* `(10 min / 12) * ($0.7104 / 60)` ≈ **$0.0099 per export**.
- **Daily At-Scale Cost (100 exports / 16.6h media):**
  - *Spot:* ~$0.31/day ($9.30/month).
  - *On-Demand:* ~$0.99/day ($29.70/month).

---

## 4. Multi-Cloud Pricing Matrix (Task-00127)

Task-00127 introduces formal multi-cloud pricing models accessible via `--cloud` and `--pricing-tier`:

| Preset Identifier | Provider | Instance Type / Description | Compute Rate ($/hr) | Tier | Pricing Date | Regional Note |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `L4` | GCP | Cloud Run NVIDIA L4 (24GB) | $0.8000 | Standard | 2026-Q3 | Google Cloud Run reference |
| `T4` | GCP | Cloud Run NVIDIA T4 (16GB) | $0.3500 | Standard | 2026-Q3 | Google Cloud Run reference |
| `AWS_G4DN_ONDEMAND` | AWS | EC2 `g4dn.xlarge` (T4 16GB) | $0.7104 | On-Demand | 2026-Q3 | Sydney (ap-southeast-2) reference |
| `AWS_G4DN_SPOT` | AWS | EC2 `g4dn.xlarge` (T4 16GB) | $0.2200 | Spot | 2026-Q3 | Dynamic market spot average |
| `AZURE_NCAST4` | Azure | Standard_NC4as_T4_v3 (T4 16GB) | $0.5260 | Standard | 2026-Q3 | US East zone standard rate |
| `CPU` | Local | Generic 4 vCPU / 16GB RAM | $0.0900 | Standard | 2026-Q3 | Cloud Run CPU baseline assumption |

---

## 5. Schema 1.2.0 Provenance Telemetry Invariants

All benchmark reports generated by `scripts/benchmark/cloudCostBenchmark.ts` enforce the following JSON invariants:

```json
"provenance": {
  "containerized": false,
  "executionEnvironment": "bare-metal",
  "cloudProvider": "aws",
  "instanceType": "AWS EC2 g4dn.xlarge (T4 16GB) Spot",
  "pricingTier": "spot",
  "verificationStatus": "fixture_simulation",
  "cpuModel": "AMD Ryzen AI 7 350 w/ Radeon 860M",
  "cpuCores": 16,
  "memoryTotalBytes": 24717639680,
  "gpuModel": "NVIDIA GeForce RTX 5050 Laptop GPU",
  "gpuMemoryTotalBytes": null,
  "gpuAvailable": true,
  "osPlatform": "win32",
  "architecture": "x64",
  "nodeVersion": "v24.13.1",
  "pythonVersion": "Python 3.14.2",
  "cudaVersion": null,
  "gpuDriverVersion": "592.82",
  "dockerVersion": "Docker version 29.7.2, build a7dcaa6",
  "benchmarkTimestamp": "2026-11-09T10:04:20.230Z"
}
```

### Safety & Guardrail Assertions
1. **No False GPU Claims:** When running fixture simulations or CPU fallbacks, `verificationStatus` is strictly `fixture_simulation` or `partially_verified`. It is NEVER marked `verified_hardware` unless live GPU inference is measured with physical GPU telemetry.
2. **Zero Incurred Spend in Fixtures:** All fixture runs enforce `externalApiCostUsd == 0.000000`.
3. **Weight Download Ban:** Automatic background downloading of TalkNet weights is forbidden. When `TALKNET_SERVICE_URL` is omitted and weights are missing, execution aborts with `TALKNET_WEIGHTS_MISSING`. When remote `TALKNET_SERVICE_URL` is provided, preflight relies on remote service hosting.
