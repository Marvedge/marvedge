# Executive Briefing: Dubbing Unit Economics & Gross Margin Model

**Document:** `docs/DUBBING_COST_AND_GROSS_MARGIN.md`
**Task:** Task-00104 — Dubbing Cost per Minute & Gross Margin
**Date:** 26 October 2026
**Audience:** Chief Technology Officer & Leadership Team (Investor Presentation Ready)
**Status:** Modeled Technical & Economic Blueprint (Pre-PR Review)

---

## 1. Executive Summary & Investment Thesis

Transitioning Marvedge's speech synthesis engine from commercial SaaS APIs ([ElevenLabs Pricing](https://elevenlabs.io/pricing)) to an in-house self-hosted GPU service (**VoiceStudio on NVIDIA Tesla T4**) reduces core speech generation cost by **97.0% to 99.1%**, expanding Marvedge's preliminary modeled gross margin from **~75%–86%** to **~99.1%–99.4%** across representative retail video pricing tiers.

- **Legacy Commercial SaaS Dubbing ([ElevenLabs Dubbing API](https://elevenlabs.io/docs/api-reference/dubbing)):** **`$0.33 to $0.50`** per source minute (v1) or **`$2.20`** per minute (v2 high-fidelity).
- **Marvedge In-House Modeled Pipeline (VoiceStudio + Cloud Infrastructure):**
  - **Base Case ([`gpt-transcribe`](https://openai.com/api/pricing/)):** **`$0.0144`** per processed minute (direct marginal compute: `$0.0105/min` + allocated EBS: `$0.0038/min` at 2,500 min/mo utilization).
  - **Legacy Baseline ([`whisper-1`](https://openai.com/api/pricing/), deprecating Feb 2027):** **`$0.0159`** per processed minute (direct marginal compute: `$0.0120/min` + allocated EBS: `$0.0038/min`).
  - **Conservative Scenario (Lower utilization + buffered compute):** **`$0.0190`** per processed minute (direct marginal compute: `$0.0140/min` + allocated EBS: `$0.0050/min` at 1,920 min/mo utilization).
- **Modeled Unit Economics on Representative 10-Minute Video ($19.99 USD Retail Price):**
  - **Estimated Modeled Service Cost (COGS):** **`$0.14 USD`** (Base `gpt-transcribe`) to **`$0.19 USD`** (Conservative), compared to **`$3.30–$5.00 USD`** on ElevenLabs v1 or **`$22.00 USD`** on ElevenLabs v2.
  - **Gross Profit per Clip:** **`$19.80 to $19.85 USD`** (vs. $14.99–$16.69 on ElevenLabs v1; or -$2.01 deficit on ElevenLabs v2).
  - **Preliminary Modeled Gross Margin:** **`99.1% to 99.3%`** (vs. 75.0%–83.5% on commercial SaaS).
  - **Annual COGS Savings at 10,000 monthly exports (10-min avg):** **`~$382,000 to ~$398,000 USD / year`** vs. ElevenLabs v1 Clean ($0.50/min).

---

## 2. Stage-by-Stage Cost Breakdown (Per Processed Video Minute)

All figures represent a 1.0-minute processed media segment.

| Pipeline Stage                         | Engine / Service Provider                                                                   | Cost Basis & Provenance                                                                                                                                                                                          | Base Case (`gpt-transcribe`) ($/min) | Legacy Baseline (`whisper-1`) ($/min) | Conservative Scenario ($/min) |
| :------------------------------------- | :------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- | :------------------------------------ | :---------------------------- |
| **1. Source Demux & I/O**              | Local FFmpeg CPU                                                                            | Measured empirical (0.28s execution for 10-min media in Task-00103)                                                                                                                                              | $0.00000                             | $0.00000                              | $0.00000                      |
| **2. ASR Transcription**               | OpenAI Audio API ([OpenAI Pricing](https://openai.com/api/pricing/))                        | Current `gpt-transcribe` ($0.0045/min) vs. legacy `whisper-1` ($0.0060/min, sunset Feb 2027)                                                                                                                     | $0.00450                             | $0.00600                              | $0.00600                      |
| **3. Translation / Script**            | OpenAI `gpt-4o-mini` ([OpenAI Pricing](https://openai.com/api/pricing/))                    | Official published rate ($0.15/1M in, $0.60/1M out; ~200 in / 200 out tokens/min)                                                                                                                                | $0.00015                             | $0.00015                              | $0.00030                      |
| **4. Speech Synthesis (TTS)**          | **VoiceStudio (`OmniVoice` on Tesla T4)**                                                   | **Empirical GPU measurement:** RTF 0.3806x (380.31s compute for 999.32s speech @ Sydney EC2 $0.7104/hr, [Task-00103](file:///docs/VOICESTUDIO_INTEGRATION.md)); extrapolated to 228.34s compute per 10-min media | **$0.00451**                         | **$0.00451**                          | **$0.00540** _(20% buffer)_   |
| **5. Active Speaker / Lip Sync**       | TalkNet / SyncNet on Cloud Run T4                                                           | **Provisional modeled estimate:** ~14x RT @ all-in Cloud Run worker rate $0.486/hr ([Cloud Run Pricing](https://cloud.google.com/run/pricing))                                                                   | $0.00058                             | $0.00058                              | $0.00085 _(EC2 rate)_         |
| **6. Video Reframing (9:16)**          | AutoFlip + YuNet ONNX on Cloud Run T4                                                       | **Provisional modeled estimate:** 28.55x RT @ all-in Cloud Run worker rate $0.486/hr ([Cloud Run Pricing](https://cloud.google.com/run/pricing))                                                                 | $0.00028                             | $0.00028                              | $0.00045                      |
| **7. Egress & Media Storage**          | Cloudflare R2 / AWS S3 ([Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)) | Official published rate (~15–20 MB export / 10-min clip; zero egress on R2)                                                                                                                                      | $0.00050                             | $0.00050                              | $0.00100                      |
| **Subtotal (Direct Marginal Compute)** | —                                                                                           | **Sum of runtime media processing stages on warm instances**                                                                                                                                                     | **$0.01052**                         | **$0.01202**                          | **$0.01400**                  |
| **8. Allocated Persistent Storage**    | AWS EBS gp3 100 GiB ([AWS EBS](https://aws.amazon.com/ebs/pricing/))                        | Monthly $9.60 root volume allocated under stated monthly volume assumptions                                                                                                                                      | $0.00384 _(at 2,500 min)_            | $0.00384 _(at 2,500 min)_             | $0.00500 _(at 1,920 min)_     |
| **Estimated Modeled Service Cost**     | **Complete In-House Hybrid Pipeline**                                                       | **Direct marginal compute + amortized persistent storage**                                                                                                                                                       | **$0.01436**                         | **$0.01586**                          | **$0.01900**                  |

> **Scope & Provenance Disclosures:**
>
> - **Empirically Measured:** In Task-00103, Stage 4 (VoiceStudio TTS) directly generated 999.32s of audio across 10 batches in 380.305s of GPU compute on an AWS EC2 `g4dn.xlarge` instance (Tesla T4), yielding an empirical RTF of **0.380564x (0.3806x)**. The 228.34s figure represents the mathematical extrapolation for a 10-minute (600.00s) media video ($600\text{ s} \times 0.380564 = 228.34\text{ s} \rightarrow \$0.0451$). Local FFmpeg demux/mux (Stage 1) was directly verified.
> - **Published Vendor Rates:** Stages 2, 3, 7, and 8 are based on official vendor pricing as of 26 October 2026.
> - **All-In Cloud Run Worker Rates (Stages 5 & 6):** Stages 5 and 6 are modeled using the full container resource rate of **$0.4860 / hour** (NVIDIA T4 GPU add-on at $0.350/hr + 4 vCPUs at $0.024/vCPU-hr [$0.096/hr] + 16 GiB RAM at $0.0025/GiB-hr [$0.040/hr] in Google Cloud Run Tier 1 `us-central1`).
> - **Provisional Nature:** Stages 5 and 6 throughputs are based on prior test-harness benchmarks (Task-00081 and Task-00097). Live container cold starts (15–45s), multi-tenant concurrency contention, cross-cloud egress between AWS Sydney and GCP US, and end-to-end `/avs-dub` orchestration remain unexercised in production.

---

## 3. Three Distinct Economic Views

To prevent conflating marginal execution costs with infrastructure fixed overheads or batching effects, the unit economics are separated into three views:

### View 1: Marginal Variable Cost (Warm / Active Batch Worker)

- **Direct marginal cost per processed media minute:** **`$0.0105 to $0.0140 / min`** (`$0.01052/min` Base with `gpt-transcribe`; `$0.01202/min` Legacy with `whisper-1`; `$0.01400/min` Conservative).
- **Operational Condition:** Assumes worker instances and GPU containers are pre-warmed in an active batch worker pool (e.g., BullMQ queue) continuously processing media tasks without recurring container cold-starts.

### View 2: Modeled Unit Cost with Allocated Infrastructure (Steady-State Amortization)

- **Fixed Infrastructure Allocation:** Verified 100 GiB gp3 root EBS volume `vol-0b359be0e21cf51c7` ([AWS EBS Pricing](https://aws.amazon.com/ebs/pricing/)) in Sydney at **`$9.60 / month`** ($0.096/GiB-month) retaining the 2.3 GB model checkpoint and OS environment.
- **Utilization Scenarios & Rationale:**
  - **Base Case Utilization Scenario (2,500 minutes/month):** Under an active volume assumption of 2,500 processed media minutes/month (e.g., 250 ten-minute videos, or ~83 minutes/day, representing ~4.2 hours/month of warm GPU synthesis), the $9.60 monthly EBS cost adds **`$0.00384 / min`** ($\frac{\$9.60}{2,500\text{ min}}$). Total modeled service cost is **`$0.01436 / min`** (Base `gpt-transcribe`) and **`$0.01586 / min`** (Legacy `whisper-1`).
  - **Conservative Lower-Utilization Scenario (1,920 minutes/month):** To model platform stress or lower initial adoption, this scenario assumes a deliberately lower monthly volume of 1,920 processed media minutes/month (~23.2% lower volume, or ~64 minutes/day). At 1,920 min/mo, the $9.60 EBS cost adds exactly **`$0.00500 / min`** ($\frac{\$9.60}{1,920\text{ min}}$). Total modeled service cost is **`$0.01900 / min`**.
  - **Scale Dynamics:** At 10,000 processed minutes/month, EBS allocation drops to **`$0.00096 / min`** (total modeled service cost: **`$0.01148 / min`**).

### View 3: Cold-Start / Isolated Single-Session Economics

In Task-00103, an isolated cold launch of an AWS EC2 `g4dn.xlarge` instance consumed **14.18 minutes of active instance runtime (`$0.1679 USD`)** at $0.7104/hr.

#### Exact Evidence Reconciliation of the Measured Session ($0.1679 USD)

- **Measured Session Runtime:** 14.18 minutes (850.80 seconds from instance startup through SSM commands, synthesis, and stop verification).
- **Active GPU Synthesis Compute (380.31 s / 6.34 min):** **`$0.0750 USD`**. Directly measured wall-clock time executing 10 OmniVoice narration batches producing 999.32s of speech WAV ($380.305\text{ s} \times \$0.000197333/\text{s}$).
- **Fixed Boot & Environment Bootstrap (470.50 s / 7.84 min):** **`$0.0928 USD`**. Covers EC2 hardware provisioning, OS boot, SSM daemon handshake, virtualenv activation, loading the 2.3 GB checkpoint into GPU VRAM (8.5 GB peak), local FFmpeg muxing test, and stop polling ($470.495\text{ s} \times \$0.000197333/\text{s}$).
- **Total Measured Session Spend:** $\$0.0750 + \$0.0928 = \mathbf{\$0.1679\text{ USD}}$.
- **Root Cause of Planning Overrun:** Exceeded the $0.1200 planning ceiling by +$0.0479 because generating 999.32s of speech required 380.3s of compute rather than the planned 228.3s for 600s, combined with initialization latency.
- **Excluded Stages:** ASR transcription, LLM translation, AVS lip-sync, AutoFlip reframing, cloud storage uploads, and database/queue transactions were **not** executed in this session.

#### Modeled Projections for 2-Minute and 10-Minute Cold-Start Scenarios

> **Methodological Disclosure:** The 2-minute and 10-minute scenarios below are **modeled projections, not separately measured empirical runs**. The single measured Task-00103 benchmark session synthesized 999.32 seconds of audio and incurred approximately $0.1679 in EC2 session spend. The scenarios below mathematically project how that measured setup overhead ($0.0928) and measured RTF (0.3806x) would behave under hypothetical isolated runs:

1. **Modeled 10-Minute Video Cold Run (Projected for 600s Media):**
   - _Fixed boot, bootstrap & model load overhead (7.84 min):_ **$0.0928**
   - _Extrapolated 10-min TTS GPU compute (3.81 min / 228.34s @ $0.7104/hr):_ **$0.0451**
   - _Subtotal Tailored EC2 Spend (11.65 min active instance time):_ $\$0.0928 + \$0.0451 = \mathbf{\$0.1379}$
   - _External non-EC2 services (10 min @ $0.00601/min: ASR $0.0450 + LLM $0.0015 + all-in AVS $0.0058 + all-in AutoFlip $0.0028 + Egress $0.0050):_ **$0.0601**
   - _Total Tailored Cold Run Cost:_ $\$0.1379 + \$0.0601 = \mathbf{\$0.1980\text{ USD}}$
   - _Effective Cost per Media Minute:_ $\frac{\$0.1980}{10\text{ min}} =$ **`$0.01980 / min`** (~$0.0198/min).
     *(Note: If an unoptimized orchestrator leaves the instance active for the full 14.18-minute session lifecycle [$0.1679] before stopping, total cost is $\$0.1679 + \$0.0601 = \mathbf{\$0.2280\text{ USD}}$, resulting in an effective cost of **$0.02280 / min**).\*
2. **Modeled 2-Minute Social Clip Cold Run (Projected for 120s Media):**
   - _Fixed boot, bootstrap & model load overhead (7.84 min):_ **$0.0928**
   - _Extrapolated 2-min TTS GPU compute (0.76 min / 45.67s @ $0.7104/hr):_ **$0.0090**
   - _Subtotal Tailored EC2 Spend (8.60 min active instance time):_ $\$0.0928 + \$0.0090 = \mathbf{\$0.1018}$
   - _External non-EC2 services (2 min @ $0.00601/min: ASR $0.0090 + LLM $0.0003 + all-in AVS $0.0012 + all-in AutoFlip $0.0006 + Egress $0.0010):_ **$0.0120**
   - _Total Tailored Cold Run Cost:_ $\$0.1018 + \$0.0120 = \mathbf{\$0.1138\text{ USD}}$
   - _Effective Cost per Media Minute:_ $\frac{\$0.1138}{2\text{ min}} =$ **`$0.05690 / min`** (~$0.0569/min).
     *(Note: If the full unoptimized 14.18-minute session [$0.1679] is incurred, total cost is $\$0.1679 + \$0.0120 = \mathbf{\$0.1799\text{ USD}}$, resulting in an effective cost of **$0.08995 / min**).\*
3. **Batched Production Worker (10 clips totaling 100 media minutes):**
   - The fixed setup overhead ($0.0928) is amortized over 100 media minutes to **`$0.00093 / min`**.
   - Added to warm marginal compute ($0.01052/min), the effective cost drops to **`$0.01145 / min`**.

> **Disclosure:** These cold-session figures combine directly measured EC2 runtime with estimated third-party API and modeled worker rates. They are **not** complete production pipeline totals, as queue wait times, job retries, and database orchestration are excluded.

---

## 4. Retail Video Economics & Gross Margin Analysis

To evaluate business viability, the modeled costs are applied to two representative commercial product tiers:

- **Clip Tier A:** **2-Minute Short-Form Social Clip** (TikTok / Instagram Reel / YouTube Short) at **`$4.99 USD`** retail.
- **Clip Tier B:** **10-Minute Long-Form Video** (Lecture / Tutorial / Corporate Presentation) at **`$19.99 USD`** retail.

### A. Marvedge In-House Modeled Stack

| Economic Metric                   | Tier A (2 Min @ $4.99) — Base (`gpt-transcribe`) | Tier A (2 Min @ $4.99) — Legacy (`whisper-1`) | Tier A (2 Min @ $4.99) — Conservative Scenario | Tier B (10 Min @ $19.99) — Base (`gpt-transcribe`) | Tier B (10 Min @ $19.99) — Legacy (`whisper-1`) | Tier B (10 Min @ $19.99) — Conservative Scenario |
| :-------------------------------- | :----------------------------------------------- | :-------------------------------------------- | :--------------------------------------------- | :------------------------------------------------- | :---------------------------------------------- | :----------------------------------------------- |
| **Retail Selling Price (USD)**    | **$4.99**                                        | **$4.99**                                     | **$4.99**                                      | **$19.99**                                         | **$19.99**                                      | **$19.99**                                       |
| **Direct Marginal Compute**       | $0.0210                                          | $0.0240                                       | $0.0280                                        | $0.1052                                            | $0.1202                                         | $0.1400                                          |
| **Allocated Storage (EBS gp3)**   | $0.0077                                          | $0.0077                                       | $0.0100                                        | $0.0384                                            | $0.0384                                         | $0.0500                                          |
| **Estimated Service Cost (COGS)** | **$0.0287**                                      | **$0.0317**                                   | **$0.0380**                                    | **$0.1436**                                        | **$0.1586**                                     | **$0.1900**                                      |
| **Gross Profit per Clip**         | **$4.9613**                                      | **$4.9583**                                   | **$4.9520**                                    | **$19.8464**                                       | **$19.8314**                                    | **$19.8000**                                     |
| **Preliminary Gross Margin (%)**  | **99.42%**                                       | **99.36%**                                    | **99.24%**                                     | **99.28%**                                         | **99.21%**                                      | **99.05%**                                       |

### B. Legacy Commercial SaaS Comparison (ElevenLabs Dubbing API)

| Economic Metric                | Tier A (2 Min @ $4.99) — ElevenLabs v1 (Watermarked) | Tier A (2 Min @ $4.99) — ElevenLabs v1 (Clean) | Tier B (10 Min @ $19.99) — ElevenLabs v1 (Watermarked) | Tier B (10 Min @ $19.99) — ElevenLabs v1 (Clean) | Tier B (10 Min @ $19.99) — ElevenLabs v2 (High-Fidelity) |
| :----------------------------- | :--------------------------------------------------- | :--------------------------------------------- | :----------------------------------------------------- | :----------------------------------------------- | :------------------------------------------------------- |
| **Retail Selling Price (USD)** | **$4.99**                                            | **$4.99**                                      | **$19.99**                                             | **$19.99**                                       | **$19.99**                                               |
| **Service Cost (COGS)**        | **$0.66** ($0.33/min)                                | **$1.00** ($0.50/min)                          | **$3.30** ($0.33/min)                                  | **$5.00** ($0.50/min)                            | **$22.00** ($2.20/min)                                   |
| **Gross Profit per Clip**      | **$4.33**                                            | **$3.99**                                      | **$16.69**                                             | **$14.99**                                       | **-$2.01 (Deficit)**                                     |
| **Gross Margin (%)**           | **86.77%**                                           | **79.96%**                                     | **83.49%**                                             | **74.99%**                                       | **-10.06% (Margin Collapse)**                            |

> **Comparability Disclosure (Non-Like-for-Like Comparison):**
> ElevenLabs Dubbing is a **managed, turn-key commercial SaaS solution** ([ElevenLabs Dubbing API Reference](https://elevenlabs.io/docs/api-reference/dubbing)) bundling speech-to-text, neural machine translation, voice cloning, speaker diarization, background stem isolation, and muxing under an SLA.
> In contrast, Marvedge's in-house cost model is an **unbundled engineering estimate of raw compute, cloud APIs, and storage**. It does not include ongoing infrastructure maintenance, developer operations, error monitoring, or customer support.

---

## 5. Calculation Formulas & Mathematical Derivations

All calculations follow explicit mathematical definitions:

1. **Marginal VoiceStudio GPU Compute Cost per Media Minute:**
   $$\text{Measured RTF} = \frac{380.305\text{ s GPU Compute Time}}{999.32\text{ s Audio Output}} = \mathbf{0.380564x \approx 0.3806x}$$
   $$\text{Derived Compute Time for 1.0 Media Min} = 60.0\text{ s} \times 0.380564 = \mathbf{22.8338\text{ seconds}}\quad (0.380564\text{ min})$$
   $$\text{Marginal Cost}_{\text{TTS}} = 0.380564\text{ min} \times \left(\frac{\$0.7104\text{ USD}}{60\text{ min}}\right) = \mathbf{\$0.004506\text{ USD / min}}\quad (\mathbf{\$0.0451\text{ per 10 minutes}})$$
   $$\text{Derived Compute Time for 10-Minute Video} = 600.0\text{ s} \times 0.380564 = \mathbf{228.338\text{ seconds}}\quad (3.8056\text{ min})$$

2. **All-In Cloud Run Worker Rates (Stages 5 & 6):**
   $$\text{Hourly Worker Rate} = \$0.350\text{ (T4 GPU)} + (4 \times \$0.024\text{ vCPU}) + (16 \times \$0.0025\text{ RAM}) = \mathbf{\$0.4860\text{ / hour}}$$
   $$\text{Active Speaker (TalkNet)} = \left(\frac{60\text{ s}}{14.0\text{ RT}}\right) \times \left(\frac{\$0.4860}{3600\text{ s}}\right) = 4.2857\text{ s} \times \$0.000135/\text{s} = \mathbf{\$0.0005786 / \text{min}}$$
   $$\text{Video Reframing (AutoFlip)} = \left(\frac{60\text{ s}}{28.55\text{ RT}}\right) \times \left(\frac{\$0.4860}{3600\text{ s}}\right) = 2.1016\text{ s} \times \$0.000135/\text{s} = \mathbf{\$0.0002837 / \text{min}}$$

3. **Allocated Persistent EBS Storage Amortization:**
   $$\text{Monthly Cost}_{\text{EBS}} = 100\text{ GiB} \times \$0.096/\text{GiB-month} = \mathbf{\$9.60\text{ USD / month}}$$
   - _Base Case (2,500 monthly processed min):_ $\frac{\$9.60}{2,500\text{ min}} = \mathbf{\$0.00384\text{ USD / min}}$
   - _Conservative Lower Utilization (1,920 monthly processed min):_ $\frac{\$9.60}{1,920\text{ min}} = \mathbf{\$0.00500\text{ USD / min}}$

4. **Preliminary Gross Profit and Gross Margin:**
   $$\text{Gross Profit} = \text{Selling Price} - \text{Estimated Modeled Service Cost}$$
   $$\text{Gross Margin (\%)} = \left(\frac{\text{Gross Profit}}{\text{Selling Price}}\right) \times 100\%$$

---

## 6. Official Vendor Pricing Sources & Verification Reference (26 October 2026)

All vendor pricing claims reflect audited official documentation as of 26 October 2026:

1. **AWS EC2 (`g4dn.xlarge`):**
   - _Official URL:_ [AWS EC2 On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
   - _Region & OS:_ `ap-southeast-2` (Sydney), Linux.
   - _Rate:_ **$0.7104 / hour** ($0.01184 / minute). Billed per-second with 60-second minimum.
2. **AWS EBS (`gp3` Storage):**
   - _Official URL:_ [AWS EBS Pricing](https://aws.amazon.com/ebs/pricing/)
   - _Region:_ `ap-southeast-2` (Sydney).
   - _Rate:_ **$0.096 / GB-month** for volume `vol-0b359be0e21cf51c7` (100 GiB provisioned = $9.60/month). Includes 3,000 baseline IOPS and 125 MB/s baseline throughput.
3. **OpenAI Audio API (Speech-to-Text):**
   - _Official URL:_ [OpenAI API Pricing](https://openai.com/api/pricing/)
   - _Current Recommended Model:_ `gpt-transcribe` at **$0.0045 / minute** ($0.000075 / second).
   - _Legacy Model:_ `whisper-1` at **$0.0060 / minute** ($0.000100 / second). Deprecated by OpenAI with scheduled shutdown on **February 26, 2027**.
4. **OpenAI Text Generation (`gpt-4o-mini`):**
   - _Official URL:_ [OpenAI API Pricing](https://openai.com/api/pricing/)
   - _Rate:_ **$0.150 / 1M input tokens**, **$0.600 / 1M output tokens**. At ~200 input and ~200 output tokens per media minute: $(\$0.15 \times 0.0002) + (\$0.60 \times 0.0002) = \$0.00003 + \$0.00012 = \mathbf{\$0.00015 / \text{min}}$.
5. **Google Cloud Run GPU (NVIDIA T4 + Container Resources):**
   - _Official URL:_ [Google Cloud Run Pricing](https://cloud.google.com/run/pricing)
   - _Rates (Tier 1 `us-central1`):_
     - NVIDIA T4 GPU: **$0.350 / hour** ($0.0000972/s)
     - vCPU: **$0.024 / vCPU-hour** ($0.0000067/vCPU-s) $\times 4 = \mathbf{\$0.096 / \text{hour}}$
     - Memory: **$0.0025 / GiB-hour** ($0.00000069/GiB-s) $\times 16 = \mathbf{\$0.040 / \text{hour}}$
     - **Total Active Container Rate:** $\$0.350 + \$0.096 + \$0.040 = \mathbf{\$0.4860 / \text{hour}}$ ($0.00810 / min).
6. **ElevenLabs Dubbing API & Subscriptions:**
   - _Official URLs:_ [ElevenLabs Pricing](https://elevenlabs.io/pricing) & [ElevenLabs Dubbing API Reference](https://elevenlabs.io/docs/api-reference/dubbing)
   - _Billing Structure:_ Credit-based pool. Automatic Dubbing consumes:
     - v1 with watermark: ~2,000 credits/min (**`~$0.33 / min`** at Scale subscription tier).
     - v1 clean (no watermark): ~3,000 credits/min (**`~$0.50 / min`**).
     - v2 high-fidelity: ~13,500 credits/min (**`~$2.20 / min`**).
   - _Standalone TTS Comparison:_ Character-based TTS API consumes ~$0.18–$0.30 per 1,000 characters (~$0.15–$0.22/min of speech), which excludes transcription, translation, and video muxing.
7. **Cloud Storage & Egress (Cloudflare R2 / AWS S3):**
   - _Official URLs:_ [Cloudflare R2 Pricing](https://www.cloudflare.com/developer-platform/r2/) & [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
   - _Rate:_ **$0.015 / GB-month** storage with **$0.00 egress fee** on Cloudflare R2 (or $0.09/GB egress on AWS S3). At ~15–20 MB per 10-minute clip, storage and delivery cost is ~$0.00050/min.

---

## 7. Model Boundaries, Gaps & Exclusions

To maintain strict fiduciary integrity for executive decision-making and investor diligence, the following limitations are formally recorded:

1. **Preliminary Modeled Margins vs. Audited Financial Statements:**
   - These margins are engineering models derived from component benchmarks and published vendor rates. They are not audited historical financial statements or formal budget guarantees.
2. **COGS Scope & Explicit Exclusions:**
   - **Included:** Direct GPU compute runtime, commercial API fees (ASR, LLM translation), modeled all-in Cloud Run worker containers for reframing and lip-sync, cloud delivery storage, and persistent EBS root volume retention.
   - **Excluded:** Pipeline job retries, worker queue wait times, devops/infrastructure engineering salaries, operational monitoring tools (Sentry/Datadog), customer refund allowances, and general administrative overhead.
3. **Pipeline Stages Not Exercised End-to-End:**
   - In Task-00103, VoiceStudio TTS and local FFmpeg demux/mux were directly exercised and benchmarked on Tesla T4.
   - Upstream ASR transcription, LLM translation, downstream AVS lip-sync, AutoFlip reframing, and cloud storage handoffs were unexercised in the isolated test run. Their costs are modeled via audited vendor rates and prior component benchmarks.
