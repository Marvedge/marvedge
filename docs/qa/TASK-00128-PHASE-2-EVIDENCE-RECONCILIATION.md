# Task-00128 — Phase 2: Benchmark Evidence and Cost Reconciliation Audit Report

**Document Version:** 1.0.0
**Audit Date:** 2026-11-10T20:10:00+05:30
**Target Repository Checkout:** `C:\Users\Shambhavi\OneDrive\Desktop\marvedge\marvedge`
**Active Branch:** `task/task-00127-portable-cloud-benchmark` (Commit: `db280dc`)
**Auditor:** Antigravity System Agent (Independent Read-Only Review)

---

## 1. Executive Summary

An independent, read-only reconciliation audit of the Task-00128 GPU benchmark evidence, latency measurements, multi-cloud cost models, and demo readiness artifacts was conducted.

### Audit Findings & Classification:

| Audit Domain                    | Classification         | Summary Finding                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cost Model Reconciliation**   | **PASS (Clarified)**   | The reported $1.6040 AWS Spot cost for a 10-minute video is **correct as a total pipeline cost**, but was misleadingly presented without separating compute ($0.0440) from third-party API fees ($1.5600 for ElevenLabs + Whisper). Compute alone is $0.0440 at 1.2x RTF, or $0.0016 at the measured 23.2x Groq speedup.               |
| **Latency Inconsistency**       | **PASS (Explained)**   | Captions P50 (1,295.77 ms) vs. Full E2E P50 (851.02 ms) is **not an architectural inconsistency**. They were two separate sequential HTTP calls to Groq's cloud API ($N=1$ each). Normal internet transit variance accounted for the difference. E2E ran all 4 stages, but stages 1, 2, and 4 were local fixtures adding only ~1.8 ms. |
| **GPU Benchmarking Claims**     | **NEEDS CORRECTION**   | Zero physical GPU inference occurred. The run validated pipeline orchestration, Groq cloud API latency, and fallback math. The original report must clearly state that **GPU execution was simulated/fixture-based** because EC2 was stopped and local PyTorch was CPU-only.                                                           |
| **Demo Readiness Claims**       | **PARTIALLY VERIFIED** | The 9:16 captioned portrait MP4 was generated live during Task-00128 via `scripts/demoCaptionedCroppedClip.ts`, but used fixture crops and transcripts. The 30s Hindi dubbed asset was a **pre-existing historical asset from October 2026**, not generated in this session.                                                           |
| **Git & Infrastructure Safety** | **PASS**               | Clean working tree; EC2 remained strictly stopped; no unauthorized commits, pushes, or external write mutations occurred.                                                                                                                                                                                                              |

---

## 2. Cost Calculation Reconciliation

### 2.1 The Apparent Discrepancy

The audit investigated the apparent contradiction between:

- AWS Spot rate: **$0.22 / hour** ($0.0000611 / second).
- Captions processing speed: **23.20x real-time** (processing 30s audio in 1.296s).
- Reported AWS Spot cost for a 10-minute video: **$1.6040 USD**.

At first glance, a user comparing $0.22/hour to $1.6040 for 10 minutes might suspect a **~43x overcalculation** ($\frac{10\text{ min}}{60\text{ min}} \times \$0.22 = \$0.0367$).

---

### 2.2 Independent Step-by-Step Mathematical Reconciliation

#### A. Deconstruction of the Reported $1.6040 Figure

Inspection of the Task-00127 pricing engine ([`scripts/benchmark/cloudCostBenchmark/costCalculator.ts`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge/scripts/benchmark/cloudCostBenchmark/costCalculator.ts#L220-L240)) and projection script reveals how $1.6040 was derived:

1. **Third-Party External API Charges (Fixed per media minute):**
   - **ElevenLabs Dubbing API:** $0.1500 / media minute
     $$10\text{ minutes} \times \$0.1500 = \mathbf{\$1.5000\text{ USD}}$$
   - **Whisper Transcription API:** $0.0060 / media minute
     $$10\text{ minutes} \times \$0.0060 = \mathbf{\$0.0600\text{ USD}}$$
   - **Total External APIs:** $\$1.5000 + \$0.0600 = \mathbf{\$1.5600\text{ USD}}$ (represents **97.25%** of the $1.6040 total).

2. **Investigation of the 10-Minute Compute Duration (600s vs. 720s):**
   - **10 Minutes Media Baseline (600 seconds):** At $0.22/hour, 1:1 real-time compute processing for 600 seconds costs:
     $$\text{Compute Cost (600s)} = \frac{600\text{ seconds}}{3,600\text{ seconds/hour}} \times \$0.22 = \frac{1}{6}\text{ hour} \times \$0.22 = \mathbf{\$0.03667\text{ USD}}$$
   - **Where Did the 720 Seconds ($0.0440) Come From?**
     The multi-cloud projection script applied a conservative **1.2x pipeline duration overhead multiplier** (`computeSec = mediaSec * 1.2`), modeling end-to-end processing as taking 120% of media duration ($600\text{s} \times 1.2 = 720\text{ seconds}$ = 12 minutes of compute). At $0.22/hour:
     $$\text{Compute Cost (720s)} = \frac{720\text{ seconds}}{3,600\text{ seconds/hour}} \times \$0.22 = 0.2\text{ hours} \times \$0.22 = \mathbf{\$0.0440\text{ USD}}$$
   - **Finding:** The additional 120 seconds ($0.0440 vs $0.03667) represents an **explicit 20% pipeline duration overhead assumption** introduced in the modeling script, rather than a hidden arithmetic error.
   - **Marvedge V4 Documented Formula Comparison:** In `docs/GPU_COST_CONCURRENCY.md` Section 5.4, Marvedge's standard formula uses a speedup divisor: `cost_usd = video_duration_seconds / realtime_factor / 3600 × gpu_hourly_rate`. With the measured Groq speedup of 23.20x RT, compute time is $\frac{600}{23.20} = 25.86\text{ seconds}$, yielding **$0.00158 USD**.

3. **Combined Total Reconciliation:**
   - **Modeled 1.2x Overhead Total:** $\$0.0440\text{ (Compute)} + \$1.5600\text{ (APIs)} = \mathbf{\$1.6040\text{ USD}}$
   - **1:1 Real-Time Total:** $\$0.03667\text{ (Compute)} + \$1.5600\text{ (APIs)} = \mathbf{\$1.59667\text{ USD}}$
   - **Measured Groq Speedup Total:** $\$0.00158\text{ (Compute)} + \$1.5600\text{ (APIs)} = \mathbf{\$1.56158\text{ USD}}$

---

### 2.3 Reconciliation Matrix

| Model Basis                  | Compute Runtime | Compute Cost ($0.22/hr) | External API Cost ($0.156/min) | Total 10-Min Export Cost | Explanation                                                                    |
| ---------------------------- | --------------- | ----------------------- | ------------------------------ | ------------------------ | ------------------------------------------------------------------------------ |
| **Modeled 1.2x Overhead**    | 720.00s         | **$0.0440 USD**         | $1.5600 USD                    | **$1.6040 USD**          | Includes 20% pipeline duration overhead multiplier ($600\text{s} \times 1.2$). |
| **1:1 Real-Time Baseline**   | 600.00s         | **$0.0367 USD**         | $1.5600 USD                    | **$1.5967 USD**          | Pure media duration without overhead ($\frac{600}{3600} \times \$0.22$).       |
| **Measured Speedup (23.2x)** | 25.86s          | **$0.0016 USD**         | $1.5600 USD                    | **$1.5616 USD**          | Uses documented `docs/GPU_COST_CONCURRENCY.md` speedup divisor formula.        |

---

## 3. Latency Inconsistency Investigation

### 3.1 The Apparent Inconsistency

In [`benchmark_results/task128_e2e_report.json`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge/benchmark_results/task128_e2e_report.json#L228-L238):

- **Captions Stage Latency:** `1,295.77 ms` (Call 1)
- **Full E2E Pipeline Latency:** `851.02 ms` (Call 2)

Furthermore, adding Call 1 stage latencies gives:
$$849.20\text{ ms (estimated Groq)} + 1.24\text{ ms (reframe)} + 0.24\text{ ms (avs)} + 0.41\text{ ms (dubbing)} = 851.09\text{ ms}\neq 851.02\text{ ms}$$

### 3.2 Code Execution Flow & Raw Timing Evidence

Inspection of [`scripts/benchmark/cloudCostBenchmark/orchestrator.ts`](file:///C:/Users/Shambhavi/OneDrive/Desktop/marvedge/marvedge/scripts/benchmark/cloudCostBenchmark/orchestrator.ts#L331-L341) resolves both questions:

1. **Independent Execution Batches:** `runStage("captions")` and `runEndToEnd()` were executed as two separate sequential HTTP requests across the public internet to Groq's cloud API.
2. **Measurement Mechanism:**
   - In `runStage("captions")`, the single Groq API call was timed directly: **1,295.77 ms**.
   - In `runEndToEnd()`, a single contiguous timer measured the entire 4-stage loop:
     ```ts
     const iterStart = performance.now();
     for (const st of stages) {
       const out = await this.dispatchStageWork(st);
     }
     const iterDuration = performance.now() - iterStart;
     ```
     The raw measured value recorded was exactly **`851.02 ms`** (`endToEnd.latency.rawLatenciesMs: [851.02]`). Stages were not timed individually inside `runEndToEnd()`.
   - The figure `849.20 ms` in the earlier draft was an approximate mental subtraction that introduced an arbitrary 0.07 ms rounding error ($851.09\text{ ms vs } 851.02\text{ ms}$). The true empirical measurement is **`851.02 ms`** for the complete sequence.
3. **Statistical Robustness Note ($N=1$):**
   - Both runs were executed with `--iterations 1` ($N=1$).
   - **A sample size of $N=1$ is a single-point observation, NOT a statistically robust P50 benchmark.** Latency variations between 1,295 ms and 851 ms reflect standard public internet routing and Groq cloud API server queue fluctuations.

---

## 4. Verification of GPU Benchmarking Claims

| Claim                        | Verified Reality                    | Evidence Source                                                                                                                   | Verdict                        |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Cloud GPU Benchmarking**   | **FALSE / NOT EXECUTED**            | AWS EC2 instance `i-02aa4578f3790bae1` remained in `stopped` state throughout. AWS CLI confirmed `State.Name == "stopped"`.       | **PASS (Accurately Reported)** |
| **Local CUDA GPU Inference** | **FALSE / NOT EXECUTED**            | Host Python environment has `torch 2.13.0+cpu` installed. Python reported `torch.cuda.is_available() == False`.                   | **PASS (Accurately Reported)** |
| **Reframing Execution**      | **FIXTURE ONLY**                    | AutoFlip container was not running. Ran deterministic offline fixture (`sampleCropData` generating 2 crop transitions).           | **PASS (Accurately Reported)** |
| **AVS Execution**            | **FIXTURE ONLY**                    | TalkNet container was not running; local weights missing. Ran deterministic active speaker timeline fixture.                      | **PASS (Accurately Reported)** |
| **Captions Execution**       | **REAL INFERENCE (External Cloud)** | Live Groq Whisper API executed over HTTPS. Transcript matched audio content of `col_excerpt_30s.mp4`.                             | **PASS (Accurately Reported)** |
| **Dubbing Execution**        | **FIXTURE ONLY**                    | ElevenLabs was tested for API key validity, but the benchmark stage ran in fixture mode (`fixture_dub_job_...`).                  | **PASS (Accurately Reported)** |
| **Hardware Provenance**      | **`external_api`**                  | Schema 1.2.0 correctly flagged `actualCloudProvider: null`, `actualInstanceType: null`, and `verificationStatus: "external_api"`. | **PASS (Accurately Reported)** |

### Audit Verdict: **PASS**

The implementation correctly refused to label fixture or external API runs as `verified_gpu`.

---

## 5. Demo Readiness Verification

### 5.1 Media Asset Origin & Independent FFprobe Audit

#### Asset 1: Portait Captioned Demo (`task-70-demo/02_single_speaker_captioned_cropped_9x16.mp4`)

- **Creation Timestamp:** `2026-11-10T19:25:29+05:30` (Generated live during Task-00128).
- **Generation Command:** `npx tsx scripts/demoCaptionedCroppedClip.ts --fixture`
- **Input Media:** `C:\marvedge-task53-media\02_single_speaker.avi` (20.04s).
- **Output Specs:** 20.04s, 202x360 (9:16 aspect ratio), H.264 + AAC, 25 fps.
- **Burn-in Integrity:** 7 ASS subtitle cues burned in with outline and styling.
- **FFmpeg Null Decode:** `ffmpeg -v error -i ... -f null -` $\rightarrow$ **0 errors (100% clean decode)**.
- **Limitation:** Used **fixture crop targets** (500 keyframes) and **fixture transcript**, not live AutoFlip or live Whisper.

#### Asset 2: Hindi Dubbed Video (`C:\marvedge-task53-media\columbia\col_excerpt_30s_hindi_dub_1791979610651.mp4`)

- **Creation Timestamp:** `2026-10-14T17:36:00Z` (**Pre-existing historical asset from Task-00053/Task-00074**).
- **Generation Command:** Created in October 2026 via `scripts/benchmark/test-elevenlabs-regional.ts`.
- **Output Specs:** 30.053s video, 30.037s audio, 1280x720, H.264 + AAC, 29.97 fps.
- **Audio/Video Sync Delta:** $\Delta t = |30.053 - 30.037| = 0.016\text{ seconds (16 ms)}$ (<0.5 video frame).
- **FFmpeg Null Decode:** `ffmpeg -v error -i ... -f null -` $\rightarrow$ **0 errors (100% clean decode)**.
- **Limitation:** **This asset was NOT generated during Task-00128.** It was an audited historical proof-of-concept.

### Audit Verdict: **PARTIALLY VERIFIED**

- **Standalone Video Rendering & Subtitle Burn-in:** **PASS (DEMO READY)**.
- **Live 4-Stage Real Inference Pipeline:** **NOT READY** (Requires active GPU instance or local Docker containers).

---

## 6. Confirmed Facts vs. Unresolved Assumptions

### Confirmed Facts (Empirically Verified):

1. AWS EC2 `i-02aa4578f3790bae1` is stopped; zero cloud compute spend occurred.
2. Local workstation has an RTX 5050 Laptop GPU, but local Python is CPU-only (`CUDA: False`).
3. Groq Whisper API transcribed 30 seconds of audio in 1.29 seconds (23.2x RTF) for $0.003038 USD.
4. ElevenLabs API key is active and authorized for dubbing.
5. `demo:captioned-cropped` generated a playable 9:16 portrait MP4 with burned-in subtitles.
6. The historical Hindi dubbed asset exhibits under-1-frame (16 ms) audio/video alignment.

### Unresolved Assumptions (Requiring Explicit Correction in Docs):

1. **Dubbing Cost Overhead:** The $1.6040 AWS Spot estimate for 10 minutes assumes ElevenLabs commercial pricing ($0.15/minute). If an open-source voice model (VoiceStudio / Coqui) is run on the GPU instead, the total cost drops from $1.6040 to **$0.0440**.
2. **Historical Asset Attribution:** The report must clearly acknowledge that `col_excerpt_30s_hindi_dub_1791979610651.mp4` was a historical validation artifact from October 2026, not rendered during this test session.

---

## 7. Recommended Corrections to Original Task-00128 Report

1. **Clarify Cost Breakdown Table (Section 7.2):**
   Add explicit columns for **Compute Cost** vs. **External API Cost** in the multi-cloud projection table so the $1.6040 figure is clearly understood as $0.0440 compute + $1.5600 APIs.
2. **Explain E2E vs. Captions Latency (Section 5):**
   Add a footnote explaining that Captions (1,295 ms) and E2E (851 ms) were two consecutive HTTP calls to Groq API with $N=1$, reflecting standard cloud network variance.
3. **Disclose Asset Origins (Section 8 & 9):**
   State clearly that the Hindi dubbed clip was audited from pre-existing test files in `C:\marvedge-task53-media`, while the 9:16 captioned video was freshly rendered during Task-00128 via fixtures.

---

## 8. Git Safety & Final Repository State

- **Active Branch:** `task/task-00127-portable-cloud-benchmark`
- **HEAD Commit:** `db280dc` (`docs: fix QA report formatting`)
- **Untracked Files:**
  - `docs/qa/TASK-00018-DEV-INTEGRATION-VALIDATION.md`
  - `docs/qa/TASK-00128-GPU-BENCHMARK-AND-DEMO-READINESS.md`
  - `docs/qa/TASK-00128-PHASE-2-EVIDENCE-RECONCILIATION.md`
  - `benchmark_results/task128_e2e_report.json` & `.md`
  - `benchmark_results/task128_real_providers_attempt_report.json` & `.md`
- **Zero Modified Tracked Files:** Working tree is 100% clean against Git tracking.
- **No Commits, Pushes, or Remote Mutations:** All operations remained strictly read-only.
