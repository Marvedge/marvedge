# Task-00129 — Cost per Processed Minute, 10-Minute Pipeline Economics & Margin Analysis Report

**Document Version:** 1.1.0
**Audit & Analysis Date:** 2026-11-11T19:25:00+05:30 (13:55:00 UTC)
**Repository Working Directory:** `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge`
**Active Branch:** `task/task-00129-cost-per-minute-margin-analysis`
**Task ID:** Task-00129
**Author:** Antigravity System Agent (Financial & Infrastructure Engineering)

---

## 1. Executive Summary

This report establishes the unit economics, per-processed-minute costs, 10-minute video processing expenses, and gross margin profiles for the Marvedge video AI processing pipeline under **Task-00129**.

Empirical evidence from the Task-00128 live AWS GPU benchmarks (Tesla T4 16GB), verified external API fee schedules, and reproducible pipeline runtime measurements are combined into a standardized economic model.

> [!IMPORTANT]
> **Incremental COGS vs. Full Production Operating Costs:**
> The headline figures in this report represent **modeled incremental pipeline COGS** (the marginal compute runtime and direct third-party API fees incurred per job). They do **not** represent fully allocated production operating costs. Fully allocated production operating costs must separately account for:
>
> - **Idle Instance Capacity & Cold Starts:** Billed instance hours while waiting for queue work.
> - **Orchestration & Queue Infrastructure:** BullMQ workers, Redis clusters, API gateways, and database instances.
> - **Retries & Failed Jobs:** Reruns and unbillable processing attempts.
> - **Network Egress & Asset Storage:** Cloudinary transformations, S3 egress, and CDN distribution.
> - **Persistent EBS Storage:** The 100 GB `gp3` root volume ($0.096/GB-mo = $9.60/month, ~$0.315/day) that continues accruing charges 24×7 while provisioned, regardless of instance state.

### Key Economic Takeaways:

1. **Commercial SaaS Pipeline (Production Default — Profile 1):**
   - Operating on AWS EC2 `g4dn.xlarge` On-Demand ($0.7104/hr) with commercial APIs (OpenAI Whisper + ElevenLabs Dubbing), the incremental cost per input media minute is **$0.1705 USD/min** (**$1.7047 USD** for a standard 10-minute video).
   - **Cost Concentration:** External API dubbing via ElevenLabs ($0.1500/min) represents **88.0% of the entire pipeline cost**. Compute infrastructure represents only **8.5%** ($0.0144/min), and transcription represents **3.5%** ($0.0060/min).
2. **Cloud-Optimized Pipeline (AWS Spot + Groq Whisper — Profile 2):**
   - Utilizing AWS Spot ($0.22/hr) and Groq Cloud Whisper Large V3 ($0.00185/min) reduces compute and transcription costs by 69% and 69% respectively, yielding **$0.1563 USD/min** (**$1.5633 USD** for a 10-minute video). However, ElevenLabs continues to dominate **95.9%** of the billable cost.
3. **Full Self-Hosted Open-Source Pipeline (Modeled Sovereign GPU AI — Profile 3):**
   - Replacing external SaaS APIs with local GPU models (Faster-Whisper on CUDA + VoiceStudio Omnivoice TTS) on AWS Spot eliminates all third-party API fees.
   - The total processing cost drops to **$0.0084 USD/min** (**$0.0839 USD** for a 10-minute video) — an **80% to 95.1% cost reduction** compared to commercial SaaS profiles.
   - _Classification Note:_ Profile 3 is an illustrative modeled scenario based on engineering estimates (1.0x RTF for VoiceStudio, ~15x RT for Faster-Whisper), not a measured production benchmark.
4. **Commercial Gross Margins:**
   - At a standard creator retail price of **$0.50 / media minute** ($5.00 for 10 minutes), the commercial SaaS pipeline yields a **65.9% gross margin** ($3.30 gross profit), while the modeled self-hosted AI pipeline yields a **98.3% gross margin** ($4.92 gross profit).
   - At an enterprise retail price of **$1.00 / media minute** ($10.00 for 10 minutes), margins expand to **82.9%** (SaaS) and **99.2%** (Self-Hosted).
   - **Break-Even Selling Price:** **$0.1705 / min** (Production SaaS), **$0.1563 / min** (Spot SaaS), and **$0.0084 / min** (Self-Hosted AI).

---

## 2. One-Page Cost & Margin Master Table

The table below summarizes unit economics and commercial gross margins for a standard 10-minute video across four deployment profiles.

| Economic Metric                       | Profile 1: Standard SaaS Production | Profile 2: Cost-Optimized Cloud | Profile 3: Full Self-Hosted AI (Modeled) | Profile 4: Serverless Container |
| :------------------------------------ | :---------------------------------- | :------------------------------ | :--------------------------------------- | :------------------------------ |
| **Compute Infrastructure**            | AWS EC2 `g4dn.xlarge` (On-Demand)   | AWS EC2 `g4dn.xlarge` (Spot)    | AWS EC2 `g4dn.xlarge` (Spot)             | GCP Cloud Run GPU (T4 16GB)     |
| **Compute Hourly Rate**               | $0.7104 / hr                        | $0.2200 / hr                    | $0.2200 / hr                             | $0.3500 / hr                    |
| **Reframing Provider**                | AutoFlip (MediaPipe Native)         | AutoFlip (MediaPipe Native)     | AutoFlip (MediaPipe Native)              | AutoFlip (MediaPipe Native)     |
| **AVS Provider**                      | TalkNet (CUDA Tesla T4)             | TalkNet (CUDA Tesla T4)         | TalkNet (CUDA Tesla T4)                  | TalkNet (CUDA Tesla T4)         |
| **Captions Provider**                 | OpenAI Whisper API                  | Groq Cloud Whisper API          | Local Faster-Whisper (CUDA modeled)      | Groq Cloud Whisper API          |
| **Dubbing Provider**                  | ElevenLabs Dubbing API              | ElevenLabs Dubbing API          | VoiceStudio Local GPU (TTS modeled)      | ElevenLabs Dubbing API          |
| **Compute Cost (10 min)**             | **$0.1447 USD**                     | **$0.0448 USD**                 | **$0.0839 USD**                          | **$0.0713 USD**                 |
| **External API Cost (10 min)**        | **$1.5600 USD**                     | **$1.5185 USD**                 | **$0.0000 USD**                          | **$1.5185 USD**                 |
| **Total Incremental COGS (10 min)**   | **$1.7047 USD**                     | **$1.5633 USD**                 | **$0.0839 USD**                          | **$1.5898 USD**                 |
| **Cost per Processed Minute**         | **$0.1705 / min**                   | **$0.1563 / min**               | **$0.0084 / min**                        | **$0.1590 / min**               |
| **Dominant Cost Driver**              | ElevenLabs (88.0%)                  | ElevenLabs (95.9%)              | TalkNet Compute (53.1%)                  | ElevenLabs (94.3%)              |
| **Break-Even Retail Price**           | **$0.1705 / min**                   | **$0.1563 / min**               | **$0.0084 / min**                        | **$0.1590 / min**               |
| **Margin @ $0.25/min ($2.50 total)**  | **31.8%** (Profit: $0.80)           | **37.5%** (Profit: $0.94)       | **96.6%** (Profit: $2.42)                | **36.4%** (Profit: $0.91)       |
| **Margin @ $0.50/min ($5.00 total)**  | **65.9%** (Profit: $3.30)           | **68.7%** (Profit: $3.44)       | **98.3%** (Profit: $4.92)                | **68.2%** (Profit: $3.41)       |
| **Margin @ $1.00/min ($10.00 total)** | **82.9%** (Profit: $8.30)           | **84.4%** (Profit: $8.44)       | **99.2%** (Profit: $9.92)                | **84.1%** (Profit: $8.41)       |
| **Margin @ $2.50/min ($25.00 total)** | **93.2%** (Profit: $23.30)          | **93.7%** (Profit: $23.44)      | **99.7%** (Profit: $24.92)               | **93.6%** (Profit: $23.41)      |

---

## 3. Deployment Profiles & Architecture

### Profile 1: Standard SaaS Production (AWS On-Demand + OpenAI + ElevenLabs)

- **Architecture:** The production default (`process.env.DUBBING_PROVIDER = "elevenlabs"`). Compute runs on dedicated AWS EC2 `g4dn.xlarge` in Sydney (`ap-southeast-2`).
- **Characteristics:** Highest audio synthesis quality, maximum reliability, zero cold-starts, but highest operational cost due to third-party commercial API fees.
- **Compute Cost:** $0.01447 / media minute ($0.1447 / 10-min video).
- **API Cost:** $0.15600 / media minute ($1.5600 / 10-min video).
- **Total Incremental COGS:** **$0.1705 / media minute** ($1.7047 / 10-min video).

### Profile 2: Cost-Optimized Cloud (AWS Spot + Groq Whisper + ElevenLabs)

- **Architecture:** Hybrid cloud optimization. GPU compute runs on AWS Spot instances ($0.22/hr, ~69% discount). Transcription switches from OpenAI to Groq Cloud Whisper Large V3 ($0.00185/min, measured 23.2x real-time API execution). Dubbing remains on ElevenLabs.
- **Characteristics:** Achieves a 69% reduction in compute and 69% reduction in transcription costs with zero loss in dubbing voice timbre.
- **Compute Cost:** $0.00448 / media minute ($0.0448 / 10-min video).
- **API Cost:** $0.15185 / media minute ($1.5185 / 10-min video).
- **Total Incremental COGS:** **$0.1563 / media minute** ($1.5633 / 10-min video).

### Profile 3: Full Self-Hosted AI Pipeline (Modeled: AWS Spot + Faster-Whisper + VoiceStudio)

- **Architecture:** Sovereign open-source execution. Replaces commercial APIs with local GPU models on the EC2 worker: local Faster-Whisper for subtitles and local VoiceStudio (Omnivoice container) for speech dubbing.
- **Characteristics:** Eliminates third-party API dependencies and variable usage charges. Replaces SaaS fees with predictable GPU compute hours.
- **Compute Cost:** $0.00839 / media minute ($0.0839 / 10-min video).
- **API Cost:** **$0.0000 / media minute** ($0.0000 / 10-min video).
- **Total Incremental COGS:** **$0.0084 / media minute** ($0.0839 / 10-min video).
- **Cost Reduction:** **95.1% lower** than Profile 1.
- **Important Qualification:** Profile 3 is an illustrative engineering model based on published benchmarks (~15x RT for Faster-Whisper) and an assumed 1.0x RTF for VoiceStudio; physical dubbing inference telemetry was unmeasured in Task-00128.

### Profile 4: Serverless Container Pipeline (GCP Cloud Run T4 + Groq + ElevenLabs)

- **Architecture:** Serverless pay-per-second GPU execution on Google Cloud Run with an NVIDIA T4 ($0.35/hr, billed per 100ms). Ephemeral execution with zero idle baseline expense.
- **Cross-Cloud Modeled Provenance (Important Qualification):**
  - **Pricing Basis:** The compute hourly rate is the modeled GCP Cloud Run T4 rate of **$0.35/hour** ($0.0000972/sec, billed per 100ms increment).
  - **Runtime Source:** The stage real-time factors (TalkNet at 1.216x RTF / 729.6s for 10 min; AutoFlip at 0.0065x RTF / 3.9s for 10 min) are **reused directly from Task-00128's measured AWS Tesla T4 execution**.
  - **Classification:** These are **cross-cloud modeled estimates**, not direct GCP benchmark results. No live GCP Cloud Run container was deployed or measured in this benchmark.
  - **Hardware Divergence Caveat:** While both environments specify an NVIDIA Tesla T4 GPU, hardware similarity does **not** establish identical performance, memory bandwidth, virtualization overhead, container cold starts, or cloud billing increments.
- **Characteristics:** Ideal for intermittent or bursty job queues where running persistent EC2 instances would accrue idle waste.
- **Compute Cost:** $0.00713 / media minute ($0.0713 / 10-min video).
- **API Cost:** $0.15185 / media minute ($1.5185 / 10-min video).
- **Total Incremental COGS:** **$0.1590 / media minute** ($1.5898 / 10-min video).

---

## 4. Stage-by-Stage Cost Breakdown (10-Minute Video)

Detailed component breakdown across all four deployment profiles for a 10-minute (600 seconds) video:

### Profile 1: Standard SaaS Production ($1.7047 USD Total)

```
[Profile 1 — Total 10-Minute Incremental COGS: $1.7047 USD]
├── Reframe (AutoFlip C++):       $0.0008 USD ( 0.05%) ── 3.9s compute @ $0.7104/hr
├── Active Speaker (TalkNet):     $0.1440 USD ( 8.45%) ── 729.6s compute @ $0.7104/hr
├── Captions (OpenAI Whisper):    $0.0600 USD ( 3.52%) ── 10 min @ $0.0060/min
└── Dubbing (ElevenLabs):         $1.5000 USD (87.99%) ── 10 min @ $0.1500/min
```

### Profile 2: Cost-Optimized Cloud ($1.5633 USD Total)

```
[Profile 2 — Total 10-Minute Incremental COGS: $1.5633 USD]
├── Reframe (AutoFlip C++):       $0.0002 USD ( 0.02%) ── 3.9s compute @ $0.2200/hr
├── Active Speaker (TalkNet):     $0.0446 USD ( 2.85%) ── 729.6s compute @ $0.2200/hr
├── Captions (Groq Whisper):      $0.0185 USD ( 1.18%) ── 10 min @ $0.00185/min
└── Dubbing (ElevenLabs):         $1.5000 USD (95.95%) ── 10 min @ $0.1500/min
```

### Profile 3: Full Self-Hosted AI Pipeline ($0.0839 USD Total — Modeled)

```
[Profile 3 — Total 10-Minute Incremental COGS: $0.0839 USD (Modeled)]
├── Reframe (AutoFlip C++):       $0.0002 USD ( 0.29%) ── 3.9s compute @ $0.2200/hr
├── Active Speaker (TalkNet):     $0.0446 USD (53.13%) ── 729.6s compute @ $0.2200/hr
├── Captions (Faster-Whisper):    $0.0024 USD ( 2.91%) ── 40.0s compute @ $0.2200/hr (modeled estimate)
├── Dubbing (VoiceStudio GPU):    $0.0367 USD (43.68%) ── 600.0s compute @ $0.2200/hr (assumed 1.0x RTF)
└── External APIs:                $0.0000 USD ( 0.00%) ── Zero external API calls
```

### Profile 4: Serverless Container Pipeline ($1.5898 USD Total — Cross-Cloud Modeled)

```
[Profile 4 — Total 10-Minute Incremental COGS: $1.5898 USD (Cross-Cloud Modeled)]
├── Reframe (AutoFlip C++):       $0.0004 USD ( 0.02%) ── 3.9s compute @ $0.3500/hr (AWS runtime applied to GCP rate)
├── Active Speaker (TalkNet):     $0.0709 USD ( 4.46%) ── 729.6s compute @ $0.3500/hr (AWS runtime applied to GCP rate)
├── Captions (Groq Whisper):      $0.0185 USD ( 1.16%) ── 10 min @ $0.00185/min
└── Dubbing (ElevenLabs):         $1.5000 USD (94.35%) ── 10 min @ $0.1500/min
```

### Four-Profile Reconciliation Table

| Pipeline Stage           | Billing Basis / Runtime    | Profile 1: Standard SaaS | Profile 2: Spot Cloud | Profile 3: Self-Hosted (Modeled) | Profile 4: Serverless T4 (Modeled) |
| :----------------------- | :------------------------- | :----------------------- | :-------------------- | :------------------------------- | :--------------------------------- |
| **Reframe (AutoFlip)**   | 3.9s compute (0.0065x RT)  | $0.0008 (0.05%)          | $0.0002 (0.02%)       | $0.0002 (0.29%)                  | $0.0004 (0.02%)                    |
| **AVS (TalkNet)**        | 729.6s compute (1.216x RT) | $0.1440 (8.45%)          | $0.0446 (2.85%)       | $0.0446 (53.13%)                 | $0.0709 (4.46%)                    |
| **Captions (Whisper)**   | OpenAI / Groq / Local      | $0.0600 (3.52%)          | $0.0185 (1.18%)       | $0.0024 (2.91%)                  | $0.0185 (1.16%)                    |
| **Dubbing (TTS/Sync)**   | ElevenLabs / VoiceStudio   | $1.5000 (87.99%)         | $1.5000 (95.95%)      | $0.0367 (43.68%)                 | $1.5000 (94.35%)                   |
| **Total 10-Minute COGS** | **Sum of stages**          | **$1.7047** (100.0%)     | **$1.5633** (100.0%)  | **$0.0839** (100.0%)             | **$1.5898** (100.0%)               |
| **Cost / Processed Min** | Total / 10 minutes         | **$0.1705 / min**        | **$0.1563 / min**     | **$0.0084 / min**                | **$0.1590 / min**                  |

---

## 5. Commercial Margin Scenarios & Break-Even Analysis

All retail selling prices are illustrative commercial scenarios modeled across standard market tiers for AI video repurposing and dubbing platforms.

### Scenario Analysis (10-Minute Video, 600s)

| Selling Price Scenario        | Retail Price / Min | 10-Min Customer Price | Profile 1: SaaS Default (COGS: $1.705) | Profile 2: Spot Cloud (COGS: $1.563)   | Profile 3: Self-Hosted AI (COGS: $0.084) |
| :---------------------------- | :----------------- | :-------------------- | :------------------------------------- | :------------------------------------- | :--------------------------------------- |
| **Tier 1: High-Volume / API** | **$0.25 / min**    | $2.50                 | Profit: **$0.80** (Margin: **31.8%**)  | Profit: **$0.94** (Margin: **37.5%**)  | Profit: **$2.42** (Margin: **96.6%**)    |
| **Tier 2: Standard Creator**  | **$0.50 / min**    | $5.00                 | Profit: **$3.30** (Margin: **65.9%**)  | Profit: **$3.44** (Margin: **68.7%**)  | Profit: **$4.92** (Margin: **98.3%**)    |
| **Tier 3: Professional**      | **$1.00 / min**    | $10.00                | Profit: **$8.30** (Margin: **82.9%**)  | Profit: **$8.44** (Margin: **84.4%**)  | Profit: **$9.92** (Margin: **99.2%**)    |
| **Tier 4: Enterprise**        | **$2.50 / min**    | $25.00                | Profit: **$23.30** (Margin: **93.2%**) | Profit: **$23.44** (Margin: **93.7%**) | Profit: **$24.92** (Margin: **99.7%**)   |

### Break-Even Pricing Thresholds:

- **Profile 1 (Production SaaS):** Break-even is **$0.1705 / min** ($1.705 per 10-minute video). Any retail price below $0.1705/min generates negative gross profit.
- **Profile 2 (Spot Cloud):** Break-even is **$0.1563 / min** ($1.563 per 10-minute video).
- **Profile 3 (Self-Hosted AI):** Break-even is **$0.0084 / min** ($0.084 per 10-minute video). This enables aggressive pricing strategies or generous free tiers while maintaining healthy positive unit economics.

---

## 6. Shared Infrastructure, Concurrency & Storage Accounting

### 6.1 Persistent EBS Storage Accounting & AWS Resource Billing Status

- **Storage Asset:** 100 GB `gp3` root EBS volume attached to EC2 instance `i-02aa4578f3790bae1`.
- **Storage Rate:** $0.096 per GB-month (AWS Sydney `ap-southeast-2` published pricing).
- **Monthly Infrastructure Commitment:** 100 GB × $0.096/GB-mo = **$9.60 USD / month** (~**$0.315 USD / day** across an average 30.5-day billing cycle).
- **Accounting Rule:** This fixed monthly infrastructure overhead persists 24×7 regardless of whether the EC2 instance is running or stopped. It is **not an incremental per-job cost** and must not be automatically added to COGS.
- **Volume Amortization Model (Separately Allocated Overhead):**
  - At **1,000 processed minutes/month**: $9.60 / 1,000 min = **+$0.0096 per media minute** (adds $0.096 to a 10-minute job).
  - At **10,000 processed minutes/month**: $9.60 / 10,000 min = **+$0.00096 per media minute** (adds $0.0096 to a 10-minute job).
  - At **50,000 processed minutes/month**: $9.60 / 50,000 min = **+$0.000192 per media minute** (adds $0.00192 to a 10-minute job).
- **EC2 Instance Billing Status Clarification:**
  - The target EC2 benchmark instance (`i-02aa4578f3790bae1`) was confirmed in the **stopped** state (`Code 80`).
  - **Compute charges ceased:** Active hourly compute billing ($0.7104/hr On-Demand or $0.22/hr Spot) ceased immediately upon instance shutdown.
  - **Persistent storage charges continue:** The 100 GB `gp3` volume ($9.60/month, ~$0.315/day) continues to accrue charges while the volume remains provisioned in the AWS account.
  - **Networking and IPv4 considerations:** Public IPv4 charges may also apply depending on VPC allocation and configuration (e.g. idle unattached Elastic IPs or in-use public IPv4 at $0.005/hr).
  - **Summary:** Stopping an EC2 instance eliminates active compute runtime billing, but does **not** stop storage or reserved networking charges; persistent infrastructure charges remain active until volumes and IP allocations are explicitly released or terminated.

### 6.2 GPU Concurrency & Allocation Modeling

- **Physical VRAM Footprint:** In Task-00128 live telemetry, TalkNet consumed **435 MiB peak VRAM** out of 15,360 MiB total GDDR6 memory (2.8% VRAM load). Over 14.9 GB of VRAM remained unutilized.
- **Concurrency Mechanism (Cost Allocation vs. Wall-Clock Duration):**
  - Concurrency does **not** automatically reduce an individual job's execution time by 3x. Rather, multiple simultaneous jobs share the instance's billed compute time.
  - The potential saving is an **accounting reduction in allocated infrastructure cost per job**, assuming sufficient queue throughput and minimal GPU kernel/memory bus contention.
  - Actual multi-job throughput, queue wait times, VRAM contention, CUDA stream scheduling, and end-to-end latency must be empirically measured before claiming a verified operational saving.
- **Hypothetical Capacity Scenario (3x Concurrency Allocation Model):**
  - Under a theoretical 3x concurrency model where three jobs share an instance without performance degradation, each job's allocated compute cost is divided by 3.
  - In Profile 1, allocated compute drops from $0.1440 to **$0.0480**, shifting total 10-minute job cost from $1.705 to **$1.608 USD** ($0.1608/min).
  - **Critical Constraint:** Concurrency reduces _allocated compute_ infrastructure costs, but has **zero impact on external API costs** (ElevenLabs still bills $0.15/min per job). Consequently, multi-stream concurrency yields maximal economic advantage under **Profile 3 (Self-Hosted AI)**, where it could theoretically reduce 10-minute COGS from $0.084 to **$0.028 USD**.
  - This 3x scenario remains strictly a **hypothetical capacity and cost-allocation model**, not measured production performance.

---

## 7. Pricing Provenance & Data Classification

To maintain analytical integrity, every rate, duration, and assumption is categorized by its verification status:

| Data Point                          | Value Used              | Source & Date                                                              | Verification Classification                               |
| :---------------------------------- | :---------------------- | :------------------------------------------------------------------------- | :-------------------------------------------------------- |
| **AWS EC2 `g4dn.xlarge` On-Demand** | $0.7104 / hr            | AWS Pricing API (Sydney `ap-southeast-2`), Q3 2026                         | **Provider-Published & Audited Actual**                   |
| **AWS EC2 `g4dn.xlarge` Spot**      | $0.2200 / hr            | AWS EC2 Spot average reference in `costCalculator.ts`                      | **Modelled Reference Baseline**                           |
| **GCP Cloud Run GPU (T4)**          | $0.3500 / hr            | Google Cloud Run pricing applied to Task-00128 AWS T4 stage runtimes       | **Cross-Cloud Modelled Estimate (No Live GCP Execution)** |
| **AWS EBS gp3 Root Volume**         | $0.0960 / GB-mo         | AWS Sydney published pricing ($9.60/mo for 100GB)                          | **Provider-Published Baseline**                           |
| **TalkNet CUDA Real-Time Factor**   | **1.216x** (0.82x RT)   | Task-00128 live Tesla T4 execution (9.778s on 8.04s media, 77 samples)     | **Measured Physical Telemetry**                           |
| **AutoFlip MediaPipe RTF**          | **0.0065x** (153.8x RT) | Task-00128 live EC2 execution (0.052s on 8.0s media, 192 frames)           | **Measured Native Execution (GPU Unverified)**            |
| **OpenAI Whisper API Rate**         | $0.0060 / min           | OpenAI official public audio API pricing                                   | **Provider-Published Default**                            |
| **Groq Whisper Large V3 Rate**      | $0.00185 / min          | Groq Cloud published pricing ($0.111/hr audio); 1.296s on 30.06s media     | **Provider-Published & Measured Actual**                  |
| **ElevenLabs Dubbing API Rate**     | $0.1500 / min           | ElevenLabs creator tier published pricing; `costCalculator.ts`             | **Provider-Published Default**                            |
| **Faster-Whisper CUDA Runtime**     | **0.0667x** (~15x RT)   | Standard Faster-Whisper T4 FP16 published benchmark (~40s per 10 min)      | **Modelled Estimate (Unmeasured in Task-128)**            |
| **VoiceStudio GPU Dubbing RTF**     | **1.0000x** (1:1 RT)    | Illustrative engineering assumption for self-hosted TTS (~600s per 10 min) | **Unexecuted Assumption**                                 |
| **3x Concurrency Capacity Model**   | 3 simultaneous jobs     | Colab T4 benchmark (`docs/GPU_COST_CONCURRENCY.md`)                        | **Hypothetical Capacity Allocation Model**                |

---

## 8. Limitations & Missing Benchmarks

1. **VoiceStudio Dubbing Telemetry is Unmeasured:**
   - In Task-00128, VoiceStudio container health and CUDA device visibility were confirmed, but no actual speech synthesis inference was executed.
   - The 1.0x RTF (~600 seconds for 10 minutes of media) assumed in Profile 3 is an illustrative model. True VoiceStudio GPU compute duration and VRAM load on 10-minute speech remain pending a live inference benchmark.
2. **TalkNet Multi-Speaker Scaling Curves:**
   - The 1.216x RTF was measured on an 8.04s single-speaker clip. Real-world videos with 2+ simultaneous faces will increase S3FD face-detection and LSTM tracking overhead.
3. **Faster-Whisper Local Execution:**
   - The ~15x real-time factor (~40 seconds per 10-minute video) is a published industry reference for T4 FP16, not a locally measured benchmark within the Marvedge container harness.
4. **I/O Scaling on Full 10-Minute Videos:**
   - AutoFlip's 153.8x real-time speed was measured on 192 frames. Video decoding and memory bandwidth overhead over a full 10-minute (14,400 frames) file may moderate throughput.
5. **GCP Cloud Run T4 Telemetry is a Cross-Cloud Model:**
   - Profile 4 applies modeled GCP Cloud Run pricing ($0.35/hr) to runtimes measured on an AWS EC2 `g4dn.xlarge` instance.
   - No live container was run on GCP Cloud Run. Differences in container hypervisors (gVisor sandbox vs. AWS Nitro), cold-start latency, CPU thread allocation, memory bandwidth, and throttling on GCP were not measured.

---

## 9. Strategic Cost Optimization Recommendations

1. **Immediate Term: Switch Transcription to Groq Cloud API**
   - Switching from OpenAI Whisper ($0.0060/min) to Groq Whisper Large V3 ($0.00185/min) saves **69.2%** on transcription. In Task-00128, a 30.06-second audio excerpt was processed by Groq in **1.296 seconds** (a ~23.2x real-time factor for the API call itself, excluding network transit and client-side setup).
2. **Medium Term: Transition Production Dubbing from ElevenLabs to VoiceStudio**
   - ElevenLabs accounts for **88% to 96% of the entire pipeline cost**.
   - Developing and operationalizing self-hosted VoiceStudio speech dubbing on GPU instances reduces modeled per-job COGS from **$1.705 down to $0.084** — a **95% reduction in variable operating costs**.
3. **Infrastructure: Adopt AWS Spot Fleet with Serverless Fallback**
   - Running GPU workers on AWS Spot ($0.22/hr) saves **69%** on compute relative to On-Demand ($0.7104/hr). For burst queues, falling back to GCP Cloud Run T4 ($0.35/hr) eliminates idle overhead.
4. **Concurrency Exploitation (When Empirically Validated):**
   - Because TalkNet requires only ~435 MiB VRAM on a 16 GB GPU, multi-job queuing could amortize instance hourly costs across simultaneous video streams once contention and scheduling overhead are empirically verified.
